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
pre, pre code { white-space: pre-wrap; word-break: break-word; word-wrap: break-word; overflow-x: auto; }
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
    css = re.sub(r"@import\s+url\([^)]*\)\s*;?", "", css)
    css = re.sub(r"@import\s+['\"][^'\"]*['\"]\s*;?", "", css)
    # @keyframes blocks (nested braces)
    css = re.sub(
        r"@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}",
        "",
        css,
        flags=re.DOTALL,
    )
    # @media queries
    css = re.sub(
        r"@media\s+[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}",
        "",
        css,
        flags=re.DOTALL,
    )
    # Rules with pseudo-classes / pseudo-elements (can't be inlined)
    css = re.sub(
        r"[^{}]*::?(?:hover|focus|active|visited|before|after"
        r"|first-child|last-child|nth-child\([^)]*\))\s*\{[^}]*\}",
        "",
        css,
    )
    return css


# ---------------------------------------------------------------------------
#  CSS inlining via premailer
# ---------------------------------------------------------------------------


def _inline_css(html: str, css: str = "") -> str:
    """Extract embedded <style>, combine with separate CSS, clean, then inline."""
    # Pull out all <style> blocks from the HTML body
    style_blocks = re.findall(
        r"<style[^>]*>(.*?)</style>",
        html,
        re.DOTALL | re.IGNORECASE,
    )
    html_body = re.sub(
        r"<style[^>]*>.*?</style>",
        "",
        html,
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
    opacity_m = re.search(r"opacity\s*:\s*([\d.]+)", s)
    if opacity_m and float(opacity_m.group(1)) < 0.3:
        return ""  # decorative blob
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
    is_ba = "ba-before" in inner_html or "ba-after" in inner_html
    is_acc = "acc-body" in inner_html or "acc-lbl" in inner_html
    is_flip = "flip-inner" in inner_html or "flip-front" in inner_html
    is_carousel = "car-track" in inner_html or "carousel" in inner_html.lower()
    is_fade = "fadeIn" in inner_html
    is_longpress = "longpress" in inner_html.lower() or "pr-wrap" in inner_html

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
    no_style = re.sub(r"<style[^>]*>.*?</style>", "", inner_html, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", no_style).strip()
    text = re.sub(r"\s+", " ", text)
    text_lines = max(1, len(text) // 35)

    labels = len(re.findall(r"<label\b", inner_html))
    h = text_lines * 28 + labels * 50 + 40
    return max(120, min(h, 600))


def _wrap_in_svg_foreignobject(inner_html: str) -> str:
    """Wrap an interactive component in SVG + foreignObject for WeChat.

    WeChat strips <input>/<label>/<style> from article body HTML, but preserves
    them inside <svg><foreignObject>. This is the industry-standard technique
    used by Xiumi (秀米), 135editor, etc.
    """
    # Clean up: remove contenteditable, it's editor-only
    inner_html = re.sub(r'\s*contenteditable="[^"]*"', "", inner_html)

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
        f"{inner_html}"
        f"</div>"
        f"</foreignObject>"
        f"</svg>"
        f"</section>"
    )


def _extract_and_protect_interactive(html: str):
    """Extract interactive components, replace with placeholders.

    Returns (html_with_placeholders, list_of_svg_wrapped_components).
    """
    components = []
    placeholder_tpl = "<!--INTERACTIVE_PLACEHOLDER_{idx}-->"

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
        placeholder = f"<!--INTERACTIVE_PLACEHOLDER_{idx}-->"
        html = html.replace(placeholder, svg_block)
    return html


def _fix_button_anchors(html: str) -> str:
    """Convert styled <a> buttons to <table><tr><td bgcolor> pattern.

    WeChat ProseMirror treats <a> as an inline mark and cannot nest block
    elements inside it — any visual styling on <a> (or on a wrapping child
    <section>) is lost in the backend editor. The email-style table-button
    preserves background/padding/border-radius on <td bgcolor>, while the
    <a> carries only inline text properties (color/font) which PM keeps as
    a link mark.
    """
    pattern = re.compile(r"<a\s+([^>]*?)>(.*?)</a>", re.DOTALL)

    _BTN_PROPS = (
        "background",
        "background-color",
        "padding",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "border-radius",
        "border",
        "border-top",
        "border-right",
        "border-bottom",
        "border-left",
        "text-align",
    )
    _TEXT_PROPS = (
        "color",
        "font-size",
        "font-weight",
        "font-family",
        "letter-spacing",
        "line-height",
        "text-decoration",
    )

    def _parse_style(s: str) -> dict:
        out = {}
        for part in s.split(";"):
            part = part.strip()
            if not part or ":" not in part:
                continue
            k, v = part.split(":", 1)
            out[k.strip().lower()] = v.strip()
        return out

    def _render_style(d: dict) -> str:
        return "; ".join(f"{k}:{v}" for k, v in d.items() if v)

    def _looks_like_button(d: dict) -> bool:
        return bool(
            d.get("display", "").startswith("inline-block")
            or d.get("background-color")
            or (d.get("background") or "").lstrip().startswith("#")
            or "padding" in d
            or "border-radius" in d
        )

    def _wrap(m: re.Match) -> str:
        attrs = m.group(1)
        inner = m.group(2).strip()
        href_m = re.search(r'href="([^"]*)"', attrs)
        if not href_m:
            return m.group(0)

        a_style_m = re.search(r'style="([^"]*)"', attrs)
        a_style = _parse_style(a_style_m.group(1) if a_style_m else "")

        # If the <a> has a single wrapping child (from a previous sanitize
        # pass), unwind it so we can extract its button styling.
        child_style: dict = {}
        text_content = inner
        child_m = re.match(
            r"^<(section|span|div)\s+([^>]*?)>(.*)</\1>$",
            inner,
            re.DOTALL,
        )
        if child_m:
            cs_m = re.search(r'style="([^"]*)"', child_m.group(2))
            if cs_m:
                child_style = _parse_style(cs_m.group(1))
                text_content = child_m.group(3).strip()

        combined = {**a_style, **child_style}
        if not _looks_like_button(combined):
            return m.group(0)

        # Visual box props go on td; text props go on BOTH td and a so they
        # survive even if PM strips the <a> wrapper (PM is very aggressive
        # about stripping <a href> inside tables for anti-phishing reasons).
        td_style = {k: v for k, v in combined.items() if k in _BTN_PROPS}
        text_style = {k: v for k, v in combined.items() if k in _TEXT_PROPS}
        for k, v in text_style.items():
            # Don't duplicate text-decoration to td (not meaningful there)
            if k != "text-decoration":
                td_style[k] = v
        a_new_style = dict(text_style)
        a_new_style.setdefault("text-decoration", "none")
        a_new_style.setdefault("display", "inline-block")

        bg = td_style.pop("background", None)
        if bg and not td_style.get("background-color"):
            td_style["background-color"] = bg
        bgc_val = td_style.get("background-color", "")
        bgcolor = bgc_val if re.match(r"^#[0-9a-fA-F]{3,8}$", bgc_val) else ""
        align = td_style.pop("text-align", "center")
        td_style.setdefault("text-align", align)

        td_attrs = f'align="{align}"'
        if bgcolor:
            td_attrs += f' bgcolor="{bgcolor}"'
        td_attrs += f' style="{_render_style(td_style)}"'
        a_attrs_new = re.sub(r'\s*style="[^"]*"', "", attrs).strip()
        a_attrs_new += f' style="{_render_style(a_new_style)}"'

        return (
            f'<table cellpadding="0" cellspacing="0" border="0" '
            f'align="{align}" style="margin:14px auto; border-collapse:separate">'
            f"<tbody><tr><td {td_attrs}>"
            f"<a {a_attrs_new}>{text_content}</a>"
            f"</td></tr></tbody></table>"
        )

    return pattern.sub(_wrap, html)


def _collapse_nested_sections(html: str) -> str:
    """Collapse chains of <section> wrappers where an outer section has no
    meaningful attributes and contains exactly one child section. Reduces
    the number of dashed edit-mode outlines WeChat ProseMirror draws.
    """
    try:
        from lxml import html as lxml_html
        from lxml.etree import tostring
    except Exception:
        return html
    try:
        root = lxml_html.fragment_fromstring(
            f'<div id="__collapse_root__">{html}</div>',
            create_parent=False,
        )
    except Exception:
        return html

    for _ in range(20):
        changed = False
        for sec in list(root.iter("section")):
            parent = sec.getparent()
            if parent is None:
                continue
            if any(sec.get(a) for a in ("style", "align", "class", "id", "bgcolor")):
                continue
            if (sec.text or "").strip():
                continue
            if len(sec) != 1:
                continue
            only = sec[0]
            if only.tag != "section":
                continue
            if (only.tail or "").strip():
                continue
            only.tail = (only.tail or "") + (sec.tail or "")
            idx = list(parent).index(sec)
            parent.remove(sec)
            parent.insert(idx, only)
            changed = True
        if not changed:
            break

    parts = [root.text or ""]
    for child in root:
        parts.append(tostring(child, encoding="unicode", method="html"))
    return "".join(parts)


def _sanitize_for_wechat(html: str) -> str:
    """Post-process inlined HTML for WeChat compatibility."""

    # ---- remove contenteditable from non-interactive content ---
    html = re.sub(r'\s*contenteditable="[^"]*"', "", html)

    # ---- strip leftover tags --------------------------------------------------
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(
        r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE
    )

    # ---- strip <input>/<label> outside of SVG (orphan interactive elements) ---
    html = re.sub(r"<input\s[^>]*>\s*", "", html)
    html = re.sub(r"<label\b[^>]*>(.*?)</label>", r"\1", html, flags=re.DOTALL)

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
    html = re.sub(r"<div\b", "<section", html)
    html = re.sub(r"</div>", "</section>", html)

    # ---- normalize quotes: premailer may output style='...' (single quotes) ---
    html = re.sub(r"style='([^']*)'", r'style="\1"', html)

    # ---- strip bgcolor attr from <table> and <tr> (ProseMirror drops them,
    #      leaving only <td> which keeps them in practice) ---------------------
    html = re.sub(r'(<table\b[^>]*?)\s+bgcolor="[^"]*"', r"\1", html)
    html = re.sub(r'(<tr\b[^>]*?)\s+bgcolor="[^"]*"', r"\1", html)

    # ---- inject border:0 on <td> without full border shorthand --------------
    # WeChat article rendering applies `td { border:1px solid #ddd }` by default,
    # which creates visible gray frames around every bare td cell (e.g. the 3
    # download badge cells, the model list rows). Inline style wins over the
    # stylesheet, so we prepend `border:0` when no full `border:` shorthand is
    # declared. Prepended so any per-side `border-bottom:...` declaration still
    # overrides the zero base.
    def _td_border_fix(m: re.Match) -> str:
        head = m.group(0)
        style_m = re.search(r'style="([^"]*)"', head)
        if style_m:
            inner = style_m.group(1)
            # Skip if a full `border:` shorthand is present (not border-top etc.)
            if re.search(r"(?:^|;)\s*border\s*:", inner):
                return head
            new_inner = ("border:0; " + inner.strip()).strip().strip(";").strip()
            return head.replace(style_m.group(0), f'style="{new_inner}"')
        return head[:-1] + ' style="border:0">'

    html = re.sub(r"<td\b[^>]*>", _td_border_fix, html)

    # ---- remove empty decorative absolute-positioned elements -----------------
    html = re.sub(
        r'<(\w+)\s+style="[^"]*position\s*:\s*absolute[^"]*"\s*>\s*</\1>',
        "",
        html,
    )

    # ---- fix individual inline style values -----------------------------------
    def _fix_style(m: re.Match) -> str:
        s = m.group(1)

        # ------------------------------------------------------------------
        # v4.0 additions (2026-04-12) — JS-driven scroll-reveal patterns
        # ------------------------------------------------------------------
        # opacity:0 → opacity:1. Scroll-reveal CSS hides elements by default
        # and depends on JS IntersectionObserver + a .visible class to show
        # them. WeChat strips JS so the show-trigger never fires and content
        # stays invisible. Rewrite the default-hidden state to visible so
        # the static draft snapshot actually has content in it. Note that
        # this only affects exact opacity:0; partial-opacity decorative
        # elements (e.g. opacity:0.12 orbs) are still removed by
        # _remove_if_decorative below, which runs over empty elements.
        s = re.sub(r"opacity\s*:\s*0(?:\.0+)?\s*(?=;|$)", "opacity:1", s)

        # position:absolute|fixed → display:none (marker)
        # WeChat's draft ingest strips every `position` property. Without
        # the position, decorative absolute elements (floating orbs, hero
        # badges, overlay layers) collapse into normal flow and occupy
        # their full width/height as block boxes, breaking the parent
        # layout. The position:...;... strip a few lines below removes
        # the property; here we detect the intent and mark the style so
        # we can prepend display:none after all other rewrites.
        _hide_absolute = bool(re.search(r"position\s*:\s*(?:absolute|fixed)\b", s))

        # background: shorthand → background-color: (when value is only a color)
        s = re.sub(
            r"background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)|"
            r"hsl\([^)]*\)|hsla\([^)]*\)|\w+)\s*(;|$)",
            r"background-color:\1\2",
            s,
        )

        # display: flex/grid — KEEP as-is. WeChat's draft edit view runs
        # Chromium ProseMirror and fully supports grid/flex (verified
        # 2026-04-12: pain-grid 2-col, brands 4-col, promises 3-col all
        # activated correctly with computed gridTemplateColumns matching).
        # The old downgrade (flex→inline-block, grid→block) was based on
        # an outdated assumption and caused +40% height regression on the
        # printmaster article. Removed in v4.0.1.

        # font-family — KEEP. WeChat draft edit view inherits from
        # ProseMirror container (mp-quote, PingFang SC, system-ui...).
        # Stripping would not change rendering but keeping preserves the
        # author's intent for the published H5 page.

        # box-shadow — keep (WeChat draft supports it in edit view)
        # transform — only strip translate* (handled by opacity:0 rewrite
        # above and by the _strip_wechat_unsupported_css pre-pass); keep
        # transform:none and decorative transforms that don't hide content
        s = re.sub(
            r"transform\s*:\s*translate[XYxy3d]*\([^)]*\)\s*;?\s*",
            "",
            s,
        )
        # backdrop-filter — strip (WebView doesn't support)
        s = re.sub(r"backdrop-filter\s*:[^;]+;?\s*", "", s)

        # sub-pixel borders → 1 px
        s = re.sub(r"(?<!\d)0\.5px", "1px", s)

        # animation / transition (not supported)
        s = re.sub(r"animation\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"animation-[\w-]+\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"transition\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"transition-[\w-]+\s*:[^;]+;?\s*", "", s)

        # position:absolute/fixed/sticky (unreliable in WeChat)
        s = re.sub(r"position\s*:\s*(?:absolute|fixed|sticky)\s*;?\s*", "", s)

        # orphaned top/right/bottom/left if no position left
        # use negative lookbehind for hyphen to avoid matching margin-left etc.
        if "position" not in s:
            for prop in ("top", "right", "bottom", "left"):
                s = re.sub(rf"(?<!-){prop}\s*:\s*[^;]+;?\s*", "", s)

        # cursor (useless on mobile)
        s = re.sub(r"cursor\s*:[^;]+;?\s*", "", s)

        # user-select, pointer-events, will-change (mobile-irrelevant)
        s = re.sub(r"user-select\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"-webkit-user-select\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"pointer-events\s*:[^;]+;?\s*", "", s)
        s = re.sub(r"will-change\s*:[^;]+;?\s*", "", s)

        # tidy up
        s = re.sub(r";\s*;+", ";", s).strip().strip(";").strip()
        # v4.0: if the original element used position:absolute|fixed,
        # hide it outright. WeChat strips `position` during ingest, and
        # without it a formerly-absolute element would land in normal
        # flow at its full size and break the parent layout.
        if _hide_absolute:
            s = f"display:none; {s}" if s else "display:none"
        return f'style="{s}"' if s else ""

    html = re.sub(r'style="([^"]*)"', _fix_style, html)
    html = re.sub(r'\s+style="\s*"', "", html)

    # ---- convert <pre> code blocks to WeChat-friendly format ---------------
    # WeChat overrides <pre> styling. Replace with <section><code> using
    # <br> for newlines and &nbsp; for spaces (doocs-style approach).
    def _convert_pre_block(m: re.Match) -> str:
        pre_attrs = m.group(1) or ""
        content = m.group(2)
        # Extract background color from pre style if present
        bg = "#0d1117"
        fg = "#e6edf3"
        bg_match = re.search(r"background(?:-color)?\s*:\s*([^;]+)", pre_attrs)
        if bg_match:
            bg = bg_match.group(1).strip()
        fg_match = re.search(r"(?:^|;)\s*color\s*:\s*([^;]+)", pre_attrs)
        if fg_match:
            fg = fg_match.group(1).strip()
        # Strip HTML tags from content but keep text
        inner = re.sub(r"<[^>]+>", "", content)
        # Decode HTML entities
        import html as html_mod

        inner = html_mod.unescape(inner)
        # Convert whitespace: spaces → &nbsp;, newlines → <br>
        lines = inner.split("\n")
        formatted_lines = []
        for line in lines:
            line = html_mod.escape(line)
            line = line.replace(" ", "&nbsp;")
            formatted_lines.append(line)
        formatted = "<br>".join(formatted_lines)
        return (
            f'<section style="background:{bg};border-radius:8px;'
            f'padding:16px;margin:18px 0;overflow:hidden;">'
            f'<code style="color:{fg};font-size:12px;line-height:1.6;'
            f"font-family:Menlo,Monaco,Courier New,monospace;"
            f'display:block;white-space:normal;word-break:break-all;">'
            f"{formatted}</code></section>"
        )

    html = re.sub(
        r"<pre([^>]*)>(.*?)</pre>",
        _convert_pre_block,
        html,
        flags=re.DOTALL,
    )

    # ---- width/height attributes — KEEP. Premailer adds width="..." on some
    # elements; SVGs and images depend on these for correct sizing. Stripping
    # caused SVG illustrations to lose their aspect ratio in the draft.

    # ---- remove empty elements (no text content, no children with text) -------
    html = re.sub(r"<(\w+)(?:\s+[^>]*)?\s*>\s*</\1>", _remove_if_decorative, html)

    # ---- collapse redundant nested <section> wrappers -------------------------
    html = _collapse_nested_sections(html)

    # ---- collapse blank lines -------------------------------------------------
    html = re.sub(r"\n\s*\n", "\n", html)
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
    logger.info(
        f"[publish] article_id={req_article_id}, title={article.get('title')!r}"
    )
    logger.info(f"[publish] raw html length={len(html)}, css length={len(css)}")

    # 1. CSS inline + sanitize
    processed_html = _process_for_wechat(html, css)
    logger.info(f"[publish] after CSS inline: length={len(processed_html)}")

    # 2. Upload images to WeChat CDN
    processed_html = wechat_service.process_html_images(
        processed_html, settings.IMAGES_DIR
    )
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
                from app.services.wechat_service import get_http_client

                client = get_http_client()
                resp_bytes = client.get(src, timeout=15).content
                thumb_media_id = wechat_service.upload_thumb_to_wechat(
                    resp_bytes, "cover.jpg"
                )
            except Exception:
                pass

    # 4. Extract source URL from HTML comment or first <a href>
    source_url = ""
    comment_match = re.search(r"<!--\s*source_url:(https?://[^\s]+)\s*-->", html)
    if comment_match:
        source_url = comment_match.group(1)
    else:
        url_match = re.search(r'<a\s+href="(https?://[^"]+)"', html)
        if url_match:
            source_url = url_match.group(1)

    logger.info(
        f"[publish] thumb_media_id={thumb_media_id!r}, source_url={source_url!r}"
    )

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
