"""WeChat SVG / HTML compatibility validator.

Pure-function static checker for user-authored HTML blocks destined for
WeChat Official Account articles. Reports (never modifies) violations of
the SVG animation attributeName whitelist plus the HTML/CSS restrictions
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


# Whitelisted attributeName values (animate / set / animateTransform).
#
# P1-2 校准（依据 T/CASME 1609—2024《微信公众平台 SVG 排版规范》附录 A
# animate/set/animateTransform 的 attributeName 字段白名单，参考
# https://www.fudan.design/svg.html；以及 docs/research/svg-capability-research.md
# §2.2）。真值表 docs/research/wechat-svg-truth-table.md（2026-06-13 add_draft 回读）。
#
#   * stroke / rx / ry 放行：rx/ry 是 <rect>/<ellipse> 的几何呈现属性、stroke
#     是描边呈现属性，作为 animate 目标属性被多源实测（axtonliu.ai 2025-03、
#     CSDN z858466）确认保留；此前不在白名单导致 attributeName="stroke|rx|ry"
#     被误判为 issue。真值表 2026-06-13 确认 allowed（探针 stroke-rx-ry-attrs：
#     三者作为独立 SVG 属性真机回读全部 ALLOWED 保留）——P1-2 放行决策被真机证实正确。
#   * stroke-dasharray 不在 attributeName 白名单内、改由 _check_animation_attributes
#     降级为 warning（见下）：真值表 2026-06-13（探针 stroke-dasharray-attr）确认
#     【静态 presentation attribute】stroke-dasharray="7 13" 真机回读 ALLOWED 保留，
#     故静态属性不再告警、静默放行（本检查只看 attributeName=，本就不碰静态属性）。
#     但作为 <animate attributeName="stroke-dasharray"> 的动画目标，规范附录 A 未列、
#     真值表未单测该用法，故对 animate 目标保留弱提示（存疑，非硬拦）。
WHITELIST_ATTRIBUTES: frozenset[str] = frozenset({
    # animate
    "x", "y", "width", "height", "opacity",
    "d", "points", "cx", "cy", "r",
    "stroke-width", "stroke-dashoffset", "fill",
    # geometry / paint presentation attributes (P1-2 放行；真值表 2026-06-13 确认 allowed)
    "stroke", "rx", "ry",
    # 批3(2026-07-04,调研报告 §1.3):stroke-linecap 在 T/CASME 1609—2024
    # 行业标准 attributeName 白名单内,此前缺失会误杀。
    "stroke-linecap",
    # set
    "visibility",
    # animateTransform -> attributeName is literally "transform"
    "transform",
})

# stroke-dasharray 作为 <animate> attributeName：保留弱提示（warning，非 issue）。
# 真值表 2026-06-13（探针 stroke-dasharray-attr）确认【静态 presentation
# attribute】stroke-dasharray="7 13" 真机回读 ALLOWED 保留——与研究报告 §2.2
# 引用的「多源实测保存时被剥」相反，那批实测的过度保守结论由真机推翻。因此：
#   * 静态 stroke-dasharray 属性：合法、静默放行（本模块只扫 attributeName=，
#     本就不碰静态属性，无需特判即不告警）。
#   * <animate attributeName="stroke-dasharray">（动画目标）：真值表只测了静态
#     属性、未单测把它当 SMIL 动画目标的场景，规范附录 A 也只列 stroke-dashoffset，
#     故对此用法保留弱提示（存疑），不硬拦也不假装安全。
_DASHARRAY_UNCERTAIN_ATTR = "stroke-dasharray"

# Allowed animateTransform `type` values
VALID_TRANSFORM_TYPES: frozenset[str] = frozenset(
    {"translate", "scale", "rotate", "skewX", "skewY"}
)

# CSS properties WeChat strips on save. Matched as property names inside
# style attributes / <style> blocks only — a bare substring scan over the
# whole document flags prose that merely contains the word "mask" and
# hard-blocks copy on a false positive.
FORBIDDEN_CSS_PROPERTIES: tuple[str, ...] = (
    "clip-path",
    "mask",
    "backdrop-filter",
    "mix-blend-mode",
    # 批3(2026-07-04,调研报告 §1.3):内联 CSS `animation`(及 animation-*
    # 长写,由 prop_re 的 `(?:-[a-z-]+)?` 一并覆盖)此前漏检。<style> 块整体
    # 被微信剥离(真值表 49-51 行),CSS 动画唯一出路是内联,而内联 animation
    # 依赖的 @keyframes 必在 <style> 内 => 必死;SMIL 是唯一动画通道。
    "animation",
)

_FORBIDDEN_POSITION_RE = re.compile(
    r"position\s*:\s*(absolute|fixed)\b", re.IGNORECASE
)

# HTML5 semantic wrappers WeChat's paste handler / draft ingest unwraps,
# dropping the tag AND its style attribute (page backgrounds vanish). The
# sanitizer auto-rewrites them to <section>; the validator surfaces them
# as warnings so raw-HTML callers (/validate) learn about the rewrite.
SEMANTIC_WRAPPER_TAGS: tuple[str, ...] = (
    "article", "main", "header", "footer", "aside", "nav",
)

# Backwards-compat alias (position literals moved to a whitespace-tolerant
# regex, see _FORBIDDEN_POSITION_RE).
FORBIDDEN_CSS_LITERALS = FORBIDDEN_CSS_PROPERTIES

# CSS `filter:` inside style blocks (excluding SVG <filter> element)
_FORBIDDEN_CSS_FILTER_IN_STYLE_ATTR = re.compile(
    r"(?<!\w)filter\s*:\s*(?!none)[a-zA-Z]", re.IGNORECASE
)

FORBIDDEN_TAGS: tuple[str, ...] = ("script", "iframe", "embed", "object", "form")

# Wildcard match for any inline DOM event-handler attribute. `on` followed by
# alpha chars then `=` covers onclick/onload AND onerror/onmouseenter/
# onpointerdown/onanimationend/… plus any future handler. Whitespace prefix
# (\s+) ensures it only matches a standalone attribute, not a substring inside
# another attribute value or token. No standard SVG/HTML attribute other than
# event handlers starts with `on`, so this does not false-positive.
_FORBIDDEN_EVENT_HANDLERS = re.compile(
    r"\son[a-z][a-z0-9]*\s*=",
    re.IGNORECASE,
)

# IGNORECASE so that lxml/premailer-lowercased `attributename=` is still
# matched; the captured VALUE is normalized separately at the whitelist check.
_ATTRIBUTE_NAME_RE = re.compile(
    r'attributeName\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE
)
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

# P1-2 新增告警用正则。真值表 2026-06-13 确认 stripped（探针 style-block）。
# <style> 整块：微信正文会被服务端整块删除，@keyframes / 媒体查询 / 伪类 /
# CSS animation 全失效，只有内联 style 属性存活。依据：研究报告 §2.1
# confirmed + 真值表 style-block 探针（块内选择器与 @keyframes 真机回读
# STRIPPED 被剥，独立锚点存活）。注意 wechat_sanitize.py:613 的 <style> 剥离
# 只作用于「抽出 SVG 子树后的外层 HTML」（611 行先抽走 SVG）；SVG 内嵌 <style>
# 的删除真值表 style-block 探针已一并证实，故照常告警。
# `(?=[\s>/])` anchors to a real <style> element open tag, so a hypothetical
# custom element like <style-guide> (where \b would still fire at the e-/ edge)
# does not trip the warning.
_STYLE_BLOCK_RE = re.compile(r"<style(?=[\s>/])", re.IGNORECASE)
# <a href> 链接：微信公众号 SVG 不支持 <a>（多源 confirmed：CSDN
# liixnhai / z858466；T/CASME 1609—2024 附录 A 未列 <a>，研究报告 §2.1）；
# 正文 <a> 外链同样受限（仅白名单/官方链接可点，任意外链会被剥/不可点）。
# 本检查作用于整篇文档（comment-masked，SVG 子树保留），对 SVG 内与正文
# <a> 一并告警——这是有意为之，message 已覆盖两种语境。复用 _gather_stats
# 的 anchor 模式以保持一致：<a ...href...>。
_ANCHOR_RE = re.compile(r"<a\s[^>]*href", re.IGNORECASE)
# <image> 的 href / xlink:href 取值。微信 SVG <image> 只能引用素材库
# mmbiz.qpic.cn CDN 链接；外链会被拦/防盗链，base64 data URI 会被剥（多源
# confirmed：axtonliu.ai 2025-03、CSDN liixnhai；研究报告 §2.2/§2.3）。
_IMAGE_TAG_RE = re.compile(r"<image\b[^>]*>", re.IGNORECASE | re.DOTALL)
# Capture the source value of an <image>. Covers xlink:href / href / the
# non-standard src= some authoring tools emit, and BOTH quoted and unquoted
# (HTML5-legal) attribute values. Group 1 = quoted value, group 2 = unquoted.
_IMAGE_HREF_RE = re.compile(
    r"(?:xlink:)?(?:href|src)\s*=\s*(?:[\"']([^\"']*)[\"']|([^\s>]+))",
    re.IGNORECASE,
)
# Active-content pseudo-schemes that must never reach an <image> source. The
# renderer hard-blocks javascript:/data: with a raise (renderers/svg_renderer.py);
# the validator surfaces them as a warning for defense-in-depth parity.
_IMAGE_ACTIVE_SCHEME_RE = re.compile(r"^\s*(javascript|vbscript):", re.IGNORECASE)
# 微信图床安全域名后缀。qpic.cn 系微信 CDN（mmbiz.qpic.cn 为 SVG 专用），
# 用 host 后缀匹配 *.qpic.cn 放宽（依调研结论）。真值表 2026-06-13（探针
# external-image）确认服务端 sanitizer 保留 <image> 外链；渲染层防盗链是否显示
# 另需人工核验（见 _check_image_source 措辞）。
_WECHAT_CDN_HOST_SUFFIX = ".qpic.cn"
_URL_HOST_RE = re.compile(r"^[a-z][a-z0-9+.-]*://([^/?#]+)", re.IGNORECASE)

# F. id 全量剥离（真值表 2026-06-13，探针 svg-id-retention / html-id-retention）。
# 真机回读：元素上的 id= 属性被微信 STRIPPED，但引用字符串 url(#id) / href=#id /
# begin=id.click（跨元素 SMIL 触发）全部 KEPT 保留。后果：定义端 id 没了、引用端
# 悬空，渐变/滤镜/clipPath/mask/use/mpath/跨元素 SMIL 触发整条链路真机失效。
# 仅当【同时】检测到 id= 定义 且存在某种依赖 id 的引用时告警（避免误报）。
#   * begin="click" / "touchstart"（无 id 前缀的同元素自触发，ALLOWED）不触发。
# `(?<![\w-])` rather than `\b`: a bare `\b` fires at the `-`/`i` boundary
# inside hyphenated custom attributes (data-id=, listed-id=, aria-id=, node-id=),
# falsely matching `id="…"` and tripping id-stripped-dangling-ref on documents
# with NO real SVG id= definition. The negative lookbehind for word-char OR
# hyphen ensures only a standalone `id=` attribute matches; ` id="g"` and
# `<rect id="g">` still match, `data-id="x"` does not.
_ID_DEF_RE = re.compile(r"""(?<![\w-])id\s*=\s*["'][^"']+["']""", re.IGNORECASE)
# url(#id) —— 渐变/滤镜/clipPath/mask 的 fill/stroke/filter/clip-path/mask 引用。
_REF_URL_RE = re.compile(r"url\(\s*#", re.IGNORECASE)
# href="#id" / xlink:href="#id" —— <use> / <mpath> / 渐变继承。
_REF_HREF_HASH_RE = re.compile(
    r"""(?:xlink:)?href\s*=\s*["']\s*#""", re.IGNORECASE
)
# begin / end = "<token>.click" / "<token>.end" 等跨元素 SMIL 同步（token 为
# 另一元素的 id）。要求点号左侧有非空 token，且该 token 不是裸事件名本身——
# begin="click" / "touchstart"（无点号 / 无 id 前缀）不匹配，故自触发不告警。
# 事件名后缀覆盖常见 SMIL 触发：click/touchstart/touchend/mouseover/begin/end/…
_REF_SMIL_SYNC_RE = re.compile(
    r"""\b(?:begin|end)\s*=\s*["'][^"']*?"""
    r"""\b([A-Za-z_][\w:.-]*)\.(?:click|begin|end|"""
    r"""mousedown|mouseup|mouseover|mouseout|"""
    r"""touchstart|touchend|focus|blur|activate|repeat)\b""",
    re.IGNORECASE,
)


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


