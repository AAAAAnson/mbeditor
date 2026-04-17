import re
from pathlib import Path

from app.core.config import settings
from app.services import wechat_service


def process_article_images(html: str) -> str:
    return wechat_service.process_html_images(html, settings.IMAGES_DIR)


def resolve_cover_media_id(article: dict, processed_html: str) -> str:
    cover_path = article.get("cover", "")
    if cover_path:
        local_cover = Path(settings.IMAGES_DIR) / cover_path.removeprefix("/images/")
        if local_cover.exists():
            return wechat_service.upload_thumb_to_wechat(
                local_cover.read_bytes(),
                local_cover.name,
            )

    match = re.search(r'src="([^"]+)"', processed_html)
    if not match:
        return ""

    src = match.group(1)
    try:
        import httpx

        resp_bytes = httpx.get(src, timeout=15).content
        return wechat_service.upload_thumb_to_wechat(resp_bytes, "cover.jpg")
    except Exception:
        return ""
