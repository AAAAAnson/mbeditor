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

    # Merge and clean CSS from all sources
    parts = [css.strip()] + [b.strip() for b in style_blocks]
    all_css = "\n".join(p for p in parts if p)
    all_css = _strip_wechat_unsupported_css(all_css)

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
#  HTML post-processing: fix WeChat-incompatible inline styles & tags
# ---------------------------------------------------------------------------

def _remove_if_decorative(m: re.Match) -> str:
    """Remove empty element if it looks purely decorative (large circle, connector, etc.)."""
    full = m.group(0)
    # Keep dividers / separators (height ≤ 2px with background — intentional hr-like elements)
    style = re.search(r'style="([^"]*)"', full)
    if not style:
        return full
    s = style.group(1)
    # Keep if it has meaningful text-related styles (font, color with text)
    # Remove if: large dimensions + opacity < 0.3 (decorative blobs)
    opacity_m = re.search(r'opacity\s*:\s*([\d.]+)', s)
    if opacity_m and float(opacity_m.group(1)) < 0.3:
        return ''  # decorative blob
    # Keep thin lines (dividers, connectors) — they're intentional visual separators
    return full


# ---------------------------------------------------------------------------
#  Interactive components → SVG + foreignObject wrapper
# ---------------------------------------------------------------------------

_INTERACTIVE_PATTERN = re.compile(
    r'<section\s+contenteditable="false"[^>]*>(.*?)</section>'
    r'(?=\s*(?:<section\s+contenteditable|<section\s+style="margin|<h\d|<p\b|$))',
    re.DOTALL,
)


