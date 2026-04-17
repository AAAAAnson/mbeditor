import logging

from app.core.exceptions import AppError
from app.services import article_service
from app.services.css_inline import inline_css, strip_wechat_unsupported_css
from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.media_uploader import process_article_images, resolve_cover_media_id
from app.services.wechat_sanitize import sanitize_for_wechat
from app.services.wechat_publisher import create_article_draft, extract_source_url
from app.services.wechat_service import load_config


def process_article_html(article_id: str) -> str:
    article = article_service.get_article(article_id)
    processed = process_for_wechat(article.get("html", ""), article.get("css", ""))
    return process_article_images(processed)


def process_html_for_copy(html: str, css: str = "") -> str:
    config = load_config()
    if not config.get("appid") or not config.get("appsecret"):
        raise AppError(code=400, message="WeChat AppID/AppSecret not configured")

    processed = process_for_wechat(html, css)
    return process_article_images(processed)


def publish_draft_sync(article_id: str, author: str, digest: str) -> dict:
    """Synchronous publish logic - runs in thread pool to avoid blocking event loop."""
    logger = logging.getLogger(__name__)

    article = article_service.get_article(article_id)
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info(f"[publish] article_id={article_id}, title={article.get('title')!r}")
    logger.info(f"[publish] raw html length={len(html)}, css length={len(css)}")

    processed_html = process_for_wechat(html, css)
    logger.info(f"[publish] after CSS inline: length={len(processed_html)}")

    processed_html = process_article_images(processed_html)
    logger.info(f"[publish] after image upload: length={len(processed_html)}")

    thumb_media_id = resolve_cover_media_id(article, processed_html)
    source_url = extract_source_url(html)
    logger.info(f"[publish] thumb_media_id={thumb_media_id!r}, source_url={source_url!r}")

    return create_article_draft(
        article=article,
        processed_html=processed_html,
        thumb_media_id=thumb_media_id,
        source_url=source_url,
        author=author,
        digest=digest,
    )


# Backward-compatible aliases for existing imports/tests.
_strip_wechat_unsupported_css = strip_wechat_unsupported_css
_inline_css = inline_css
_sanitize_for_wechat = sanitize_for_wechat
_process_for_wechat = process_for_wechat
