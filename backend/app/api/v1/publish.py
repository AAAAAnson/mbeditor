from fastapi import APIRouter
from pydantic import BaseModel

from app.core.response import success
from app.services import publish_adapter
from app.services.legacy_render_pipeline import preview_html

router = APIRouter(prefix="/publish", tags=["publish"])


class PreviewReq(BaseModel):
    html: str
    css: str = ""


class ProcessForCopyReq(BaseModel):
    html: str
    css: str = ""
    # appid/appsecret 只在需要把图片上传到公众号素材库时才用。没传或为空字符串
    # 时后端会跳过上传步骤，返回仅做本地净化 + CSS inline 的 HTML。
    appid: str = ""
    appsecret: str = ""


@router.post("/preview")
async def preview_wechat(req: PreviewReq):
    return success({"html": preview_html(req.html, req.css)})


@router.post("/process-for-copy")
async def process_html_for_copy(req: ProcessForCopyReq):
    processed = publish_adapter.process_html_for_copy(
        req.html, req.css, appid=req.appid, appsecret=req.appsecret,
    )
    return success({"html": processed})
