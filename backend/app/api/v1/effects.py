"""Interactive effect registry endpoints (P1-1).

Always returns HTTP 200 (``core.response.success(...)``) — render failure is
signaled via ``data.status`` so the editor can render an error panel without
juggling axios error handling.
"""
import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.response import success
from app.services.effect_registry import list_effects, render_effect

router = APIRouter(prefix="/agent", tags=["agent"])

# Effect ids are stable [a-z0-9-] slugs (contract §1). Cap the path segment so
# a pathologically long URL can't allocate a large error string downstream;
# anything outside the allowlist is reported via the normal error payload.
_EFFECT_ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")


class RenderEffectReq(BaseModel):
    textSlots: dict[str, str] = Field(default_factory=dict)
    imageSlots: dict[str, str] = Field(default_factory=dict)
    colorSlots: dict[str, str] = Field(default_factory=dict)
    timingParams: dict[str, float] = Field(default_factory=dict)


@router.get("/effects")
async def get_effects():
    return success({"effects": list_effects()})


@router.post("/effects/{effect_id}/render")
async def render_effect_endpoint(effect_id: str, req: RenderEffectReq):
    if not _EFFECT_ID_RE.match(effect_id):
        return success({
            "status": "error",
            "html": "",
            "message": f"未知效果 id: {effect_id[:40]}",
            "warnings": [],
            "report": None,
        })
    result = render_effect(
        effect_id,
        text_slots=req.textSlots,
        image_slots=req.imageSlots,
        color_slots=req.colorSlots,
        timing_params=req.timingParams,
    )
    return success(result)
