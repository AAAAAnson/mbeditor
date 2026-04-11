import asyncio
import re
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from premailer import transform

from app.core.config import settings
from app.core.response import success
from app.services import article_service, wechat_service

router = APIRouter(prefix="/publish", tags=["publish"])

# Base styles matching the preview iframe — ensures WYSIWYG between preview and publish.
# Use SINGLE quotes for font names so merged inline styles stay valid inside style="..."
# attributes (nested double quotes break HTML parsing; see _single_to_double_quoted_style).
_WECHAT_BASE_CSS = """
body, section.wechat-root {
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    word-wrap: break-word;
    word-break: break-all;
}
img { border-radius: 8px; max-width: 100% !important; box-sizing: border-box; }
"""


class PublishDraftReq(BaseModel):
    article_id: str
    author: Optional[str] = ""
    digest: Optional[str] = ""


class PreviewReq(BaseModel):
    html: str
    css: str = ""


# ---------------------------------------------------------------------------
#  CSS pre-processing: strip features that can't be inlined / WeChat ignores
# ---------------------------------------------------------------------------

def _strip_wechat_unsupported_css(css: str) -> str:
    """Remove CSS features that cannot be inlined or WeChat doesn't support."""
    # @import (external fonts / resources)
    css = re.sub(r'@import\s+url\([^)]*\)\s*;?', '', css)
    css = re.sub(r"@import\s+['\"][^'\"]*['\"]\s*;?", '', css)
    # @keyframes blocks (nested braces)
    css = re.sub(
        r'@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}',
        '', css, flags=re.DOTALL,
    )
    # @media queries
    css = re.sub(
        r'@media\s+[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}',
        '', css, flags=re.DOTALL,
    )
    # Rules with pseudo-classes / pseudo-elements (can't be inlined)
    css = re.sub(
        r'[^{}]*::?(?:hover|focus|active|visited|before|after'
        r'|first-child|last-child|nth-child\([^)]*\))\s*\{[^}]*\}',
        '', css,
    )
    return css


# ---------------------------------------------------------------------------
#  CSS inlining via premailer
# ---------------------------------------------------------------------------

