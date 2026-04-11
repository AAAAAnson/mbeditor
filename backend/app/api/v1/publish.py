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
# NOTE: font-family intentionally omitted. WeChat on mobile uses its own PingFang/system
# font stack; setting a quoted family here triggers nested-quote bugs when premailer
# inlines the CSS onto a style="..." attribute (inner quotes break the HTML parser).
_WECHAT_BASE_CSS = """
body, section.wechat-root {
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
    """Conservative height estimate — prefer too short over too tall.

    We set overflow:visible on SVG+foreignObject so content won't be clipped
    even if we underestimate. Too-tall estimates create ugly whitespace.
    """
    # Detect component type for type-specific sizing
    is_ba = 'ba-before' in inner_html or 'ba-after' in inner_html
    is_acc = 'acc-body' in inner_html or 'acc-lbl' in inner_html
    is_flip = 'flip-inner' in inner_html or 'flip-front' in inner_html
    is_carousel = 'car-track' in inner_html or 'carousel' in inner_html.lower()
    is_fade = 'fadeIn' in inner_html
    is_longpress = 'longpress' in inner_html.lower() or 'pr-wrap' in inner_html

    # Known component heights — tight fit, overflow:visible handles excess
    if is_ba:
        return 200  # two panels + toggle button
    if is_acc:
        return 120  # title bar only (body hidden by default via :checked)
    if is_flip:
        return 200  # card face + label
    if is_carousel:
        return 220  # visible slide + nav dots
    if is_fade:
        return 120  # 3 text lines stacked
    if is_longpress:
        return 100  # single content block

    # Fallback: strip <style> before counting visible text
    no_style = re.sub(r'<style[^>]*>.*?</style>', '', inner_html, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', '', no_style).strip()
    text = re.sub(r'\s+', ' ', text)
    text_lines = max(1, len(text) // 35)

    labels = len(re.findall(r'<label\b', inner_html))
    h = text_lines * 28 + labels * 50 + 40
    return max(120, min(h, 600))


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
        f'style="width:100%;overflow:visible;background:transparent;">'
        f'<foreignObject x="0" y="0" width="{vw}" height="{height}" '
        f'style="overflow:visible;">'
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


def _fix_button_anchors(html: str) -> str:
    """Wrap styled <a> button contents in <section> so visual styling survives
    WeChat's ProseMirror schema which strips <a> wrappers at render time but
    preserves <section> children with their inline styles intact.
    """
    pattern = re.compile(
        r'<a\s+([^>]*?)>([^<]*?(?:<(?!/a>)[^<]*)*?)</a>',
        re.DOTALL,
    )

    def _wrap(m: re.Match) -> str:
        attrs = m.group(1)
        inner = m.group(2)
        # Only intervene when the <a> has visual button styling
        style_m = re.search(r'style="([^"]*)"', attrs)
        if not style_m:
            return m.group(0)
        a_style = style_m.group(1)
        has_button_style = bool(
            re.search(r'display\s*:\s*inline-block', a_style)
            or re.search(r'background(?:-color)?\s*:\s*#', a_style)
            or re.search(r'padding\s*:', a_style)
            or re.search(r'border-radius\s*:', a_style)
        )
        if not has_button_style:
            return m.group(0)
        # Skip if content already starts with a block-level wrapper
        if re.match(r'\s*<(section|div|table|p|span)\b', inner):
            return m.group(0)
        # Strip button-visual styles from <a> itself, move them to <section>
        a_kept = re.sub(
            r'(display|background|background-color|padding|border-radius|'
            r'box-shadow|font-size|font-weight|letter-spacing|line-height|'
            r'color)\s*:[^;]+;?\s*',
            '', a_style,
        ).strip().strip(';').strip()
        a_attrs_new = re.sub(
            r'style="[^"]*"',
            f'style="text-decoration:none; color:inherit{";"+a_kept if a_kept else ""}"',
            attrs,
        )
        return f'<a {a_attrs_new}><section style="{a_style}">{inner}</section></a>'

    return pattern.sub(_wrap, html)


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

    # ---- remove id / on* attributes (ProseMirror & WeChat both strip them) ---
    html = re.sub(r'\s+id="[^"]*"', "", html)
    html = re.sub(r'\s+on\w+="[^"]*"', "", html)

    # ---- wrap button <a> content in <section> so styles survive ProseMirror --
    html = _fix_button_anchors(html)

    # ---- <div> → <section> (WeChat convention) -------------------------------
    html = re.sub(r'<div\b', '<section', html)
    html = re.sub(r'</div>', '</section>', html)

    # ---- normalize quotes: premailer may output style='...' (single quotes) ---
    html = re.sub(r"style='([^']*)'", r'style="\1"', html)

    # ---- strip bgcolor attr from <table> and <tr> (ProseMirror drops them,
    #      leaving only <td> which keeps them in practice) ---------------------
    html = re.sub(r'(<table\b[^>]*?)\s+bgcolor="[^"]*"', r'\1', html)
    html = re.sub(r'(<tr\b[^>]*?)\s+bgcolor="[^"]*"', r'\1', html)

    # ---- remove empty decorative absolute-positioned elements -----------------
    html = re.sub(
        r'<(\w+)\s+style="[^"]*position\s*:\s*absolute[^"]*"\s*>\s*</\1>',
        '', html,
    )

    # ---- fix individual inline style values -----------------------------------
    def _fix_style(m: re.Match) -> str:
        s = m.group(1)

        # background: shorthand → background-color: (when value is only a color)
        s = re.sub(
            r'background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)|'
            r'hsl\([^)]*\)|hsla\([^)]*\)|\w+)\s*(;|$)',
            r'background-color:\1\2', s,
        )

        # display: flex/inline-flex/grid/inline-grid → inline-block fallback
        s = re.sub(r'display\s*:\s*(?:inline-)?flex\b', 'display:inline-block', s)
        s = re.sub(r'display\s*:\s*(?:inline-)?grid\b', 'display:block', s)
        s = re.sub(r'grid-template-[\w-]+\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'(?:flex|justify|align)-[\w-]+\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'gap\s*:[^;]+;?\s*', '', s)

        # font-family → remove (WeChat forces system fonts on mobile anyway,
        # and custom families cause preview/actual mismatches)
        s = re.sub(r'font-family\s*:[^;]+;?\s*', '', s)

        # box-shadow / transform / filter (unsupported or unstable in WeChat)
        s = re.sub(r'box-shadow\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'transform\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'filter\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'backdrop-filter\s*:[^;]+;?\s*', '', s)

        # sub-pixel borders → 1 px
        s = re.sub(r'(?<!\d)0\.5px', '1px', s)

        # animation / transition (not supported)
        s = re.sub(r'animation\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'animation-[\w-]+\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'transition\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'transition-[\w-]+\s*:[^;]+;?\s*', '', s)

        # position:absolute/fixed/sticky (unreliable in WeChat)
        s = re.sub(r'position\s*:\s*(?:absolute|fixed|sticky)\s*;?\s*', '', s)

        # orphaned top/right/bottom/left if no position left
        # use negative lookbehind for hyphen to avoid matching margin-left etc.
        if 'position' not in s:
            for prop in ('top', 'right', 'bottom', 'left'):
                s = re.sub(rf'(?<!-){prop}\s*:\s*[^;]+;?\s*', '', s)

        # cursor (useless on mobile)
        s = re.sub(r'cursor\s*:[^;]+;?\s*', '', s)

        # user-select, pointer-events, will-change (mobile-irrelevant)
        s = re.sub(r'user-select\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'-webkit-user-select\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'pointer-events\s*:[^;]+;?\s*', '', s)
        s = re.sub(r'will-change\s*:[^;]+;?\s*', '', s)

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
    """Full pipeline: inline CSS → sanitize. SVG wrapping temporarily disabled."""
    # SVG interactive feature is unstable — skip extract/wrap/restore for now
    processed = _sanitize_for_wechat(_inline_css(html, css))
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
