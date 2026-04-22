"""WeChat SVG / HTML compatibility validator.

Pure-function static checker for user-authored HTML blocks destined for
WeChat Official Account articles. Reports (never modifies) violations of
the 20-attribute SVG animation whitelist plus the HTML/CSS restrictions
documented in ``docs/wechat-svg/``.

Design contract:
    - Never mutates input. Caller decides what to do with the report.
    - Returns plain dicts so the same module can power CLI, API, tests,
      and agent tooling without coupling.
    - ``issues`` = must-fix (WeChat will silently strip). ``warnings`` =
      human-review (xmlns missing, css var, etc.).

Reference source: wechat-svg-design.skill -> scripts/validate_wechat_svg.py
"""
from __future__ import annotations

import re
from typing import TypedDict


# 20 whitelisted attributeName values (animate / set / animateTransform)
WHITELIST_ATTRIBUTES: frozenset[str] = frozenset({
    # animate
    "x", "y", "width", "height", "opacity",
    "d", "points", "cx", "cy", "r",
    "stroke-width", "stroke-dasharray", "stroke-dashoffset", "fill",
    # set
    "visibility",
    # animateTransform -> attributeName is literally "transform"
    "transform",
})

# Allowed animateTransform `type` values
VALID_TRANSFORM_TYPES: frozenset[str] = frozenset(
    {"translate", "scale", "rotate", "skewX", "skewY"}
)

# CSS properties WeChat strips on save
FORBIDDEN_CSS_LITERALS: tuple[str, ...] = (
    "clip-path",
    "mask",
    "backdrop-filter",
    "mix-blend-mode",
    "position: absolute",
    "position: fixed",
    "position:absolute",
    "position:fixed",
)

# CSS `filter:` inside style blocks (excluding SVG <filter> element)
_FORBIDDEN_CSS_FILTER_IN_STYLE_ATTR = re.compile(
    r"(?<!\w)filter\s*:\s*(?!none)[a-zA-Z]", re.IGNORECASE
)

FORBIDDEN_TAGS: tuple[str, ...] = ("script", "iframe", "embed", "object", "form")

_FORBIDDEN_EVENT_HANDLERS = re.compile(
    r"\son(click|load|mouseover|mouseout|touchstart|touchend|touchmove|"
    r"focus|blur|change|submit)\s*=",
    re.IGNORECASE,
)

