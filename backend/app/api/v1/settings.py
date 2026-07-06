"""Settings API for the WeChat relay gateway (``/api/v1/settings/gateway``).

Three endpoints, all same-origin (no auth, single-instance model -- whoever can
reach the backend can already read the appsecret):

* ``GET  /settings/gateway``      -> redacted view (never returns token / PEM body)
* ``PUT  /settings/gateway``      -> persist config; ``null`` keeps, ``""`` clears
* ``POST /settings/gateway/test`` -> probe the (pending or stored) gateway, classify

The redaction contract lives in :func:`app.services.gateway.effective_redacted`;
this router just wraps it. Secrets are write-only from the UI's point of view --
the token and CA PEM are accepted on PUT but never echoed back, and the test
endpoint never includes them in its ``detail`` string.
"""
from __future__ import annotations

import ssl

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.exceptions import AppError
from app.core.response import success
from app.services import gateway

router = APIRouter(prefix="/settings", tags=["settings"])


class GatewayPutReq(BaseModel):
    enabled: bool = False
    transport: str = "direct"
    base: str = ""
    # ``None`` = keep stored value, ``""`` = clear, non-empty = set.
    token: str | None = None
    caPem: str | None = None


class GatewayTestReq(BaseModel):
    base: str = ""
    token: str | None = None
    caPem: str | None = None
    appid: str = ""
    appsecret: str = ""


@router.get("/gateway")
async def get_gateway():
    """Return the redacted effective config (stored > env > direct)."""
    return success(gateway.effective_redacted())


@router.put("/gateway")
async def put_gateway(req: GatewayPutReq):
    """Persist gateway config with leave-blank-keeps semantics.

    ``token``/``caPem`` of ``None`` retain whatever is already stored; ``""``
    clears them; a non-empty value sets them. Validation: an enabled
    https-gateway needs an ``https://`` base, and any supplied caPem must parse.
    """
    existing = gateway.load_stored()

    transport = (req.transport or "direct").strip()
    base = (req.base or "").strip()

    # Merge secrets: None -> keep existing (or empty if none stored).
    if req.token is None:
        token = existing.token if existing else ""
    else:
        token = req.token
    if req.caPem is None:
        ca_pem = existing.ca_pem if existing else ""
    else:
        ca_pem = req.caPem

    if req.enabled and transport == "https-gateway":
        if not base:
            raise AppError(code=400, message="启用网关时必须填写网关地址(base)。")
        if not base.startswith("https://"):
            raise AppError(code=400, message="网关地址必须以 https:// 开头。")

    # Any supplied PEM must be parseable so we fail at save time, not publish time.
    if ca_pem:
        try:
            gateway.cert_fingerprint(ca_pem)
        except Exception:  # noqa: BLE001 - never echo the bad PEM back
            raise AppError(code=400, message="证书 PEM 无法解析,请检查内容。")

    cfg = gateway.GatewayConfig(
        enabled=bool(req.enabled),
        transport=transport,
        base=base,
        token=token,
        ca_pem=ca_pem,
    )
    gateway.save_stored(cfg)
    gateway._reset_caches()
    return success(gateway.effective_redacted())


@router.post("/gateway/test")
async def test_gateway(req: GatewayTestReq):
    """Probe the gateway once and classify reachability / TLS / token.

    Builds a transport from the pending form values (falling back to stored when
    a field is blank), then POSTs ``{base}/cgi-bin/stable_token``:

    * connect error / timeout -> ``reachable=false``
    * TLS / SSL error         -> ``tls=fail`` (``reachable=false``)
    * HTTP 200                -> ``reachable=true``, ``tls=ok``; ``token`` is
      ``ok`` when an ``access_token`` came back, ``fail`` on a WeChat error code,
      else ``skipped`` (no usable credentials supplied).
    """
    stored = gateway.load_stored()

    base = (req.base or "").strip()
    if not base and stored:
        base = (stored.base or "").strip()

    if req.token is not None:
        token = req.token
    else:
        token = stored.token if stored else ""

    if req.caPem is not None:
        ca_pem = req.caPem
    else:
        ca_pem = stored.ca_pem if stored else ""

    if not base:
        return success(
            {
                "reachable": False,
                "tls": "fail",
                "token": "skipped",
                "detail": "未提供网关地址。",
            }
        )

    # Validate the PEM up front; a bad cert is a config error, not a TLS failure.
    verify: "None | ssl.SSLContext" = None
    if ca_pem:
        try:
            verify = gateway._ssl_context_cached(ca_pem)
        except Exception:  # noqa: BLE001
            return success(
                {
                    "reachable": False,
                    "tls": "fail",
                    "token": "skipped",
                    "detail": "证书 PEM 无法解析。",
                }
            )

    transport = gateway.HttpsGatewayTransport(base, token, verify)
    url = f"{transport.base_url}/cgi-bin/stable_token"

    payload = {"grant_type": "client_credential"}
    have_creds = bool(req.appid and req.appsecret)
    if have_creds:
        payload["appid"] = req.appid
        payload["secret"] = req.appsecret

    try:
        resp = httpx.post(url, json=payload, timeout=10, **transport.httpx_kwargs())
    except ssl.SSLError as exc:
        return success(
            {
                "reachable": False,
                "tls": "fail",
                "token": "skipped",
                "detail": f"TLS 握手失败:{type(exc).__name__}",
            }
        )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        # httpx may wrap an ssl.SSLError inside a ConnectError -> classify as TLS.
        if _is_tls_error(exc):
            return success(
                {
                    "reachable": False,
                    "tls": "fail",
                    "token": "skipped",
                    "detail": f"TLS 握手失败:{type(exc).__name__}",
                }
            )
        return success(
            {
                "reachable": False,
                "tls": "ok",
                "token": "skipped",
                "detail": "无法连接到网关(连接被拒绝或超时)。",
            }
        )
    except Exception as exc:  # noqa: BLE001
        # Any other transport error -- still classify TLS if it wraps an SSLError.
        if _is_tls_error(exc):
            return success(
                {
                    "reachable": False,
                    "tls": "fail",
                    "token": "skipped",
                    "detail": f"TLS 握手失败:{type(exc).__name__}",
                }
            )
        return success(
            {
                "reachable": False,
                "tls": "ok",
                "token": "skipped",
                "detail": f"请求失败:{type(exc).__name__}",
            }
        )

    if resp.status_code != 200:
        return success(
            {
                "reachable": True,
                "tls": "ok",
                "token": "skipped",
                "detail": f"网关返回 HTTP {resp.status_code}。",
            }
        )

    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = {}

    if isinstance(body, dict) and body.get("access_token"):
        token_status = "ok"
        detail = "网关可达,成功取得 access_token。"
    elif not have_creds:
        token_status = "skipped"
        detail = "网关可达(未提供 appid/appsecret,跳过取 token)。"
    else:
        token_status = "fail"
        errcode = body.get("errcode") if isinstance(body, dict) else None
        detail = f"网关可达,但取 token 失败(errcode={errcode})。"

    return success(
        {
            "reachable": True,
            "tls": "ok",
            "token": token_status,
            "detail": detail,
        }
    )


def _is_tls_error(exc: BaseException) -> bool:
    """Walk the exception cause/context chain looking for an ``ssl.SSLError``."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, ssl.SSLError):
            return True
        cur = cur.__cause__ or cur.__context__
    return False
