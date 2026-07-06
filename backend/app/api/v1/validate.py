"""WeChat compatibility validation endpoint.

Thin FastAPI wrapper over ``app.services.svg_validator``. Exposed so the
editor UI can pre-flight HTML before pushing to ``/wechat/draft`` and so
agents can self-correct generated content.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.response import success
from app.services.svg_validator import validate_html

router = APIRouter(prefix="/wechat", tags=["wechat"])


class ValidateReq(BaseModel):
    html: str = ""


@router.post("/validate")
async def validate_wechat_html(req: ValidateReq):
    report = validate_html(req.html)
    return success(report)