_ATTRIBUTE_NAME_RE = re.compile(r'attributeName\s*=\s*["\']([^"\']+)["\']')
_ANIMATE_TRANSFORM_TYPE_RE = re.compile(
    r"<animateTransform[^>]*?type\s*=\s*[\"']([^\"']+)[\"']",
    re.IGNORECASE | re.DOTALL,
)
_ANIMATE_TAG_RE = re.compile(r"<animate\b([^>]+)/?>", re.IGNORECASE | re.DOTALL)
_STYLE_ATTR_RE = re.compile(r'style\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_SVG_OPEN_RE = re.compile(r"<svg\b([^>]*)>", re.IGNORECASE)
_CSS_VAR_RE = re.compile(r"var\(\s*--")

_XMLNS_SVG = 'xmlns="http://www.w3.org/2000/svg"'
_XMLNS_SVG_SINGLE = "xmlns='http://www.w3.org/2000/svg'"


class Finding(TypedDict):
    line: int
    rule: str
    message: str
    suggestion: str


class ValidationReport(TypedDict):
    issues: list[Finding]
    warnings: list[Finding]
    stats: dict[str, int]


def _line_of(content: str, index: int) -> int:
    return content.count("\n", 0, index) + 1


def _check_animation_attributes(content: str, issues: list[Finding]) -> None:
    for m in _ATTRIBUTE_NAME_RE.finditer(content):
        attr = m.group(1).strip()
        if attr not in WHITELIST_ATTRIBUTES:
            issues.append({
                "line": _line_of(content, m.start()),
                "rule": "attribute-whitelist",
                "message": f'attributeName="{attr}" 不在微信白名单（20 项）内',
                "suggestion": "改用白名单属性，或查 docs/wechat-svg/whitelist.md 找等价写法",
            })


def _check_transform_types(content: str, issues: list[Finding]) -> None:
    for m in _ANIMATE_TRANSFORM_TYPE_RE.finditer(content):
        type_val = m.group(1).strip()
        if type_val not in VALID_TRANSFORM_TYPES:
            issues.append({
                "line": _line_of(content, m.start()),
                "rule": "animateTransform-type",
                "message": f'animateTransform type="{type_val}" 不合法',
                "suggestion": "应为 translate / scale / rotate / skewX / skewY 之一",
            })


def _check_indefinite_repeat(content: str, warnings: list[Finding]) -> None:
    for m in _ANIMATE_TAG_RE.finditer(content):
        tag_body = m.group(1)
        hw = re.search(
            r'attributeName\s*=\s*["\'](height|width)["\']',
            tag_body, re.IGNORECASE,
        )
        indef = re.search(
            r'repeatCount\s*=\s*["\']indefinite["\']', tag_body, re.IGNORECASE
        )
        if hw and indef:
            warnings.append({
                "line": _line_of(content, m.start()),
                "rule": "repeatCount-indefinite",
                "message": f'<animate> 在 {hw.group(1)} 上使用 repeatCount="indefinite"',
                "suggestion": "微信不稳定，改用具体次数或循环 opacity / transform",
            })


def _check_forbidden_css(content: str, issues: list[Finding]) -> None:
    for prop in FORBIDDEN_CSS_LITERALS:
        for m in re.finditer(re.escape(prop), content, re.IGNORECASE):
            issues.append({
                "line": _line_of(content, m.start()),
                "rule": "forbidden-css",
                "message": f"禁用的 CSS 属性 `{prop}`",
                "suggestion": "改用 SVG 原生元素或零高结构，详见 docs/wechat-svg/html-css-restrictions.md",
            })

    for block in _STYLE_ATTR_RE.finditer(content):
        style_body = block.group(1)
        if _FORBIDDEN_CSS_FILTER_IN_STYLE_ATTR.search(style_body):
            issues.append({
                "line": _line_of(content, block.start()),
                "rule": "forbidden-css-filter",
                "message": "style 属性中使用了 CSS `filter`",
                "suggestion": "微信会剥离，改用 SVG <filter> 元素或预处理图片",
            })


def _check_forbidden_tags(content: str, issues: list[Finding]) -> None:
    for tag in FORBIDDEN_TAGS:
        for m in re.finditer(rf"<{tag}\b", content, re.IGNORECASE):
            issues.append({
                "line": _line_of(content, m.start()),
                "rule": "forbidden-tag",
                "message": f"禁用的 HTML 标签 `<{tag}>`",
                "suggestion": "微信会整段删除，用 SVG 动画 begin 或外链替代",
            })


def _check_event_handlers(content: str, issues: list[Finding]) -> None:
    for m in _FORBIDDEN_EVENT_HANDLERS.finditer(content):
        issues.append({
            "line": _line_of(content, m.start()),
            "rule": "event-handler",
            "message": f"内联事件处理器 `{m.group(0).strip()}`",
            "suggestion": "微信禁用 JavaScript，用 SVG 的 begin=\"id.click\" 跨元素触发",
        })


def _check_svg_xmlns(content: str, warnings: list[Finding]) -> None:
    for m in _SVG_OPEN_RE.finditer(content):
        attrs = m.group(1)
        if _XMLNS_SVG not in attrs and _XMLNS_SVG_SINGLE not in attrs:
            warnings.append({
                "line": _line_of(content, m.start()),
                "rule": "svg-xmlns",
                "message": "<svg> 标签未声明 xmlns",
                "suggestion": '加上 xmlns="http://www.w3.org/2000/svg"，否则某些端渲染失败',
            })


def _check_css_variables(content: str, warnings: list[Finding]) -> None:
    for m in _CSS_VAR_RE.finditer(content):
        warnings.append({
            "line": _line_of(content, m.start()),
            "rule": "css-variable",
            "message": "使用了 CSS 变量 `var(--...)`",
            "suggestion": "微信图文编辑器可能剥离，建议写死颜色值",
        })


def _gather_stats(content: str) -> dict[str, int]:
    return {
        "svg_count": len(re.findall(r"<svg\b", content, re.IGNORECASE)),
        "animate_count": len(re.findall(r"<animate\b", content, re.IGNORECASE)),
        "animate_transform_count": len(
            re.findall(r"<animateTransform\b", content, re.IGNORECASE)
        ),
        "set_count": len(re.findall(r"<set\b", content, re.IGNORECASE)),
        "anchor_count": len(re.findall(r"<a\s[^>]*href", content, re.IGNORECASE)),
    }


def validate_html(html: str) -> ValidationReport:
    """Run all checks against a piece of HTML/SVG source.

    Returns a dict with ``issues`` (must-fix), ``warnings`` (review), and
    ``stats`` (informational counts). Never raises for malformed input —
    the checker is regex-based and fails soft.
    """
    issues: list[Finding] = []
    warnings: list[Finding] = []

    if not html:
        return {"issues": issues, "warnings": warnings, "stats": _gather_stats("")}

    _check_animation_attributes(html, issues)
    _check_transform_types(html, issues)
    _check_indefinite_repeat(html, warnings)
    _check_forbidden_css(html, issues)
    _check_forbidden_tags(html, issues)
    _check_event_handlers(html, issues)
    _check_svg_xmlns(html, warnings)
    _check_css_variables(html, warnings)

    return {"issues": issues, "warnings": warnings, "stats": _gather_stats(html)}