_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_SVG_SUBTREE_RE = re.compile(r"<svg\b.*?</svg\s*>", re.IGNORECASE | re.DOTALL)


def _blank_match(m: re.Match) -> str:
    """Replace a matched span with same-length whitespace, preserving newlines
    so every later ``_line_of`` offset still maps to the original line."""
    return "".join("\n" if ch == "\n" else " " for ch in m.group(0))


def _mask_comments(content: str) -> str:
    """Blank out HTML-comment interiors (review F6): regex checks scan raw text
    and would otherwise flag inert markup (e.g. an <animate> or `clip-path`
    inside ``<!-- ... -->``). Lengths/newlines are preserved so reported line
    numbers stay correct."""
    return _HTML_COMMENT_RE.sub(_blank_match, content)


def _mask_svg_subtrees(content: str) -> str:
    """Blank out the INTERIOR of every ``<svg>...</svg>`` subtree (review F7).

    The copy/push sanitizer protects SVG-subtree styles (``clip-path``, ``mask``,
    ``filter`` …) and lets WeChat strip them server-side, so reporting them as
    must-fix forbidden-CSS issues here contradicts what actually ships. We blank
    the subtree before the forbidden-CSS scan so those properties aren't flagged
    inside SVG, while the same properties in plain HTML (which the sanitizer DOES
    strip) keep being reported. Length/newlines preserved for line numbers."""
    return _SVG_SUBTREE_RE.sub(_blank_match, content)


