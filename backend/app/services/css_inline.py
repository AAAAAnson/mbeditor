import re

from premailer import transform

# Base styles matching the preview iframe - ensures WYSIWYG between preview and publish.
# NOTE: font-family intentionally omitted. WeChat on mobile uses its own PingFang/system
# font stack; setting a quoted family here triggers nested-quote bugs when premailer
# inlines the CSS onto a style="..." attribute (inner quotes break the HTML parser).
WECHAT_BASE_CSS = """
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


def strip_wechat_unsupported_css(css: str) -> str:
    """Remove CSS features that cannot be inlined or WeChat doesn't support."""
    css = re.sub(r'@import\s+url\([^)]*\)\s*;?', '', css)
    css = re.sub(r"@import\s+['\"][^'\"]*['\"]\s*;?", '', css)
    css = re.sub(
        r'@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}',
        '', css, flags=re.DOTALL,
    )
    css = re.sub(
        r'@media\s+[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}',
        '', css, flags=re.DOTALL,
    )
    css = re.sub(
        r'[^{}]*::?(?:hover|focus|active|visited|before|after'
        r'|first-child|last-child|nth-child\([^)]*\))\s*\{[^}]*\}',
        '', css,
    )
    return css


def inline_css(html: str, css: str = "") -> str:
    """Extract embedded <style>, combine with separate CSS, clean, then inline."""
    style_blocks = re.findall(
        r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE,
    )
    html_body = re.sub(
        r'<style[^>]*>.*?</style>', '', html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    parts = [WECHAT_BASE_CSS, css.strip()] + [b.strip() for b in style_blocks]
    all_css = "\n".join(p for p in parts if p)
    all_css = strip_wechat_unsupported_css(all_css)

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
        result = f"<html><body>{html_body}</body></html>"

    match = re.search(r"<body[^>]*>(.*)</body>", result, re.DOTALL)
    return match.group(1).strip() if match else result
