"""Interactive effect registry (P1-1).

A self-contained catalog of 8 WeChat-compatible interactive SVG effects.
Each effect declares text / image / color slots plus timing params, and a
template string with bare-token placeholders. ``render_effect`` fills slots,
sanitizes every value (XML-escape text, hex/named color whitelist, https-only
image URLs, clamped numeric timing), substitutes tokens, then runs the result
through ``svg_validator.validate_html`` — only an issue-free render returns
``status="ok"`` with html.

Hard rules (see briefing):
  - Validation goes ONLY through ``validate_html``. Never SvgRenderer
    (it bans id/class, which SMIL ``begin="id.click"`` needs).
  - Templates intentionally carry SVG-subtree ids for SMIL interaction; the
    copy/push pipeline preserves them.
  - Image tags are single-line self-closing with their token inside, so an
    empty/illegal URL can be stripped wholesale (background-color placeholder).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.svg_validator import validate_html


# --------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class TextSlot:
    name: str
    label: str
    default: str
    max_length: int = 40


@dataclass(frozen=True)
class ImageSlot:
    name: str
    label: str
    default: str = ""


@dataclass(frozen=True)
class ColorSlot:
    name: str
    label: str
    default: str


@dataclass(frozen=True)
class TimingParam:
    name: str
    label: str
    unit: str
    default: float
    min: float
    max: float
    step: float


@dataclass(frozen=True)
class Effect:
    id: str
    category: str
    title: str
    description: str
    text_slots: tuple[TextSlot, ...]
    image_slots: tuple[ImageSlot, ...]
    color_slots: tuple[ColorSlot, ...]
    timing_params: tuple[TimingParam, ...]
    template: str


CATEGORIES = ("expand", "carousel", "slide", "longpress", "quiz", "flip")


# --------------------------------------------------------------------------
# Sanitization helpers
# --------------------------------------------------------------------------
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{3,8}$")
_NAMED_RE = re.compile(r"^[A-Za-z]{1,20}$")
_URL_RE = re.compile(r"^https://[^\s\"'<>]+$")
# Percent-encoded chars that would, after URL-decoding by any downstream
# consumer (image proxy / CDN rewrite / server-side fetch), reintroduce the
# injection / control characters the literal-char regex above blocks:
# %00-%1f (controls incl. CR/LF/TAB), %22 ("), %27 ('), %3c (<), %3e (>),
# %5c (\). Reject these so a literal-safe URL can't smuggle them encoded.
_URL_BAD_PCT_RE = re.compile(
    r"%(0[0-9a-f]|1[0-9a-f]|22|27|3c|3e|5c)", re.IGNORECASE
)


def sanitize_text(value: str, max_length: int) -> str:
    s = (value or "")[:max_length]
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = s.replace('"', "&quot;").replace("'", "&#39;")
    return s


def sanitize_color(value: str, default: str) -> str:
    v = (value or "").strip()
    if _HEX_RE.match(v) or _NAMED_RE.match(v):
        return v
    return default


def sanitize_url(value: str) -> str | None:
    v = (value or "").strip()
    if not v:
        return None
    if "javascript:" in v.lower():
        return None
    if not _URL_RE.match(v):
        return None
    if _URL_BAD_PCT_RE.search(v):
        return None
    return v


def clamp_timing(value, p: "TimingParam") -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return p.default
    return max(p.min, min(p.max, f))


def _upper_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).upper()


# --------------------------------------------------------------------------
# Templates (each <svg> has xmlns; only whitelist attributeName; begin=id.click)
# --------------------------------------------------------------------------

# (1) tab-panel — expand
# 微信真机受限: 三面板互斥切换 = 真跨元素控制（点 A 须强制隐 B/C）。微信 add_draft
# 回读会剥光所有 id= 属性, begin="tabNbtn.click" 跨元素引用随之悬空 → 真机点击无反应。
# 已实证不可纯自触发实现, 判定为「微信真机受限」, 降级为覆盖揭示式手风琴: 每个板块
# 内容常驻、上面盖一块标题板, 点标题板 begin="click" 让盖板自身淡出露出下层内容
# （target=盖板组自己, 纯自触发, 剥 id 后仍可用）。各板块独立展开, 不互斥（可同时展开）。
_TAB_PANEL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 __VIEWBOX_H__" width="100%">
  <rect x="0" y="0" width="750" height="__VIEWBOX_H__" fill="#0F172A"/>
  <g id="panel1">
    <image href="SLOT_PANEL1_IMG" x="20" y="86" width="710" height="120"/>
    <text x="40" y="240" fill="#F8FAFC" font-size="30">SLOT_PANEL1_TITLE</text>
    <text x="40" y="280" fill="#94A3B8" font-size="22">SLOT_PANEL1_BODY</text>
  </g>
  <g id="cover1">
    <rect x="20" y="20" width="710" height="266" rx="10" fill="#1E293B"/>
    <text x="40" y="56" fill="#E2E8F0" font-size="24">SLOT_TAB1_LABEL</text>
    <text x="40" y="160" fill="#64748B" font-size="20">点击展开</text>
    <animate attributeName="opacity" from="1" to="0" dur="0.3s" begin="click" fill="freeze"/>
    <set attributeName="visibility" to="hidden" begin="click+0.3s"/>
  </g>
  <g id="panel2">
    <image href="SLOT_PANEL2_IMG" x="20" y="346" width="710" height="120"/>
    <text x="40" y="500" fill="#F8FAFC" font-size="30">SLOT_PANEL2_TITLE</text>
    <text x="40" y="540" fill="#94A3B8" font-size="22">SLOT_PANEL2_BODY</text>
  </g>
  <g id="cover2">
    <rect x="20" y="306" width="710" height="266" rx="10" fill="#1E293B"/>
    <text x="40" y="342" fill="#E2E8F0" font-size="24">SLOT_TAB2_LABEL</text>
    <text x="40" y="446" fill="#64748B" font-size="20">点击展开</text>
    <animate attributeName="opacity" from="1" to="0" dur="0.3s" begin="click" fill="freeze"/>
    <set attributeName="visibility" to="hidden" begin="click+0.3s"/>
  </g>
  <g id="panel3">
    <image href="SLOT_PANEL3_IMG" x="20" y="632" width="710" height="120"/>
    <text x="40" y="786" fill="#F8FAFC" font-size="30">SLOT_PANEL3_TITLE</text>
    <text x="40" y="826" fill="#94A3B8" font-size="22">SLOT_PANEL3_BODY</text>
  </g>
  <g id="cover3">
    <rect x="20" y="592" width="710" height="266" rx="10" fill="#1E293B"/>
    <text x="40" y="628" fill="#E2E8F0" font-size="24">SLOT_TAB3_LABEL</text>
    <text x="40" y="732" fill="#64748B" font-size="20">点击展开</text>
    <animate attributeName="opacity" from="1" to="0" dur="0.3s" begin="click" fill="freeze"/>
    <set attributeName="visibility" to="hidden" begin="click+0.3s"/>
  </g>
</svg>"""