def _inline_css(html: str, css: str = "") -> str:
    """Extract embedded <style>, combine with separate CSS, clean, then inline."""
    # Pull out all <style> blocks from the HTML body
    style_blocks = re.findall(
        r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE,
    )
    html_body = re.sub(
        r'<style[^>]*>.*?</style>', '', html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Merge and clean CSS from all sources (prepend base styles for WYSIWYG)
    parts = [_WECHAT_BASE_CSS, css.strip()] + [b.strip() for b in style_blocks]
    all_css = "\n".join(p for p in parts if p)
    all_css = _strip_wechat_unsupported_css(all_css)

    # Wrap in wechat-root section so body-level styles get inlined onto it
    # (WeChat strips <body> tags, so styles must land on a wrapper element)
    html_body = f'<section class="wechat-root">{html_body}</section>'

    if all_css.strip():
        html_body = f"<style>{all_css}</style>{html_body}"

    full = f"<html><head><meta charset='utf-8'></head><body>{html_body}</body></html>"
    try:
        result = transform(
            full,
            remove_classes=True,
            keep_style_tags=False,
            strip_important=False,
            cssutils_logging_level="CRITICAL",
        )
    except Exception:
        # If premailer chokes, fall back to raw HTML (styles already embedded)
        result = f"<html><body>{html_body}</body></html>"

    match = re.search(r"<body[^>]*>(.*)</body>", result, re.DOTALL)
    return match.group(1).strip() if match else result


# ---------------------------------------------------------------------------
#  HTML post-processing: strip WeChat-incompatible tags and attributes
# ---------------------------------------------------------------------------

def _sanitize_for_wechat(html: str) -> str:
    """Strip tags/attributes that WeChat's backend renderer removes.

    Post-Stage-0 scope: this function ONLY removes what WeChat itself removes.
    It does NOT rewrite CSS values, delete grid/flex/position, or otherwise
    mutate the author's intent. If the user writes display:grid, we send
    display:grid. WeChat's runtime is responsible for the final rendering.

    The "cleaning downstream" anti-pattern (rewriting grid→block, deleting
    absolute positioning, etc.) is explicitly banned — see
    docs/research/wechat-wysiwyg-pipeline.md HC-6.
    """
    # ---- remove contenteditable (editor-only attribute) ---------------------
    html = re.sub(r'\s*contenteditable="[^"]*"', '', html)

    # ---- strip tags WeChat does not support ---------------------------------
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<link[^>]*/?>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<meta[^>]*/?>", "", html, flags=re.IGNORECASE)

    # ---- strip <input>/<label> (WeChat article body drops them) -------------
    html = re.sub(r'<input\s[^>]*>\s*', '', html)
    html = re.sub(r'<label\b[^>]*>(.*?)</label>', r'\1', html, flags=re.DOTALL)

    # ---- remove class / data-* attributes (WeChat drops external CSS) ------
    html = re.sub(r'\s+class="[^"]*"', "", html)
    html = re.sub(r"\s+class='[^']*'", "", html)
    html = re.sub(r'\s+data-[\w-]+="[^"]*"', "", html)

    # ---- <div> → <section> (WeChat convention from Xiumi/135) ---------------
    html = re.sub(r'<div\b', '<section', html)
    html = re.sub(r'</div>', '</section>', html)

    # ---- normalize style quotes: premailer may emit style='...' (single)
    # Must escape any inner double quotes to &quot; before swapping the
    # wrapper, otherwise font-family:"PingFang SC","Hiragino Sans GB" gets
    # torn into fake attributes by the HTML parser.
    def _single_to_double_quoted_style(m: re.Match) -> str:
        inner = m.group(1).replace('"', '&quot;')
        return f'style="{inner}"'

    html = re.sub(r"style='([^']*)'", _single_to_double_quoted_style, html)

    # ---- collapse blank lines ----------------------------------------------
    html = re.sub(r'\n\s*\n', '\n', html)
    return html.strip()


# ---------------------------------------------------------------------------
#  Combined pipeline
# ---------------------------------------------------------------------------

def _process_for_wechat(html: str, css: str = "") -> str:
    """Full pipeline: inline CSS → sanitize for WeChat compatibility."""
    return _sanitize_for_wechat(_inline_css(html, css))


# ---------------------------------------------------------------------------
#  Endpoints
# ---------------------------------------------------------------------------

@router.get("/html/{article_id}")
async def get_processed_html(article_id: str):
    """Get article HTML with CSS inlined — ready for copying to WeChat."""
    article = article_service.get_article(article_id)
    processed = _process_for_wechat(article.get("html", ""), article.get("css", ""))
    return success({"html": processed, "css": "", "title": article.get("title", "")})


@router.post("/preview")
async def preview_wechat(req: PreviewReq):
    """Process raw HTML+CSS for WeChat — no save needed."""
    processed = _process_for_wechat(req.html, req.css)
    return success({"html": processed})


@router.post("/process")
async def process_article(req: PublishDraftReq):
    """Process article: inline CSS + replace local images with WeChat CDN URLs."""
    article = article_service.get_article(req.article_id)
    processed = _process_for_wechat(article.get("html", ""), article.get("css", ""))
    processed = wechat_service.process_html_images(processed, settings.IMAGES_DIR)
    return success({"html": processed})


def _process_for_copy_sync(html: str, css: str) -> str:
    """Synchronous helper: inline CSS + upload local images to WeChat CDN."""
    # Ensure WeChat is configured before doing any work so we fail fast.
    config = wechat_service.load_config()
    if not config.get("appid") or not config.get("appsecret"):
        from app.core.exceptions import AppError
        raise AppError(
            code=400,
            message="未配置微信 AppID/Secret，无法上传图片",
        )
    processed = _process_for_wechat(html, css)
    processed = wechat_service.process_html_images(processed, settings.IMAGES_DIR)
    return processed


@router.post("/process-for-copy")
async def process_for_copy(req: PreviewReq):
    """Inline CSS and upload local images to WeChat CDN for clipboard copy.

    Takes raw HTML+CSS (no article_id needed) so the frontend can call this
    directly with the current editor state. Returns HTML whose <img src>
    attributes point to mmbiz.qpic.cn URLs, ready to paste into the WeChat
    editor.
    """
    loop = asyncio.get_event_loop()
    processed = await loop.run_in_executor(
        None, _process_for_copy_sync, req.html, req.css
    )
    return success({"html": processed})


def _publish_draft_sync(req_article_id: str, req_author: str, req_digest: str) -> dict:
    """Synchronous publish logic — runs in thread pool to avoid blocking event loop."""
    import logging
    logger = logging.getLogger(__name__)

    article = article_service.get_article(req_article_id)
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info(f"[publish] article_id={req_article_id}, title={article.get('title')!r}")
    logger.info(f"[publish] raw html length={len(html)}, css length={len(css)}")

    # 1. CSS inline + sanitize
    processed_html = _process_for_wechat(html, css)
    logger.info(f"[publish] after CSS inline: length={len(processed_html)}")

    # 2. Upload images to WeChat CDN
    processed_html = wechat_service.process_html_images(processed_html, settings.IMAGES_DIR)
    logger.info(f"[publish] after image upload: length={len(processed_html)}")

    # 3. Cover image
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
        match = re.search(r'src="([^"]+)"', processed_html)
        if match:
            src = match.group(1)
            try:
                import httpx
                resp_bytes = httpx.get(src, timeout=15).content
                thumb_media_id = wechat_service.upload_thumb_to_wechat(resp_bytes, "cover.jpg")
            except Exception:
                pass

    # 4. Extract source URL from HTML comment or first <a href>
    source_url = ""
    comment_match = re.search(r'<!--\s*source_url:(https?://[^\s]+)\s*-->', html)
    if comment_match:
        source_url = comment_match.group(1)
    else:
        url_match = re.search(r'<a\s+href="(https?://[^"]+)"', html)
        if url_match:
            source_url = url_match.group(1)

    logger.info(f"[publish] thumb_media_id={thumb_media_id!r}, source_url={source_url!r}")

    # 5. Push draft
    return wechat_service.create_draft(
        title=article.get("title", "Untitled"),
        html=processed_html,
        author=req_author or article.get("author", ""),
        digest=req_digest or article.get("digest", ""),
        thumb_media_id=thumb_media_id,
        content_source_url=source_url,
    )


@router.post("/draft")
async def publish_draft(req: PublishDraftReq):
    """Push article to WeChat draft box with CSS inlined."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _publish_draft_sync, req.article_id, req.author or "", req.digest or ""
    )
    return success(result)
