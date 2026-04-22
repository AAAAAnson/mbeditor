import logging

from app.services import wechat_service
from app.services.css_inline import inline_css, strip_wechat_unsupported_css
from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.wechat_sanitize import sanitize_for_wechat


def process_html_for_copy(html: str, css: str, *, appid: str = "", appsecret: str = "") -> str:
    # 复制富文本的两段式流水线：
    #   1. process_for_wechat —— 本地净化 + CSS inline（不需要账号）
    #   2. process_html_images —— 把外链/Base64 图片上传到公众号素材库（需要账号）
    # 没配账号时只跑第一段：用户能把干净的 HTML 粘进公众号编辑器，图片按原 URL
    # 呈现；如果里面有 Base64，公众号会提示用户手动补图。强制要求账号会让"仅想
    # 复制一下成品 HTML"的使用场景寸步难行。
    processed = process_for_wechat(html, css)
    if appid and appsecret:
        processed = wechat_service.process_html_images(processed, appid=appid, appsecret=appsecret)
    return processed


def publish_draft_sync(article: dict, appid: str, appsecret: str) -> dict:
    logger = logging.getLogger(__name__)
    title = article.get("title", "")
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info("[publish] title=%r html=%d css=%d", title, len(html), len(css))

    processed_html = process_for_wechat(html, css)
    processed_html = wechat_service.process_html_images(processed_html, appid=appid, appsecret=appsecret)

    return wechat_service.create_draft(
        appid=appid,
        appsecret=appsecret,
        title=title,
        html=processed_html,
        author=article.get("author", ""),
        digest=article.get("digest", ""),
        thumb_media_id="",
        content_source_url="",
    )


_strip_wechat_unsupported_css = strip_wechat_unsupported_css
_inline_css = inline_css
_sanitize_for_wechat = sanitize_for_wechat
_process_for_wechat = process_for_wechat