# (2) scroll-carousel — carousel (scroll-snap horizontal)
_SCROLL_CAROUSEL = """<div style="overflow-x:scroll;white-space:nowrap;width:100%;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2250 __VIEWBOX_H__" width="300%">
    <g>
      <rect x="0" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_1"/>
      <image href="SLOT_IMG_1" x="40" y="40" width="670" height="300"/>
      <text x="375" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_CAPTION_1</text>
    </g>
    <g>
      <rect x="750" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_2"/>
      <image href="SLOT_IMG_2" x="790" y="40" width="670" height="300"/>
      <text x="1125" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_CAPTION_2</text>
    </g>
    <g>
      <rect x="1500" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_3"/>
      <image href="SLOT_IMG_3" x="1540" y="40" width="670" height="300"/>
      <text x="1875" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_CAPTION_3</text>
    </g>
  </svg>
</div>"""

# (3) smil-carousel — carousel (click to advance discrete frames)
# Stacked-peel pattern: frame3 sits at the bottom, frame2 above it, frame1 on
# top. Each top frame carries a bare self-trigger `<set begin="click">` that
# hides ITSELF (target = that frame's own <g>; the click lands on the frame's
# children and bubbles up to the frame group), revealing the frame beneath.
# This gives strict exclusive advance (click 1 -> frame2, click 2 -> frame3)
# using only bare `click` self-triggers — NOT `frameN.click` id references
# (WeChat strips id, so any id.click cross-ref would dangle). No wall-clock
# offsets, no click counting, no `end=` revert. frame1's intro fade on 0s.
_SMIL_CAROUSEL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 __VIEWBOX_H__" width="100%">
  <g id="frame3">
    <rect x="0" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_3"/>
    <image href="SLOT_IMG_3" x="40" y="40" width="670" height="300"/>
    <text x="375" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_TEXT_3</text>
  </g>
  <g id="frame2">
    <set attributeName="visibility" to="hidden" begin="click"/>
    <rect x="0" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_2"/>
    <image href="SLOT_IMG_2" x="40" y="40" width="670" height="300"/>
    <text x="375" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_TEXT_2</text>
  </g>
  <g id="frame1">
    <set attributeName="visibility" to="hidden" begin="click"/>
    <rect x="0" y="0" width="750" height="__VIEWBOX_H__" fill="SLOT_BG_COLOR_1"/>
    <image href="SLOT_IMG_1" x="40" y="40" width="670" height="300"/>
    <text x="375" y="380" fill="#FFFFFF" font-size="28" text-anchor="middle">SLOT_TEXT_1</text>
    <animate attributeName="opacity" from="0" to="1" dur="__DUR__s" begin="0s" fill="freeze"/>
  </g>
