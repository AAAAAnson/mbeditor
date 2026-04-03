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
    }
    return success(masked)


@router.put("")
async def update_config(req: ConfigReq):
    wechat_service.save_config(req.appid, req.appsecret)
    return success(message="saved")
