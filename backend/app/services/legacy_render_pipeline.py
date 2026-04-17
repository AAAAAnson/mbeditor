from app.services.css_inline import inline_css
from app.services.wechat_sanitize import sanitize_for_wechat


def process_for_wechat(html: str, css: str = "") -> str:
    """Legacy WeChat pipeline: inline CSS, then sanitize HTML."""
    return sanitize_for_wechat(inline_css(html, css))


def preview_html(html: str, css: str = "") -> str:
    return process_for_wechat(html, css)
