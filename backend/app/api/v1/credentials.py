"""Settings API for per-appid WeChat AppSecret (``/api/v1/settings/credentials``).

Same-origin, no auth (single-instance model). Secrets are write-only from the
UI's point of view: PUT accepts them, GET only lists configured appids.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.exceptions import AppError
from app.core.response import success
from app.services import credentials, wechat_service

router = APIRouter(prefix="/settings", tags=["settings"])


class CredentialPutReq(BaseModel):
    appid: str = ""
    # ``None`` keeps the stored secret, ``""`` clears it, non-empty sets it.
    appsecret: str | None = None


@router.get("/credentials")
async def get_credentials():
    """List configured appids (never returns a secret)."""
    return success(credentials.redacted())


@router.put("/credentials")
async def put_credential(req: CredentialPutReq):
    """Set/clear/keep the secret for an appid; bust its cached token on change."""
    appid = (req.appid or "").strip()
    if not appid:
        raise AppError(code=400, message="缺少 appid")
    if req.appsecret is None:
        return success(credentials.redacted())  # keep -> no-op
    credentials.set_secret(appid, req.appsecret)  # "" clears, else sets
    wechat_service._token_cache.pop(appid, None)  # stored secret changed
    return success(credentials.redacted())
