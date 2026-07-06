"""Publish adapter - orchestrates the publish pipeline."""
import logging
from typing import Any

from app.services.legacy_render_pipeline import process_for_wechat
from app.services.svg_validator import validate_html
from app.services.wechat_copy_images import inline_images_as_data_uris
from app.services import wechat_service

logger = logging.getLogger(__name__)


def process_html_for_copy(
    html: str, css: str, *, appid: str = "", appsecret: str = "", profile: str = "wechat"
) -> dict[str, Any]:
    """Copy pipeline: sanitize + inline images + validate.

    Returns: {"html": str, "report": ValidationReport}
    """
    del appid, appsecret  # Not used in copy path
    # Validate the ORIGINAL author input, BEFORE sanitize/inline. The
    # sanitizer strips/normalizes violating constructs (e.g. unwraps
    # <animate>, lower-cases attribute names), so validating the sanitized
    # output yields zero findings — defeating the "preview looks fine but
    # vanishes after paste" detection. Run the checker at the source.
    report = validate_html(html)
    processed = process_for_wechat(html, css, profile=profile)
    processed = inline_images_as_data_uris(processed)
    return {"html": processed, "report": report}


def publish_draft_sync(
    article: dict, appid: str, appsecret: str, *, profile: str = "wechat"
) -> dict[str, Any]:
    """Publish draft to WeChat."""
    title = article.get("title", "")
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info("[publish] title=%r html=%d css=%d", title, len(html), len(css))

    processed_html = process_for_wechat(html, css, profile=profile)
    # Offload images to WeChat's own CDN (media/uploadimg via the configured
    # gateway). This keeps the draft content under WeChat's ~1MB limit (base64
    # screenshots are the usual culprit behind "content size out of limit") AND
    # makes the images display in the published article — WeChat's servers can't
    # fetch LAN imgbed URLs. See tests/test_publish_draft_images.py.
    processed_html, image_failures = wechat_service.process_html_images(
        processed_html, appid=appid, appsecret=appsecret
    )
    if image_failures:
        logger.warning("[publish] %d image(s) failed to offload", len(image_failures))

    result = wechat_service.create_draft(
        appid=appid,
        appsecret=appsecret,
        title=title,
        html=processed_html,
        author=article.get("author", ""),
        digest=article.get("digest", ""),
        thumb_media_id="",
        content_source_url="",
    )
    # H7:失败清单透传(加法字段;空列表也带),让前端明示「草稿成功但图会裂」。
    return {**result, "image_failures": image_failures}
