from fastapi import APIRouter
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.core.exceptions import AppError
from app.core.response import success
from app.services import wechat_service

router = APIRouter(prefix="/config", tags=["config"])


class ConfigReq(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    appid: str = Field(validation_alias=AliasChoices("appid", "app_id"))
    appsecret: str = Field(default="", validation_alias=AliasChoices("appsecret", "app_secret"))


def _mask_config(config: dict) -> dict:
    appsecret = config.get("appsecret", "")
    return {
        "appid": config.get("appid", ""),
        "appsecret": "****" + appsecret[-4:] if appsecret else "",
        "configured": bool(config.get("appid") and appsecret),
        "account_name": config.get("account_name", ""),
    }


def _resolve_config(req: ConfigReq) -> tuple[str, str]:
    current = wechat_service.load_config()
    appid = req.appid.strip()
    appsecret = req.appsecret.strip()

    if not appid:
        raise AppError(code=400, message="WeChat AppID is required")

    masked_secret = _mask_config(current)["appsecret"]
    if not appsecret or (masked_secret and appsecret == masked_secret):
        appsecret = current.get("appsecret", "")

    if not appsecret:
        raise AppError(code=400, message="WeChat AppSecret is required")

    return appid, appsecret


@router.get("")
async def get_config():
    config = wechat_service.load_config()
    return success(_mask_config(config))


@router.put("")
async def update_config(req: ConfigReq):
    appid, appsecret = _resolve_config(req)
    config = wechat_service.save_config(appid, appsecret)
    return success(_mask_config(config), message="saved")


@router.post("/test")
async def test_connection(req: ConfigReq):
    """Save config and actually verify credentials against WeChat API."""
    appid, appsecret = _resolve_config(req)
    config = wechat_service.save_config(appid, appsecret)
    wechat_service.get_access_token()
    return success({
        **_mask_config(config),
        "valid": True,
        "account_name": config.get("account_name", "") or "已配置公众号",
    })
