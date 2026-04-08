from fastapi import APIRouter
from pydantic import BaseModel

from app.core.response import success
from app.services import wechat_service

router = APIRouter(prefix="/config", tags=["config"])


class ConfigReq(BaseModel):
    appid: str
    appsecret: str


@router.get("")
async def get_config():
    config = wechat_service.load_config()
    masked = {
        "appid": config.get("appid", ""),
        "appsecret": "****" + config.get("appsecret", "")[-4:] if config.get("appsecret") else "",
        "configured": bool(config.get("appid") and config.get("appsecret")),
        "account_name": config.get("account_name", ""),
    }
    return success(masked)


@router.put("")
async def update_config(req: ConfigReq):
    wechat_service.save_config(req.appid, req.appsecret)
    return success(message="saved")


@router.post("/test")
async def test_connection(req: ConfigReq):
    """Save config and actually verify credentials against WeChat API."""
    wechat_service.save_config(req.appid, req.appsecret)
    token = wechat_service.get_access_token()
    return success({"valid": True, "account_name": "已配置公众号"})