def _check_animation_attributes(
    content: str, issues: list[Finding], warnings: list[Finding]
) -> None:
    for m in _ATTRIBUTE_NAME_RE.finditer(content):
        attr = m.group(1).strip()
        # premailer / lxml may upper-case attribute values (e.g. "Opacity").
        # Normalize before the whitelist check to avoid false positives /
        # false negatives. The original (un-normalized) value is preserved
        # in the message so the author sees exactly what they wrote.
        normalized = attr.lower()
        # stroke-dasharray 作为 <animate> 动画目标：保留弱提示（warning）。真值表
        # 2026-06-13 仅证实【静态】stroke-dasharray 属性 ALLOWED；把它当 SMIL 动画
        # 目标的场景规范未列、真机未单测，故存疑而非硬拦。静态属性不会进此分支
        # （本模块只匹配 attributeName=），已随真值表确认静默放行。
        if normalized == _DASHARRAY_UNCERTAIN_ATTR:
            warnings.append({
                "line": _line_of(content, m.start()),
                "rule": "attribute-dasharray-uncertain",
                "message": f'attributeName="{attr}" 作为 SMIL 动画目标存疑（真值表仅确认静态 stroke-dasharray 属性保留，动画目标未单测）',
                "suggestion": "改用 stroke-dashoffset 做描边动画更稳妥；静态 stroke-dasharray 属性已实测保留可放心使用",
            })
            continue
        if normalized not in WHITELIST_ATTRIBUTES:
            issues.append({
                "line": _line_of(content, m.start()),
                "rule": "attribute-whitelist",
                "message": f'attributeName="{attr}" 不在微信白名单内',
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


def _iter_css_contexts(content: str):
    """Yield ``(absolute_offset, css_text)`` for every style attribute and
    <style> block in *content*. Forbidden-CSS scanning is restricted to
    these contexts so article PROSE containing words like "mask" can't
    trigger a copy-blocking false positive."""
    for m in _STYLE_ATTR_RE.finditer(content):
        yield m.start(1), m.group(1)
    for m in re.finditer(
        r"<style[^>]*>(.*?)</style>", content, re.IGNORECASE | re.DOTALL
    ):
        yield m.start(1), m.group(1)


def _check_forbidden_css(content: str, issues: list[Finding]) -> None:
    for offset, css_text in _iter_css_contexts(content):
        for prop in FORBIDDEN_CSS_PROPERTIES:
            # Property-name position: start of declaration, after `;`, or a
            # vendor prefix — never inside a value or a longer property name.
            prop_re = re.compile(
                rf"(?:^|;|\s|-webkit-|-moz-|-o-){re.escape(prop)}(?:-[a-z-]+)?\s*:",
                re.IGNORECASE,
            )
            for m in prop_re.finditer(css_text):
                issues.append({
                    "line": _line_of(content, offset + m.start()),
                    "rule": "forbidden-css",
                    "message": f"禁用的 CSS 属性 `{prop}`",
                    "suggestion": "改用 SVG 原生元素或零高结构，详见 docs/wechat-svg/html-css-restrictions.md",
                })
        for m in _FORBIDDEN_POSITION_RE.finditer(css_text):
            issues.append({
                "line": _line_of(content, offset + m.start()),
                "rule": "forbidden-css",
                "message": f"禁用的 CSS 属性 `position: {m.group(1)}`",
                "suggestion": "改用 SVG 原生元素或零高结构，详见 docs/wechat-svg/html-css-restrictions.md",
            })
        if _FORBIDDEN_CSS_FILTER_IN_STYLE_ATTR.search(css_text):
            issues.append({
                "line": _line_of(content, offset),
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
            "suggestion": "微信禁用 JavaScript，改用 SVG 原生交互：在目标元素上写 begin=\"自身id.click\"（SVG 子树内的 id 会被复制/推送管线保留）",
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


def _check_semantic_wrapper_tags(content: str, warnings: list[Finding]) -> None:
    for tag in SEMANTIC_WRAPPER_TAGS:
        for m in re.finditer(rf"<{tag}\b[^>]*>", content, re.IGNORECASE):
            styled = 'style=' in m.group(0).lower()
            warnings.append({
                "line": _line_of(content, m.start()),
                "rule": "semantic-wrapper-tag",
                "message": (
                    f"微信编辑器会拆掉 `<{tag}>`"
                    + ("并丢弃其 style（页面背景/内边距会消失）" if styled else "")
                ),
                "suggestion": "改用 <section>；复制/推送管线会自动改写",
            })


def _check_css_variables(content: str, warnings: list[Finding]) -> None:
    for m in _CSS_VAR_RE.finditer(content):
        warnings.append({
            "line": _line_of(content, m.start()),
            "rule": "css-variable",
            "message": "使用了 CSS 变量 `var(--...)`",
            "suggestion": "微信图文编辑器可能剥离，建议写死颜色值",
        })


def _check_style_block(content: str, warnings: list[Finding]) -> None:
    """<style>…</style> 整块会被微信服务端删除。真值表 2026-06-13 确认 stripped
    （探针 style-block：块内选择器与 @keyframes 真机回读 STRIPPED 被剥，独立锚点
    存活）——P1-2 新增的 <style> 整块告警被真机证实正确。依据：研究报告 §2.1
    confirmed + 真值表 style-block 探针。告警级（非 issue）：内容仍能复制，只是
    <style> 内样式/动画（@keyframes / 媒体查询 / 伪类 / CSS animation）会失效。
    此检查不经过 _mask_svg_subtrees，故 SVG 子树内的 <style> 也照常告警。"""
    for m in _STYLE_BLOCK_RE.finditer(content):
        warnings.append({
            "line": _line_of(content, m.start()),
            "rule": "style-block-stripped",
            "message": "<style> 整块会被微信删除（@keyframes / 媒体查询 / 伪类 / CSS animation 全部失效）",
            "suggestion": "只用内联 style 属性与 SVG presentation attribute / SMIL 动画",
        })


def _check_svg_anchor(content: str, warnings: list[Finding]) -> None:
    """<a href> 链接在微信内行为受限（SVG 内不支持 <a>，正文外链仅白名单可点）。
    多源 confirmed：CSDN liixnhai / z858466；T/CASME 1609—2024 附录 A 未列 <a>；
    研究报告 §2.1。本检查作用于整篇文档（SVG 内与正文一并告警，message 已覆盖
    两种语境），故任意 <a href> 均会得到 anchor-restricted 告警——有意为之。
    告警级（非 issue），不阻断复制/推送。真值表 2026-06-13 无 <a> 专项探针，
    无新数据，维持告警原状（不改判）。"""
    for m in _ANCHOR_RE.finditer(content):
        warnings.append({
            "line": _line_of(content, m.start()),
            "rule": "anchor-restricted",
            "message": "<a> 链接在微信 SVG / 正文内行为受限（可能被删除或不可点）",
            "suggestion": "SVG 内避免 <a>；正文跳转改用复制/推送管线支持的按钮结构",
        })


def _check_image_source(content: str, warnings: list[Finding]) -> None:
    """SVG <image> 的来源限制：建议引用微信素材库 *.qpic.cn CDN。
    真值表 2026-06-13（探针 external-image）：<image> 标签 + 外链 href + 显式
    width 在【服务端】sanitizer 回读 HTML 中 ALLOWED 保留——故服务端不会剥外链
    <image>。但真值表脚注明确：本表仅验证服务端 sanitizer，渲染层（iOS/Android
    真机防盗链是否显示）另需人工核验。因此外链告警措辞改为「服务端保留、渲染层
    可能因防盗链不显示」（仍是有用提示，故保留告警，仅校准措辞）。
    base64 data URI 会被剥；javascript:/vbscript: 伪协议被拦（渲染层硬拦，此处
    告警 parity）。取值覆盖 href / xlink:href / src（非标但部分编辑器会出），含
    未加引号的 HTML5 合法写法。依据真值表 external-image + 研究报告 §2.2/§2.3。
    告警级。host 后缀匹配 *.qpic.cn 放宽（依调研结论）。"""
    for tag_m in _IMAGE_TAG_RE.finditer(content):
        tag = tag_m.group(0)
        href_m = _IMAGE_HREF_RE.search(tag)
        if not href_m:
            continue
        href = (href_m.group(1) or href_m.group(2) or "").strip()
        line = _line_of(content, tag_m.start())
        if _IMAGE_ACTIVE_SCHEME_RE.match(href):
            warnings.append({
                "line": line,
                "rule": "image-external-link",
                "message": "<image> 使用 javascript:/vbscript: 伪协议，微信会拦截/剥除（渲染层已硬拦）",
                "suggestion": "上传到微信素材库，改用 mmbiz.qpic.cn 链接",
            })
            continue
        if href.lower().startswith("data:"):
            warnings.append({
                "line": line,
                "rule": "image-base64-stripped",
                "message": "<image> 使用 base64 data URI，微信可能剥除导致不显示",
                "suggestion": "上传到微信素材库，改用 mmbiz.qpic.cn 链接",
            })
            continue
        host_m = _URL_HOST_RE.match(href)
        if not host_m:
            # 相对路径 / 锚点引用 / #id 之类，非外链，跳过（不误报）。
            continue
        host = host_m.group(1).split("@")[-1].split(":")[0].lower()
        # Bare apex `qpic.cn` resolves to the same Tencent CDN; endswith
        # ".qpic.cn" is False for it (no leading dot), so allow it explicitly.
        if host == "qpic.cn" or host.endswith(_WECHAT_CDN_HOST_SUFFIX):
            continue
        warnings.append({
            "line": line,
            "rule": "image-external-link",
            "message": f"<image> 引用外链（{host}）：服务端保留该 <image>，但外链在渲染层可能因防盗链不显示（真机渲染显示待核验）",
            "suggestion": "建议改用微信素材库 mmbiz.qpic.cn CDN 链接以确保真机显示",
        })


def _check_id_dangling_references(content: str, warnings: list[Finding]) -> None:
    """F. 微信剥离元素上的 id= 定义，但保留 url(#id)/href=#id/begin=id.click 等
    引用字符串，导致引用悬空、真机失效。仅当文档同时含 id= 定义【且】至少一处
    依赖 id 的引用时告警一次（避免误报）。

    真值表 2026-06-13（探针 svg-id-retention / html-id-retention）：id= STRIPPED，
    url(#…)/href=#…/begin=token.click(跨元素 SMIL 触发) KEPT。begin="click"/
    "touchstart"（同元素自触发，无 id 前缀）ALLOWED，不触发本告警。

    入参契约：必须接收 comment-masked 但【保留 SVG 子树内部】的文本（即
    validate_html 里的 ``masked`` 变量，非 ``masked_no_svg``）。本检查的目标正是
    SVG 内的 id 定义与引用（linearGradient / clipPath / filter / use / mpath），
    若误传 ``masked_no_svg``（SVG 子树被清空）则 _ID_DEF_RE/_REF_* 全部落空、检查
    静默失效。与 forbidden-CSS 用 ``masked_no_svg`` 的取舍方向相反，勿对齐。"""
    if not _ID_DEF_RE.search(content):
        return
    ref_m = (
        _REF_URL_RE.search(content)
        or _REF_HREF_HASH_RE.search(content)
        or _REF_SMIL_SYNC_RE.search(content)
    )
    if ref_m is None:
        return
    warnings.append({
        "line": _line_of(content, ref_m.start()),
        "rule": "id-stripped-dangling-ref",
        "message": (
            "微信会剥离元素上的 id 定义，但保留 url(#…)/href=\"#…\"/begin=\"id.click\" "
            "等引用，导致渐变/滤镜/clipPath/mask/use/mpath/跨元素 SMIL 触发在真机悬空失效"
        ),
        "suggestion": (
            "改用同元素自触发 begin=\"click\"（不依赖 id），或把依赖内联到引用元素上"
        ),
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

    # Mask inert HTML-comment interiors once (review F6) — every regex check
    # runs against this so commented-out markup never produces a finding. Line
    # numbers are preserved because masking keeps length + newlines.
    masked = _mask_comments(html)
    # Additionally blank SVG-subtree interiors for the forbidden-CSS scan only
    # (review F7): the sanitizer preserves those styles inside SVG.
    masked_no_svg = _mask_svg_subtrees(masked)

    _check_animation_attributes(masked, issues, warnings)
    _check_transform_types(masked, issues)
    _check_indefinite_repeat(masked, warnings)
    _check_forbidden_css(masked_no_svg, issues)
    _check_forbidden_tags(masked, issues)
    _check_event_handlers(masked, issues)
    _check_svg_xmlns(masked, warnings)
    _check_semantic_wrapper_tags(masked, warnings)
    _check_css_variables(masked, warnings)
    # P1-2 新增三类 warning（依据见各函数注释）。<style> 检测用 masked（保留
    # SVG 子树）——SVG 内嵌 <style> 同样被微信删除，需照常告警。真值表 2026-06-13
    # 探针 style-block 确认 stripped。
    _check_style_block(masked, warnings)
    _check_svg_anchor(masked, warnings)
    _check_image_source(masked, warnings)
    # F (真值表 2026-06-13)：id 被剥但 url(#)/href=#/begin=id.click 引用保留 -> 悬空。
    _check_id_dangling_references(masked, warnings)

    return {"issues": issues, "warnings": warnings, "stats": _gather_stats(html)}
