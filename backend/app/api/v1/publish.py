from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.core.response import success
from app.services import article_service, wechat_service

router = APIRouter(prefix="/publish", tags=["publish"])


class PublishDraftReq(BaseModel):
    article_id: str
    author: Optional[str] = ""
    digest: Optional[str] = ""


@router.get("/html/{article_id}")
async def get_processed_html(article_id: str):
    article = article_service.get_article(article_id)
    html = article.get("html", "")
    css = article.get("css", "")
    return success({"html": html, "css": css, "title": article.get("title", "")})


@router.post("/process")
async def process_article(req: PublishDraftReq):
    article = article_service.get_article(req.article_id)
    html = article.get("html", "")
    processed_html = wechat_service.process_html_images(html, settings.IMAGES_DIR)
    return success({"html": processed_html})


@router.post("/draft")
async def publish_draft(req: PublishDraftReq):
    article = article_service.get_article(req.article_id)
    html = article.get("html", "")

    processed_html = wechat_service.process_html_images(html, settings.IMAGES_DIR)

    cover_path = article.get("cover", "")
    thumb_media_id = ""
    if cover_path:
        from pathlib import Path
        local_cover = Path(settings.IMAGES_DIR) / cover_path.removeprefix("/images/")
        if local_cover.exists():
            thumb_media_id = wechat_service.upload_thumb_to_wechat(
                local_cover.read_bytes(), local_cover.name
            )

    if not thumb_media_id:
        import re
        match = re.search(r'src="([^"]+)"', processed_html)
        if match:
            src = match.group(1)
            try:
                import httpx
                resp_bytes = httpx.get(src, timeout=15).content
                thumb_media_id = wechat_service.upload_thumb_to_wechat(resp_bytes, "cover.jpg")
            except Exception:
                pass

    result = wechat_service.create_draft(
        title=article.get("title", "Untitled"),
        html=processed_html,
        author=req.author or article.get("author", ""),
        digest=req.digest or article.get("digest", ""),
        thumb_media_id=thumb_media_id,
    )
    return success(result)
