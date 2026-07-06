from app.services.css_inline import inline_css
from app.services.render_profiles import get_profile
from app.services.wechat_sanitize import sanitize_for_wechat, sanitize_with_profile


def process_for_wechat(html: str, css: str = "", *, profile: str = "wechat") -> str:
    """Legacy WeChat pipeline: inline CSS, then sanitize HTML.

    ``profile`` selects the sanitization policy ("wechat" default; "generic"/
    "web" for a relaxed web-preview profile). Unknown names fall back to
    "wechat" via :func:`get_profile`.

    The default "wechat" path goes through :func:`sanitize_for_wechat` (a thin
    wrapper over ``sanitize_with_profile(..., WECHAT_PROFILE)``) so the wiring
    and output stay byte-identical to the historical pipeline.
    """
    inlined = inline_css(html, css)
    resolved = get_profile(profile)
    if resolved.name == "wechat":
        return sanitize_for_wechat(inlined)
    return sanitize_with_profile(inlined, resolved)


def preview_html(html: str, css: str = "", *, profile: str = "wechat") -> str:
    # Keep the default call shape identical to the historical alias
    # (``process_for_wechat(html, css)``) so the wiring stays a thin pass-through;
    # only thread ``profile`` when a non-default profile is requested.
    if profile == "wechat":
        return process_for_wechat(html, css)
    return process_for_wechat(html, css, profile=profile)