</svg>"""

# (4) flip-card — flip (覆盖揭示, 语义降级: 双向翻转 → 单向翻面揭示)
# 微信剥 id 后 begin="flipbtn.click" 跨元素悬空, 无法真双向翻转。改用覆盖揭示:
# cardback 常驻最底层, cardfront 盖在上层, 点正面 begin="click" 让正面 scale 横向
# 收没 + visibility hidden（target=cardfront 自身, 纯自触发）, 露出下层背面。单向、不可翻回。
_FLIP_CARD = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="100%">
  <g id="cardback">
    <rect x="50" y="40" width="500" height="340" rx="20" fill="SLOT_BACK_BG"/>
    <text x="300" y="120" fill="SLOT_BACK_TEXT_COLOR" font-size="30" text-anchor="middle">SLOT_BACK_TITLE</text>
    <text x="300" y="190" fill="SLOT_BACK_TEXT_COLOR" font-size="22" text-anchor="middle">SLOT_BACK_BODY_LINE1</text>
    <text x="300" y="240" fill="SLOT_BACK_TEXT_COLOR" font-size="22" text-anchor="middle">SLOT_BACK_BODY_LINE2</text>
    <text x="300" y="290" fill="SLOT_BACK_TEXT_COLOR" font-size="22" text-anchor="middle">SLOT_BACK_BODY_LINE3</text>
  </g>
  <g id="cardfront">
    <set attributeName="visibility" to="hidden" begin="click"/>
    <rect x="50" y="40" width="500" height="340" rx="20" fill="SLOT_FRONT_BG"/>
    <image href="SLOT_FRONT_IMG" x="90" y="80" width="420" height="200"/>
    <text x="300" y="330" fill="SLOT_FRONT_TEXT_COLOR" font-size="30" text-anchor="middle">SLOT_FRONT_TITLE</text>
    <animateTransform attributeName="transform" type="scale" from="1 1" to="0 1" dur="__DUR__s" begin="click" fill="freeze"/>
  </g>
</svg>"""

# (5) mask-reveal — quiz (mask reveal answer)
_MASK_REVEAL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 420" width="100%">
  <rect x="0" y="0" width="750" height="420" fill="#0B1020"/>
  <text x="375" y="80" fill="#F8FAFC" font-size="28" text-anchor="middle">SLOT_QUESTION_TEXT</text>
  <text x="375" y="200" fill="#FACC15" font-size="40" text-anchor="middle">SLOT_ANSWER_MAIN</text>
  <text x="375" y="270" fill="#CBD5E1" font-size="22" text-anchor="middle">SLOT_ANSWER_EXPLANATION</text>
  <g id="maskbtn">
    <rect x="60" y="150" width="630" height="200" rx="16" fill="SLOT_MASK_COLOR"/>
    <text x="375" y="265" fill="SLOT_MASK_TEXT_COLOR" font-size="26" text-anchor="middle">点击揭晓答案</text>
    <animate attributeName="opacity" from="1" to="0" dur="__DUR__s" begin="click" fill="freeze"/>
  </g>