def _estimate_svg_height(inner_html: str) -> int:
    """Rough height estimate for SVG viewBox based on content."""
    # Count major block elements (each ~40-60px)
    blocks = len(re.findall(r'<(?:section|div|p|h[1-6]|label)\b', inner_html))
    # Count images
    images = len(re.findall(r'<img\b', inner_html))
    # Pure text length (at ~16px font, ~35 chars per line at 580px, ~24px per line)
    text = re.sub(r'<[^>]+>', '', inner_html).strip()
    text_len = len(text)
    text_lines = max(1, text_len // 30)
    text_height = text_lines * 26

    # Heuristic: blocks contribute padding, text contributes line height
    h = blocks * 20 + images * 250 + text_height + 40  # 40px base padding
    h = max(150, min(h, 2000))
    return h


def _wrap_in_svg_foreignobject(inner_html: str) -> str:
    """Wrap an interactive component in SVG + foreignObject for WeChat.

    WeChat strips <input>/<label>/<style> from article body HTML, but preserves
    them inside <svg><foreignObject>. This is the industry-standard technique
    used by Xiumi (秀米), 135editor, etc.
    """
    # Clean up: remove contenteditable, it's editor-only
    inner_html = re.sub(r'\s*contenteditable="[^"]*"', '', inner_html)

    height = _estimate_svg_height(inner_html)

    # Use 580px width — matches WeChat article content area on mobile
    vw = 580
    return (
        f'<section style="width:100%;margin:16px 0;">'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {vw} {height}" '
        f'style="width:100%;background:transparent;">'
        f'<foreignObject x="0" y="0" width="{vw}" height="{height}">'
        f'<div xmlns="http://www.w3.org/1999/xhtml" '
        f'style="width:{vw}px;font-family:-apple-system,BlinkMacSystemFont,'
        f"'PingFang SC','Hiragino Sans GB',sans-serif;"
        f'font-size:15px;line-height:1.8;color:#333;">'
        f'{inner_html}'
        f'</div>'
        f'</foreignObject>'
        f'</svg>'
        f'</section>'
    )


def _extract_and_protect_interactive(html: str):
    """Extract interactive components, replace with placeholders.

    Returns (html_with_placeholders, list_of_svg_wrapped_components).
    """
    components = []
    placeholder_tpl = '<!--INTERACTIVE_PLACEHOLDER_{idx}-->'

    def _replacer(m: re.Match) -> str:
        idx = len(components)
        inner = m.group(1)
        # Wrap the interactive block in SVG+foreignObject
        svg_block = _wrap_in_svg_foreignobject(inner)
        components.append(svg_block)
        return placeholder_tpl.format(idx=idx)

    html_with_placeholders = _INTERACTIVE_PATTERN.sub(_replacer, html)
    return html_with_placeholders, components


def _restore_interactive(html: str, components: list) -> str:
    """Put SVG-wrapped interactive components back in place of placeholders."""
    for idx, svg_block in enumerate(components):
        placeholder = f'<!--INTERACTIVE_PLACEHOLDER_{idx}-->'
        html = html.replace(placeholder, svg_block)
    return html


def _sanitize_for_wechat(html: str) -> str:
    """Post-process inlined HTML for WeChat compatibility."""

    # ---- remove contenteditable from non-interactive content ---
    html = re.sub(r'\s*contenteditable="[^"]*"', '', html)

    # ---- strip leftover tags --------------------------------------------------
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)

    # ---- strip <input>/<label> outside of SVG (orphan interactive elements) ---
    html = re.sub(r'<input\s[^>]*>\s*', '', html)
    html = re.sub(r'<label\b[^>]*>(.*?)</label>', r'\1', html, flags=re.DOTALL)

    # ---- remove class / data-* attributes ------------------------------------
    html = re.sub(r'\s+class="[^"]*"', "", html)
    html = re.sub(r"\s+class='[^']*'", "", html)
    html = re.sub(r'\s+data-[\w-]+="[^"]*"', "", html)

    # ---- <div> → <section> (WeChat convention) -------------------------------
    html = re.sub(r'<div\b', '<section', html)
    html = re.sub(r'</div>', '</section>', html)

    # ---- normalize quotes: premailer may output style='...' (single quotes) ---
    html = re.sub(r"style='([^']*)'", r'style="\1"', html)

    # ---- remove empty decorative absolute-positioned elements -----------------
    html = re.sub(
        r'<(\w+)\s+style="[^"]*position\s*:\s*absolute[^"]*"\s*>\s*</\1>',
        '', html,
    )

    # ---- fix individual inline style values -----------------------------------
    def _fix_style(m: re.Match) -> str:
        s = m.group(1)

        # display:grid → block (WeChat doesn't support CSS Grid)
        s = re.sub(r'display\s*:\s*grid\b', 'display:block', s)
        s = re.sub(r'grid-template-columns\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'grid-template-rows\s*:[^;]+;?\s*', '', s)

        # sub-pixel borders → 1 px
        s = re.sub(r'(?<!\d)0\.5px', '1px', s)

        # animation (not supported)
        s = re.sub(r'animation\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'animation-[\w-]+\s*:[^;]+;?\s*', '', s)

        # position:absolute (unreliable in WeChat)
        s = re.sub(r'position\s*:\s*absolute\s*;?\s*', '', s)

        # orphaned top/right/bottom/left if no position left
        # use negative lookbehind for hyphen to avoid matching margin-left etc.
        if 'position' not in s:
            for prop in ('top', 'right', 'bottom', 'left'):
                s = re.sub(rf'(?<!-){prop}\s*:\s*[^;]+;?\s*', '', s)

        # cursor (useless on mobile)
        s = re.sub(r'cursor\s*:[^;]+;?\s*', '', s)

        # tidy up
        s = re.sub(r';\s*;+', ';', s).strip().strip(';').strip()
        return f'style="{s}"' if s else ''

    html = re.sub(r'style="([^"]*)"', _fix_style, html)
    html = re.sub(r'\s+style="\s*"', '', html)

    # ---- remove premailer-added width/height attributes (not needed) ----------
    html = re.sub(r'\s+width="[^"]*"', '', html)
    html = re.sub(r'\s+height="[^"]*"', '', html)

    # ---- remove empty elements (no text content, no children with text) -------
    html = re.sub(r'<(\w+)(?:\s+[^>]*)?\s*>\s*</\1>', _remove_if_decorative, html)

    # ---- collapse blank lines -------------------------------------------------
    html = re.sub(r'\n\s*\n', '\n', html)
    return html.strip()


# ---------------------------------------------------------------------------
#  Combined pipeline
# ---------------------------------------------------------------------------

def _process_for_wechat(html: str, css: str = "") -> str:
    """Full pipeline: extract interactive → inline CSS → sanitize → restore SVG."""
    # 1. Extract interactive components (they have their own <style>/<input>/<label>)
    html_safe, interactive_blocks = _extract_and_protect_interactive(html)
    # 2. CSS inline + sanitize the static content only
    processed = _sanitize_for_wechat(_inline_css(html_safe, css))
    # 3. Restore SVG-wrapped interactive components
    processed = _restore_interactive(processed, interactive_blocks)
    return processed


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
