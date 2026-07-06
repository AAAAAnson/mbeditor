"""Pluggable transport for WeChat API calls (Phase 1: direct / https-gateway).

``wechat_service`` no longer holds env constants at import time. Instead it asks
this module for the *current* transport via :func:`resolve` on each call, and the
transport supplies the httpx kwargs (base URL, Bearer header, TLS verify).

Resolution precedence (computed per call so stored config and env can change at
runtime / under tests):

1. Stored config (``<APP_DATA_DIR>/gateway.json``) when enabled and
   ``transport == "https-gateway"`` with a ``base`` -> HttpsGatewayTransport,
   verifying against the inline CA PEM (SSLContext) when one is configured.
2. Else env ``WECHAT_API_BASE`` non-empty -> HttpsGatewayTransport (back-compat
   with the existing NAS env deployment; ``verify`` stays the CA *path string*).
3. Else -> DirectTransport (https://api.weixin.qq.com).

Secrets (Bearer token, CA PEM) live only in the deployer's named volume. The
:func:`effective_redacted` view for the settings API never returns the token or
the PEM body -- only ``tokenConfigured`` / ``caConfigured`` / a cert fingerprint.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import ssl
from dataclasses import dataclass
from pathlib import Path

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

DIRECT_BASE = "https://api.weixin.qq.com"
_CONFIG_FILENAME = "gateway.json"

# caPem content hash -> SSLContext, so we don't rebuild the context per request.
_ssl_context_cache: dict[str, ssl.SSLContext] = {}


def _data_dir() -> Path:
    """Resolve the data directory on every access (read APP_DATA_DIR each call).

    Container: ``/app/data``. Local dev / tests: whatever ``APP_DATA_DIR`` points
    at. Read lazily (not frozen at import) so tests can monkeypatch the env.
    """
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _config_path() -> Path:
    return _data_dir() / _CONFIG_FILENAME


@dataclass
class GatewayConfig:
    enabled: bool
    transport: str
    base: str
    token: str
    ca_pem: str


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #
def load_stored() -> GatewayConfig | None:
    """Read ``gateway.json``; missing or corrupt -> ``None`` (degrade to env/direct)."""
    path = _config_path()
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("gateway.json is corrupt; degrading to env/direct")
        return None
    if not isinstance(data, dict):
        logger.warning("gateway.json is not an object; degrading to env/direct")
        return None
    return GatewayConfig(
        enabled=bool(data.get("enabled", False)),
        transport=str(data.get("transport", "direct")),
        base=str(data.get("base", "") or ""),
        token=str(data.get("token", "") or ""),
        ca_pem=str(data.get("caPem", "") or ""),
    )


def save_stored(cfg: GatewayConfig) -> None:
    """Atomically write ``gateway.json`` (tmp + os.replace) and chmod 0600.

    Raises :class:`AppError` when the data dir is missing or read-only, so the
    settings API surfaces a readable "check the volume mount" message instead of
    a bare 500. On failure no partial file is left where :func:`load_stored`
    could read it (the original ``gateway.json`` is untouched until os.replace).
    """
    path = _config_path()
    payload = {
        "version": 1,
        "enabled": bool(cfg.enabled),
        "transport": cfg.transport,
        "base": cfg.base,
        "token": cfg.token,
        "caPem": cfg.ca_pem,
    }
    tmp = path.with_suffix(".json.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            # Windows ignores chmod for these bits; best-effort only.
            pass
        os.replace(tmp, path)
    except OSError as exc:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise AppError(
            code=500,
            message=f"写入网关配置失败,请检查数据卷 {path.parent} 是否已挂载且可写: {exc}",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def clear_stored() -> None:
    """Remove ``gateway.json`` if present (idempotent)."""
    try:
        _config_path().unlink()
    except (FileNotFoundError, OSError):
        pass


# --------------------------------------------------------------------------- #
# Certificates / SSL contexts
# --------------------------------------------------------------------------- #
def cert_fingerprint(pem: str) -> str:
    """Return ``"SHA256:AB:CD:..."`` (uppercase, colon-separated) for a PEM cert.

    Raises ``ValueError`` if the PEM cannot be parsed (callers turn this into a
    400 at the API layer).
    """
    der = ssl.PEM_cert_to_DER_cert(pem)
    digest = hashlib.sha256(der).hexdigest().upper()
    return "SHA256:" + ":".join(digest[i : i + 2] for i in range(0, len(digest), 2))


def _ssl_context_cached(pem: str) -> ssl.SSLContext:
    """Build (and cache by PEM content) an SSLContext trusting the inline CA PEM."""
    key = hashlib.sha256(pem.encode("utf-8")).hexdigest()
    ctx = _ssl_context_cache.get(key)
    if ctx is None:
        ctx = ssl.create_default_context()
        ctx.load_verify_locations(cadata=pem)
        _ssl_context_cache[key] = ctx
    return ctx


def _reset_caches() -> None:
    """Clear in-process caches (tests only). load_stored is not cached."""
    _ssl_context_cache.clear()


# --------------------------------------------------------------------------- #
# Transports
# --------------------------------------------------------------------------- #
class Transport:
    """Base transport. ``base_url`` is the request base; ``httpx_kwargs`` are the
    extra kwargs merged into each ``httpx.post`` (headers / verify / proxies)."""

    base_url: str = DIRECT_BASE

    def httpx_kwargs(self) -> dict:
        return {}


class DirectTransport(Transport):
    """Direct to the official WeChat domain; no extra kwargs."""

    def __init__(self) -> None:
        self.base_url = DIRECT_BASE

    def httpx_kwargs(self) -> dict:
        return {}


class HttpsGatewayTransport(Transport):
    """Route via a fixed-IP HTTPS gateway.

    ``verify`` may be:
      * ``None``  -> no extra verify kwarg (httpx default trust store),
      * a ``str`` -> CA path string (env-mode back-compat),
      * an ``ssl.SSLContext`` -> built from an inline CA PEM (stored-mode).
    """

    def __init__(self, base: str, token: str, verify: "None | str | ssl.SSLContext") -> None:
        self.base_url = (base or "").rstrip("/")
        self._token = (token or "").strip()
        self._verify = verify

    def httpx_kwargs(self) -> dict:
        kwargs: dict = {}
        if self._token:
            kwargs["headers"] = {"Authorization": f"Bearer {self._token}"}
        if self._verify is not None:
            kwargs["verify"] = self._verify
        return kwargs


def resolve() -> Transport:
    """Resolve the active transport (stored > env > direct), computed per call."""
    cfg = load_stored()
    if cfg and cfg.enabled and cfg.transport == "https-gateway" and cfg.base:
        verify = _ssl_context_cached(cfg.ca_pem) if cfg.ca_pem else None
        return HttpsGatewayTransport(cfg.base, cfg.token, verify)

    env_base = (os.environ.get("WECHAT_API_BASE") or "").strip()
    if env_base:
        token = (os.environ.get("WECHAT_PROXY_TOKEN") or "").strip()
        ca = (os.environ.get("WECHAT_PROXY_CA") or "").strip() or None
        return HttpsGatewayTransport(env_base, token, ca)

    return DirectTransport()


# --------------------------------------------------------------------------- #
# Redacted view for the settings API
# --------------------------------------------------------------------------- #
def effective_redacted() -> dict:
    """Redacted view for ``GET /settings/gateway``.

    Never includes the token or the PEM body -- only booleans and a fingerprint.
    """
    cfg = load_stored()
    if cfg and cfg.enabled and cfg.transport == "https-gateway" and cfg.base:
        ca_fp = None
        if cfg.ca_pem:
            try:
                ca_fp = cert_fingerprint(cfg.ca_pem)
            except Exception:  # noqa: BLE001 - never leak a bad PEM, just omit fp
                ca_fp = None
        return {
            "transport": "https-gateway",
            "enabled": True,
            "base": cfg.base,
            "tokenConfigured": bool(cfg.token),
            "caConfigured": bool(cfg.ca_pem),
            "caFingerprint": ca_fp,
            "source": "stored",
        }

    env_base = (os.environ.get("WECHAT_API_BASE") or "").strip()
    if env_base:
        token = (os.environ.get("WECHAT_PROXY_TOKEN") or "").strip()
        ca_path = (os.environ.get("WECHAT_PROXY_CA") or "").strip()
        return {
            "transport": "https-gateway",
            "enabled": True,
            "base": env_base,
            "tokenConfigured": bool(token),
            "caConfigured": bool(ca_path),
            "caFingerprint": None,  # env mode uses a path, not inline PEM
            "source": "env",
        }

    return {
        "transport": "direct",
        "enabled": False,
        "base": "",
        "tokenConfigured": False,
        "caConfigured": False,
        "caFingerprint": None,
        "source": "direct",
    }