</svg>"""

# (6) multi-choice — quiz (ABCD multiple choice)
# 微信真机受限: 「点任一选项 → 点亮共享独立解析面板」= 跨元素互斥控制, 微信剥 id 后
# begin="optN.click" 悬空 → 真机无反应。判定受限。降级: 点选项仅高亮该选项自身
# （<set> 直接挂 rect, target=rect, begin="click" 改自己 fill, 纯自触发, 真机可用）,
# 解析区改为常驻静态显示（不再依赖点击）。
# SMIL 命中修复: <text> 标签是 rect 的【兄弟】且 z-order 更高（DOM 后序）, 直接覆盖在
# rect 上方。若 text 默认可命中, 点击选项字母/文字时事件 target=text、冒泡 text→g→svg,
# 绕过 rect, <set>（target=rect）收不到 click → 文字区成死区。给每个 <text> 加
# pointer-events="none" 让点击穿透到下层 rect, 整个选项条任意位置点击都能触发高亮。
_MULTI_CHOICE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 520" width="100%">
  <rect x="0" y="0" width="750" height="520" fill="#0F172A"/>
  <text x="375" y="60" fill="#F8FAFC" font-size="28" text-anchor="middle">SLOT_QUESTION</text>
  <g id="optA">
    <rect x="60" y="100" width="630" height="60" rx="10" fill="#1E293B">
      <set attributeName="fill" to="#14532D" begin="click" fill="freeze"/>
    </rect>
    <text x="90" y="140" fill="#E2E8F0" font-size="24" pointer-events="none">A. SLOT_OPTION_A</text>
  </g>
  <g id="optB">
    <rect x="60" y="175" width="630" height="60" rx="10" fill="#1E293B">
      <set attributeName="fill" to="#14532D" begin="click" fill="freeze"/>
    </rect>
    <text x="90" y="215" fill="#E2E8F0" font-size="24" pointer-events="none">B. SLOT_OPTION_B</text>
  </g>
  <g id="optC">
    <rect x="60" y="250" width="630" height="60" rx="10" fill="#1E293B">
      <set attributeName="fill" to="#14532D" begin="click" fill="freeze"/>
    </rect>
    <text x="90" y="290" fill="#E2E8F0" font-size="24" pointer-events="none">C. SLOT_OPTION_C</text>
  </g>
  <g id="optD">
    <rect x="60" y="325" width="630" height="60" rx="10" fill="#1E293B">
      <set attributeName="fill" to="#14532D" begin="click" fill="freeze"/>
    </rect>
    <text x="90" y="365" fill="#E2E8F0" font-size="24" pointer-events="none">D. SLOT_OPTION_D</text>
  </g>
  <g id="explain">
    <rect x="60" y="410" width="630" height="90" rx="10" fill="#14532D"/>
    <text x="90" y="445" fill="#DCFCE7" font-size="22">SLOT_EXPLANATION_LINE1</text>
    <text x="90" y="480" fill="#DCFCE7" font-size="22">SLOT_EXPLANATION_LINE2</text>
  </g>
</svg>"""

# (7) longpress-ring — longpress (long-press progress ring reveal)
# SMIL 铁律: <animate begin="touchstart"> 的事件目标是其【父元素（owner）】, 事件只能
# 沿 DOM 由子向父冒泡, 不向兄弟/子节点传播。旧实现把 reveal 的 animate 放在 reveal 组内
# (target=reveal), 而用户按的是 reveal 的【兄弟】环形 circle —— touchstart 冒泡到 pressbtn
# 后到此为止, 永远抵达不了 sibling reveal, 且 opacity=0 的组在默认 visiblePainted 下不可命中,
# reveal 永不触发。本次修复改为「覆盖揭示 + 同元素自触发」:
#   - 底层常驻 reveal 内容（image+title+subtitle）一直在, 但被上层 g#pressbtn 盖住;
#   - g#pressbtn 是【揭示盖板】: 含静态进度环 + 可充环动画 + 中心图标, opacity 从 1 充满后,
#     用同元素自触发 begin="touchstart+__DUR__;click+__DUR__" 把【盖板自己】淡出（target=
#     pressbtn 自身, 按压落在 pressbtn 的子 circle 上, 事件冒泡到 pressbtn 触发其 animate）,
#     盖板淡出后下层 reveal 自然显露。纯自触发、无 id 跨元素引用, 剥 id 后仍可用。
# 诚实标注: 微信真机若不完整支持持续按压语义, 进度环可能瞬时充满而非渐进, 长按为近似动画;
#   且揭示为单向（盖板淡出后不可复原）。
_LONGPRESS_RING = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 520" width="100%">
  <rect x="0" y="0" width="750" height="520" fill="#0B1020"/>
  <g id="reveal">
    <image href="SLOT_REVEAL_IMG" x="175" y="160" width="400" height="120"/>
    <text x="375" y="330" fill="#F8FAFC" font-size="30" text-anchor="middle">SLOT_REVEAL_TITLE</text>
    <text x="375" y="375" fill="#94A3B8" font-size="22" text-anchor="middle">SLOT_REVEAL_SUBTITLE</text>
  </g>
  <g id="pressbtn">
    <animate attributeName="opacity" from="1" to="0" dur="0.4s" begin="touchstart+__DUR__;click+__DUR__" fill="freeze"/>
    <rect x="0" y="0" width="750" height="520" fill="#0B1020"/>
    <circle cx="375" cy="260" r="110" fill="none" stroke="#1E293B" stroke-width="16"/>
    <circle cx="375" cy="260" r="110" fill="#0B1020" stroke="SLOT_RING_COLOR" stroke-width="16" stroke-dasharray="691" stroke-dashoffset="691" transform="rotate(-90 375 260)">
      <animate attributeName="stroke-dashoffset" from="691" to="0" dur="__DUR__s" begin="touchstart;click" fill="freeze"/>
    </circle>
    <text x="375" y="275" fill="#F8FAFC" font-size="48" text-anchor="middle" pointer-events="none">SLOT_ICON</text>
  </g>
