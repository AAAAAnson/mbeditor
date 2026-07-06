"""Render profiles — parameterize the WeChat sanitizer's policy seams.

A :class:`RenderProfile` is a frozen bag of allowlists + step-toggles that
the sanitizer (``wechat_sanitize.sanitize_with_profile``) consults to decide
how aggressively to narrow HTML. Two profiles ship:

* ``WECHAT_PROFILE`` — the historical, behaviour-identical default. Every
  allowlist/flag matches the legacy constants verbatim so the existing
  500-test suite sees byte-for-byte identical output.
* ``GENERIC_PROFILE`` — a relaxed "web preview" profile that keeps modern
  layout CSS (flex/grid/transform/...), keeps ``<div>``/semantic tags, and
  keeps class/id hooks. It STILL enforces the security floor (no
  ``<script>``/``<style>``/``on*``/``javascript:``/iframe), because profile
  relaxation must never enable script execution.

The ``strip_dangerous`` helper is the shared security floor used by BOTH the
render pipeline and the reverse-import path (``article_to_mbdoc``) — any HTML
stored inside an ``HtmlBlock.source`` is run through it so an inline script can
never survive import.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Allowlists — WeChat (legacy) values are imported lazily inside the profile
# definitions below to avoid a circular import with wechat_sanitize.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RenderProfile:
    """Policy knobs for the sanitizer pipeline.

    Every step the sanitizer can perform is gated on one of these flags;
    the ``allowed_*`` frozensets parameterize the style-declaration gate.
    The script/style/on*/iframe strip is ALWAYS on for every profile (it is
    not represented here because it is the non-negotiable security floor).
    """

    name: str
    allowed_style_properties: frozenset
    allowed_display_values: frozenset
    allowed_position_values: frozenset
    rename_div_to_section: bool
    rename_semantic_tags: bool
    strip_class_id: bool
    strip_data_attrs: bool
    convert_button_anchors: bool
    inject_table_layout_fixed: bool
    collapse_nested_sections: bool
    convert_pre_blocks: bool
    # When True, position:absolute/fixed is rewritten to display:none and
    # opacity:0 -> opacity:1 (WeChat layout-trick neutralization). The generic
    # profile keeps absolute positioning instead.
    neutralize_layout_tricks: bool = True
    # 批3(2026-07-04):api-storage-safe 档专用。真值表 61-62 行实测:API 存储层
    # 保留 style 内 opacity:0 起手态(淡入动画初始态)。置 True 时跳过
    # opacity:0 -> opacity:1 改写,但保留 neutralize_layout_tricks 的其余行为
    # (position:absolute 隐藏——存储层存活[真值表 74]但渲染层多方一致失效,
    # 宁紧勿松不放)。默认 False,既有 profile 行为逐字节不变。
    keep_opacity_zero: bool = False


def _wechat_profile() -> RenderProfile:
    # Import here (not at module top) so render_profiles can be imported by
    # wechat_sanitize without a cycle.
    from app.services.wechat_sanitize import (
        ALLOWED_STYLE_PROPERTIES,
        _ALLOWED_DISPLAY_VALUES,
        _ALLOWED_POSITION_VALUES,
    )

    return RenderProfile(
        name="wechat",
        allowed_style_properties=ALLOWED_STYLE_PROPERTIES,
        allowed_display_values=_ALLOWED_DISPLAY_VALUES,
        allowed_position_values=_ALLOWED_POSITION_VALUES,
        rename_div_to_section=True,
        rename_semantic_tags=True,
        strip_class_id=True,
        strip_data_attrs=True,
        convert_button_anchors=True,
        inject_table_layout_fixed=True,
        collapse_nested_sections=True,
        convert_pre_blocks=True,
        neutralize_layout_tricks=True,
    )


# Extra style properties the generic web profile permits on top of the
# WeChat-safe allowlist. These are exactly the modern-layout properties the
# WeChat profile drops.
_GENERIC_EXTRA_STYLE_PROPERTIES = frozenset({
    "transform", "transform-origin", "transition", "animation",
    "animation-name", "animation-duration", "animation-timing-function",
    "animation-delay", "animation-iteration-count", "animation-direction",
    "animation-fill-mode", "animation-play-state",
    "gap", "row-gap", "column-gap",
    "justify-content", "justify-items", "justify-self",
    "align-content", "align-items", "align-self",
    "flex", "flex-direction", "flex-wrap", "flex-flow",
    "flex-grow", "flex-shrink", "flex-basis", "order",
    "grid", "grid-template", "grid-template-columns", "grid-template-rows",
    "grid-template-areas", "grid-auto-columns", "grid-auto-rows",
    "grid-auto-flow", "grid-area", "grid-column", "grid-row",
    "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end",
    "cursor", "float", "clear", "z-index", "top", "right", "bottom", "left",
    "filter", "backdrop-filter", "will-change", "user-select",
    "pointer-events", "object-fit", "object-position", "aspect-ratio",
})

_GENERIC_EXTRA_DISPLAY_VALUES = frozenset({
    "flex", "inline-flex", "grid", "inline-grid", "list-item",
    "flow-root", "contents",
})

_GENERIC_EXTRA_POSITION_VALUES = frozenset({"absolute", "fixed", "sticky"})


def _generic_profile() -> RenderProfile:
    from app.services.wechat_sanitize import (
        ALLOWED_STYLE_PROPERTIES,
        _ALLOWED_DISPLAY_VALUES,
        _ALLOWED_POSITION_VALUES,
    )

    return RenderProfile(
        name="generic",
        allowed_style_properties=ALLOWED_STYLE_PROPERTIES | _GENERIC_EXTRA_STYLE_PROPERTIES,
        allowed_display_values=_ALLOWED_DISPLAY_VALUES | _GENERIC_EXTRA_DISPLAY_VALUES,
        allowed_position_values=_ALLOWED_POSITION_VALUES | _GENERIC_EXTRA_POSITION_VALUES,
        rename_div_to_section=False,
        rename_semantic_tags=False,
        strip_class_id=False,
        strip_data_attrs=False,
        convert_button_anchors=False,
        inject_table_layout_fixed=False,
        collapse_nested_sections=False,
        convert_pre_blocks=False,
        neutralize_layout_tricks=False,
    )


# Built lazily-then-cached on first access via module-level singletons.
WECHAT_PROFILE = _wechat_profile()
GENERIC_PROFILE = _generic_profile()


PROFILES = {
    "wechat": WECHAT_PROFILE,
    "generic": GENERIC_PROFILE,
    "web": GENERIC_PROFILE,  # "web" is an alias for "generic"
}


def get_profile(name: str = "wechat") -> RenderProfile:
    """Return the profile for ``name``, falling back to WeChat on unknown.

    Unknown names (typos, None, anything not in :data:`PROFILES`) resolve to
    the safe WeChat profile rather than raising — callers thread a string from
    the API and a bad value must degrade safely, never 500.
    """
    if not name:
        return WECHAT_PROFILE
    return PROFILES.get(name.lower(), WECHAT_PROFILE)


# ---------------------------------------------------------------------------
# Shared security floor — used by BOTH render profiles AND reverse-import.
# ---------------------------------------------------------------------------

_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_SCRIPT_OPEN_RE = re.compile(r"</?script\b[^>]*>", re.IGNORECASE)
_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
_STYLE_OPEN_RE = re.compile(r"</?style\b[^>]*>", re.IGNORECASE)
_ON_HANDLER_DQ_RE = re.compile(r'\s+on\w+\s*=\s*"[^"]*"', re.IGNORECASE)
_ON_HANDLER_SQ_RE = re.compile(r"\s+on\w+\s*=\s*'[^']*'", re.IGNORECASE)
_ON_HANDLER_UQ_RE = re.compile(r"\s+on\w+\s*=\s*[^\s>]+", re.IGNORECASE)
_EMBED_PAIR_RE = re.compile(
    r"<(iframe|embed|object|video|audio|canvas|form|input|button|select|textarea)\b[^>]*>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)
_EMBED_VOID_RE = re.compile(
    r"<(?:iframe|embed|object|source|track|input)\b[^>]*/?>", re.IGNORECASE
)
# javascript: / vbscript: / data: in href/src/xlink:href attributes.
_DANGEROUS_URL_RE = re.compile(
    r'''(\s(?:href|src|xlink:href|formaction|action)\s*=\s*)(["']?)\s*'''
    r"(?:javascript|vbscript|data)\s*:[^\"'>\s]*\2",
    re.IGNORECASE,
)


def strip_dangerous(html: str) -> str:
    """Remove script-execution vectors from an HTML fragment.

    This is the security FLOOR shared by every profile and by reverse-import.
    It removes ``<script>``/``<style>`` (and stray open/close tags), all
    ``on*`` event handlers (quoted + unquoted), embeds/form controls, and
    neutralizes ``javascript:``/``vbscript:``/``data:`` URLs in href/src.

    It deliberately does NOT touch class/id/data-* or layout CSS — that is
    profile-specific narrowing handled at render time. Import only needs the
    dangerous-subset strip so generic-profile fidelity is preserved.
    """
    if not html:
        return html
    html = _SCRIPT_RE.sub("", html)
    html = _SCRIPT_OPEN_RE.sub("", html)
    html = _STYLE_RE.sub("", html)
    html = _STYLE_OPEN_RE.sub("", html)
    html = _EMBED_PAIR_RE.sub("", html)
    html = _EMBED_VOID_RE.sub("", html)
    html = _ON_HANDLER_DQ_RE.sub("", html)
    html = _ON_HANDLER_SQ_RE.sub("", html)
    html = _ON_HANDLER_UQ_RE.sub("", html)
    # Drop the whole attribute when its URL value is dangerous.
    html = _DANGEROUS_URL_RE.sub("", html)
    return html
