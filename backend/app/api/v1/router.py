import time

import httpx
from fastapi import APIRouter

from app.api.v1.wechat_stateless import router as wechat_stateless_router
from app.api.v1.publish import router as publish_router
from app.api.v1.validate import router as validate_router
from app.core.config import APP_VERSION, GITHUB_REPO
from app.core.response import success

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(wechat_stateless_router)
api_router.include_router(publish_router)
api_router.include_router(validate_router)

_version_cache: dict = {"latest": "", "checked_at": 0}


@api_router.get("/version")
async def get_version():
    return success({"version": APP_VERSION, "repo": GITHUB_REPO})


@api_router.get("/version/check")
async def check_version():
    now = time.time()
    if _version_cache["latest"] and now - _version_cache["checked_at"] < 3600:
        latest = _version_cache["latest"]
    else:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                    headers={"Accept": "application/vnd.github.v3+json"},
                )
                data = r.json()
                latest = data.get("tag_name", "").lstrip("v")
                if latest:
                    _version_cache["latest"] = latest
                    _version_cache["checked_at"] = now
        except Exception:
            latest = ""

    def _norm(v: str) -> str:
        parts = v.split(".")
        while len(parts) > 1 and parts[-1] == "0":
            parts.pop()
        return ".".join(parts)

    has_update = bool(latest and _norm(latest) != _norm(APP_VERSION))
    return success({"current": APP_VERSION, "latest": latest or APP_VERSION, "has_update": has_update})