</svg>"""

# (8) pano-slide — slide (horizontal panorama slide)
_PANO_SLIDE = """<div style="overflow-x:scroll;white-space:nowrap;width:100%;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 480" width="200%">
    <rect x="0" y="0" width="1500" height="480" fill="SLOT_BG_COLOR"/>
    <image href="SLOT_PANORAMA_IMG" x="0" y="0" width="1500" height="360"/>
    <line x1="120" y1="420" x2="1380" y2="420" stroke="SLOT_LINE_COLOR" stroke-width="4"/>
    <circle cx="250" cy="420" r="12" fill="SLOT_NODE_COLOR"/>
    <text x="250" y="465" fill="SLOT_LABEL_COLOR" font-size="22" text-anchor="middle">SLOT_LABEL_1</text>
    <circle cx="750" cy="420" r="12" fill="SLOT_NODE_COLOR"/>
    <text x="750" y="465" fill="SLOT_LABEL_COLOR" font-size="22" text-anchor="middle">SLOT_LABEL_2</text>
    <circle cx="1250" cy="420" r="12" fill="SLOT_NODE_COLOR"/>
    <text x="1250" y="465" fill="SLOT_LABEL_COLOR" font-size="22" text-anchor="middle">SLOT_LABEL_3</text>
  </svg>
