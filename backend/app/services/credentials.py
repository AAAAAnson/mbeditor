"""Per-appid WeChat AppSecret store (``<APP_DATA_DIR>/credentials.json``).

Mirrors ``app.services.gateway`` persistence: atomic write (tmp + os.replace),
chmod 0600, lazy data-dir resolution. Secrets live only in the deployer's named
volume; :func:`redacted` returns appids but never a secret. Plaintext at rest by
design decision (same posture as the gateway Bearer token).
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

_CONFIG_FILENAME = "credentials.json"


def _data_dir() -> Path:
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _config_path() -> Path:
    return _data_dir() / _CONFIG_FILENAME


def load() -> dict[str, str]:
    """Read ``credentials.json``; missing/corrupt/invalid -> ``{}`` (degrade)."""
    path = _config_path()
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("credentials.json is corrupt; ignoring")
        return {}
    if not isinstance(data, dict):
        return {}
    secrets = data.get("secrets")
    if not isinstance(secrets, dict):
        return {}
    return {str(k): str(v) for k, v in secrets.items() if isinstance(v, str) and v}


def get_secret(appid: str) -> str | None:
    appid = (appid or "").strip()
    if not appid:
        return None
    return load().get(appid) or None


def _save(secrets: dict[str, str]) -> None:
    path = _config_path()
    payload = {"version": 1, "secrets": secrets}
    tmp = path.with_suffix(".json.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, path)
    except OSError as exc:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise AppError(
            code=500,
            message=f"写入凭据失败,请检查数据卷 {path.parent} 是否已挂载且可写: {exc}",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def set_secret(appid: str, secret: str) -> None:
    """Set (non-empty) or clear (empty) the secret for ``appid``, atomically."""
    appid = (appid or "").strip()
    secret = (secret or "").strip()
    secrets = load()
    if not secret:
        secrets.pop(appid, None)
    else:
        secrets[appid] = secret
    _save(secrets)


def clear_secret(appid: str) -> None:
    set_secret(appid, "")


def redacted() -> dict:
    """Settings-API view: configured appids only, never a secret."""
    return {"configured": sorted(load().keys())}