</div>"""


# --------------------------------------------------------------------------
# Effect catalog
# --------------------------------------------------------------------------
EFFECTS: dict[str, Effect] = {
    "tab-panel": Effect(
        id="tab-panel",
        category="expand",
        title="Tab 标签页切换",
        description="点击标签展开对应板块（微信真机受限: 无法互斥切换, 各板块独立展开）",
        text_slots=(
            TextSlot("SLOT_TAB1_LABEL", "标签 1 文字", "概览", 12),
            TextSlot("SLOT_TAB2_LABEL", "标签 2 文字", "详情", 12),
            TextSlot("SLOT_TAB3_LABEL", "标签 3 文字", "数据", 12),
            TextSlot("SLOT_PANEL1_TITLE", "面板 1 标题", "第一面板标题", 30),
            TextSlot("SLOT_PANEL2_TITLE", "面板 2 标题", "第二面板标题", 30),
            TextSlot("SLOT_PANEL3_TITLE", "面板 3 标题", "第三面板标题", 30),
            TextSlot("SLOT_PANEL1_BODY", "面板 1 正文", "第一面板的说明文字", 40),
            TextSlot("SLOT_PANEL2_BODY", "面板 2 正文", "第二面板的说明文字", 40),
            TextSlot("SLOT_PANEL3_BODY", "面板 3 正文", "第三面板的说明文字", 40),
        ),
        image_slots=(
            ImageSlot("SLOT_PANEL1_IMG", "面板 1 图片"),
            ImageSlot("SLOT_PANEL2_IMG", "面板 2 图片"),
            ImageSlot("SLOT_PANEL3_IMG", "面板 3 图片"),
        ),
        color_slots=(),
        timing_params=(
            TimingParam("viewboxH", "高度", "px", 880, 600, 900, 10),
        ),
        template=_TAB_PANEL,
    ),
    "scroll-carousel": Effect(
        id="scroll-carousel",
        category="carousel",
        title="横向滑动轮播",
        description="scroll-snap 横向滑动浏览多张图文卡片",
        text_slots=(
            TextSlot("SLOT_CAPTION_1", "第 1 张说明", "第一张说明文字", 40),
            TextSlot("SLOT_CAPTION_2", "第 2 张说明", "第二张说明文字", 40),
            TextSlot("SLOT_CAPTION_3", "第 3 张说明", "第三张说明文字", 40),
        ),
        image_slots=(
            ImageSlot("SLOT_IMG_1", "第 1 张图片"),
            ImageSlot("SLOT_IMG_2", "第 2 张图片"),
            ImageSlot("SLOT_IMG_3", "第 3 张图片"),
        ),
        color_slots=(
            ColorSlot("SLOT_BG_COLOR_1", "第 1 张底色", "#1A1A2E"),
            ColorSlot("SLOT_BG_COLOR_2", "第 2 张底色", "#16213E"),
            ColorSlot("SLOT_BG_COLOR_3", "第 3 张底色", "#0F3460"),
        ),
        timing_params=(
            TimingParam("viewboxH", "高度", "px", 400, 300, 600, 10),
        ),
        template=_SCROLL_CAROUSEL,
    ),
    "smil-carousel": Effect(
        id="smil-carousel",
        category="carousel",
        title="点击翻页轮播",
        description="单 SVG 内叠放多帧，点下一张离散切换",
        text_slots=(
            TextSlot("SLOT_TEXT_1", "第 1 帧说明", "第一张说明文字", 40),
            TextSlot("SLOT_TEXT_2", "第 2 帧说明", "第二张说明文字", 40),
            TextSlot("SLOT_TEXT_3", "第 3 帧说明", "第三张说明文字", 40),
        ),
        image_slots=(
            ImageSlot("SLOT_IMG_1", "第 1 帧图片"),
            ImageSlot("SLOT_IMG_2", "第 2 帧图片"),
            ImageSlot("SLOT_IMG_3", "第 3 帧图片"),
        ),
        color_slots=(
            ColorSlot("SLOT_BG_COLOR_1", "第 1 帧底色", "#1A1A2E"),
            ColorSlot("SLOT_BG_COLOR_2", "第 2 帧底色", "#16213E"),
            ColorSlot("SLOT_BG_COLOR_3", "第 3 帧底色", "#0F3460"),
        ),
        timing_params=(
            TimingParam("dur", "动画时长", "s", 0.45, 0.1, 3, 0.05),
            TimingParam("viewboxH", "高度", "px", 420, 300, 700, 10),
        ),
        template=_SMIL_CAROUSEL,
    ),
    "flip-card": Effect(
        id="flip-card",
        category="flip",
        title="2D 翻卡",
        description="点击卡片正面收起揭示背面（微信真机受限: 单向翻面, 不可翻回）",
        text_slots=(
            TextSlot("SLOT_FRONT_TITLE", "正面标题", "正面标题", 20),
            TextSlot("SLOT_BACK_TITLE", "背面标题", "背面标题", 20),
            TextSlot("SLOT_BACK_BODY_LINE1", "背面第 1 行", "背面第一行说明", 30),
            TextSlot("SLOT_BACK_BODY_LINE2", "背面第 2 行", "背面第二行说明", 30),
            TextSlot("SLOT_BACK_BODY_LINE3", "背面第 3 行", "背面第三行说明", 30),
        ),
        image_slots=(
            ImageSlot("SLOT_FRONT_IMG", "正面图片"),
        ),
        color_slots=(
            ColorSlot("SLOT_FRONT_BG", "正面底色", "#312E81"),
            ColorSlot("SLOT_BACK_BG", "背面底色", "#1E1B4B"),
            ColorSlot("SLOT_FRONT_TEXT_COLOR", "正面文字色", "#FFFFFF"),
            ColorSlot("SLOT_BACK_TEXT_COLOR", "背面文字色", "#E0E7FF"),
        ),
        timing_params=(
            TimingParam("dur", "翻转时长", "s", 0.2, 0.1, 0.5, 0.05),
        ),
        template=_FLIP_CARD,
    ),
    "mask-reveal": Effect(
        id="mask-reveal",
        category="quiz",
        title="遮罩揭答",
        description="点击遮罩淡出，揭晓隐藏的答案",
        text_slots=(
            TextSlot("SLOT_QUESTION_TEXT", "问题", "这是一道题目", 40),
            TextSlot("SLOT_ANSWER_MAIN", "答案", "答案", 20),
            TextSlot("SLOT_ANSWER_EXPLANATION", "答案解释", "答案的解释说明", 40),
        ),
        image_slots=(),
        color_slots=(
            ColorSlot("SLOT_MASK_COLOR", "遮罩底色", "#1B2235"),
            ColorSlot("SLOT_MASK_TEXT_COLOR", "遮罩文字色", "#F5F7FA"),
        ),
        timing_params=(
            TimingParam("dur", "揭晓时长", "s", 0.5, 0.2, 1.0, 0.05),
        ),
        template=_MASK_REVEAL,
    ),
    "multi-choice": Effect(
        id="multi-choice",
        category="quiz",
        title="ABCD 多选答题",
        description="点击选项高亮（微信真机受限: 无法按选项切换解析, 解析常驻显示）",
        text_slots=(
            TextSlot("SLOT_QUESTION", "题干", "这是一道选择题", 40),
            TextSlot("SLOT_OPTION_A", "选项 A", "选项 A", 30),
            TextSlot("SLOT_OPTION_B", "选项 B", "选项 B", 30),
            TextSlot("SLOT_OPTION_C", "选项 C", "选项 C", 30),
            TextSlot("SLOT_OPTION_D", "选项 D", "选项 D", 30),
            TextSlot("SLOT_EXPLANATION_LINE1", "解析第 1 行", "解析第一行", 40),
            TextSlot("SLOT_EXPLANATION_LINE2", "解析第 2 行", "解析第二行", 40),
        ),
        image_slots=(),
        color_slots=(),
        timing_params=(
            TimingParam("dur", "揭示时长", "s", 0.4, 0.2, 1.0, 0.05),
        ),
        template=_MULTI_CHOICE,
    ),
    "longpress-ring": Effect(
        id="longpress-ring",
        category="longpress",
        title="长按进度环揭晓",
        description="长按充满进度环后揭晓隐藏内容",
        text_slots=(
            TextSlot("SLOT_ICON", "中心图标", "👆", 4),
            TextSlot("SLOT_REVEAL_TITLE", "揭晓标题", "揭晓标题", 20),
            TextSlot("SLOT_REVEAL_SUBTITLE", "揭晓副标题", "揭晓副标题说明", 40),
        ),
        image_slots=(
            ImageSlot("SLOT_REVEAL_IMG", "揭晓图片"),
        ),
        color_slots=(
            ColorSlot("SLOT_RING_COLOR", "进度环颜色", "#6366F1"),
        ),
        timing_params=(
            TimingParam("dur", "长按时长", "s", 1.5, 1.0, 3.0, 0.1),
        ),
        template=_LONGPRESS_RING,
    ),
    "pano-slide": Effect(
        id="pano-slide",
        category="slide",
        title="水平全景滑动看图",
        description="横向滑动浏览全景长图并定位标注点",
        text_slots=(
            TextSlot("SLOT_LABEL_1", "标注 1", "第一处", 12),
            TextSlot("SLOT_LABEL_2", "标注 2", "第二处", 12),
            TextSlot("SLOT_LABEL_3", "标注 3", "第三处", 12),
        ),
        image_slots=(
            ImageSlot("SLOT_PANORAMA_IMG", "全景图片"),
        ),
        color_slots=(
            ColorSlot("SLOT_BG_COLOR", "底色", "#0F172A"),
            ColorSlot("SLOT_LABEL_COLOR", "标注文字色", "#94A3B8"),
            ColorSlot("SLOT_LINE_COLOR", "轴线颜色", "#1E293B"),
            ColorSlot("SLOT_NODE_COLOR", "节点颜色", "#6366F1"),
        ),
        timing_params=(),
        template=_PANO_SLIDE,
    ),
}


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------
def list_effects() -> list[dict]:
    """Return the contract §1 effects array (metadata + slot schema)."""
    out: list[dict] = []
    for eff in EFFECTS.values():
        out.append({
            "id": eff.id,
            "category": eff.category,
            "title": eff.title,
            "description": eff.description,
            "textSlots": [
                {"name": s.name, "label": s.label, "default": s.default, "maxLength": s.max_length}
                for s in eff.text_slots
            ],
            "imageSlots": [
                {"name": s.name, "label": s.label, "default": s.default}
                for s in eff.image_slots
            ],
            "colorSlots": [
                {"name": s.name, "label": s.label, "default": s.default}
                for s in eff.color_slots
            ],
            "timingParams": [
                {
                    "name": p.name,
                    "label": p.label,
                    "unit": p.unit,
                    "default": p.default,
                    "min": p.min,
                    "max": p.max,
                    "step": p.step,
                }
                for p in eff.timing_params
            ],
        })
    return out


def _strip_image(html: str, slot_name: str) -> str:
    """Remove the single self-closing <image ... slot_name ...> tag wholesale
    so an empty/illegal URL falls back to the background-color placeholder."""
    pattern = r"<image\b[^>]*" + re.escape(slot_name) + r"[^>]*/?>"
    return re.sub(pattern, "", html)


def render_effect(
    effect_id: str,
    *,
    text_slots: dict | None = None,
    image_slots: dict | None = None,
    color_slots: dict | None = None,
    timing_params: dict | None = None,
) -> dict:
    """Fill slots -> sanitize -> substitute tokens -> validate_html -> payload."""
    eff = EFFECTS.get(effect_id)
    if eff is None:
        return {
            "status": "error",
            "html": "",
            "message": f"未知效果 id: {effect_id}",
            "warnings": [],
            "report": None,
        }

    text_slots = text_slots or {}
    image_slots = image_slots or {}
    color_slots = color_slots or {}
    timing_params = timing_params or {}

    html = eff.template

    # Two-phase substitution to prevent cross-category double substitution
    # (a sanitized text/color value that happens to equal another slot's
    # literal token must NOT be re-interpreted by a later pass). Phase 1
    # replaces every template token with a unique sentinel that cannot occur
    # in any user-supplied value; phase 2 swaps sentinels for final values.
    # Sentinels use \x00 framing — sanitize_* never emit NUL, and the URL /
    # color regexes reject it, so no user value can forge a sentinel.
    final: dict[str, str] = {}

    def _sentinel(i: int) -> str:
        return f"\x00SLOT{i}\x00"

    idx = 0

    # Image slots first — None URL strips the whole <image> tag (must happen
    # before the href token is sentinel-replaced so the strip regex still
    # sees the literal slot name in the tag).
    for ims in sorted(eff.image_slots, key=lambda s: -len(s.name)):
        url = sanitize_url(image_slots.get(ims.name, ims.default))
        if url is None:
            html = _strip_image(html, ims.name)
        else:
            sent = _sentinel(idx)
            idx += 1
            html = html.replace(ims.name, sent)
            final[sent] = url

    # Text slots — long names first to avoid prefix collisions.
    for ts in sorted(eff.text_slots, key=lambda s: -len(s.name)):
        raw = text_slots.get(ts.name, ts.default)
        sent = _sentinel(idx)
        idx += 1
        html = html.replace(ts.name, sent)
        final[sent] = sanitize_text(raw, ts.max_length)

    # Color slots — long names first.
    for cs in sorted(eff.color_slots, key=lambda s: -len(s.name)):
        val = sanitize_color(color_slots.get(cs.name, cs.default), cs.default)
        sent = _sentinel(idx)
        idx += 1
        html = html.replace(cs.name, sent)
        final[sent] = val

    # Timing params.
    for tp in eff.timing_params:
        token = "__" + _upper_snake(tp.name) + "__"
        val = clamp_timing(timing_params.get(tp.name, tp.default), tp)
        out = str(int(val)) if val == int(val) else str(val)
        sent = _sentinel(idx)
        idx += 1
        html = html.replace(token, sent)
        final[sent] = out

    # Phase 2: swap sentinels for their final values. Values are already
    # sanitized and cannot themselves contain a sentinel, so order-free.
    for sent, val in final.items():
        html = html.replace(sent, val)

    report = validate_html(html)
    warnings = [{"kind": "validator", **w} for w in report["warnings"]]
    if report["issues"]:
        return {"status": "failed", "html": "", "warnings": warnings, "report": report}
    return {"status": "ok", "html": html, "warnings": warnings, "report": report}
