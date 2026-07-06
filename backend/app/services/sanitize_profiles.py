"""sanitize 三档 profile + SanitizeReport(批3,2026-07-04,spec §5 T1)。

在既有 ``wechat_sanitize.sanitize_with_profile``(确定性管线)之上封装三档口径,
并把「剥掉即完」升级为「剥掉且记账」——每次清洗产出 SanitizeReport:

- ``repairs``:T1 做了等价降级/改写、视觉意图大体保留(div→section、
  opacity:0→1、0.5px→1px、class/id 剥离等),LLM 无需返工;
- ``violations``:内容被剥且无等价保留(script、<style> 块、白名单外样式
  属性等),``fix_hint`` 是可执行中文指令,供 T2 块级回炉时 agent 自纠。

三档 profile(spec §5):

- ``paste-safe``:现行最严口径,**既有调用方默认、输出与
  ``sanitize_for_wechat`` 逐字节相同**(直接复用 WECHAT_PROFILE,零分叉);
- ``api-storage-safe``:draft API 存储层实测宽档,放宽项**逐条**以真值表
  ``docs/research/wechat-svg-truth-table.md``(2026-06-13 add_draft 回读)
  为据,行号见下方注释;渲染层未核验的存疑项一律不放,宁紧勿松;
- ``render-verified``:本刀 == api-storage-safe 的**别名占位**。真值表只验证
  了服务端存储层,渲染层(iOS/Android 真机)待 P1 人工核验后此档才分化出
  独立(更宽或更准)的口径;在那之前保持与 api-storage-safe 完全一致。

报告采用「检测器」实现:在输入上(先摘除受保护的 SVG 子树)静态检测管线
将要修补/剥除的模式,与管线本体解耦——管线仍是唯一真源,报告只做记账,
绝不影响清洗输出的字节。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, replace

from app.services.render_profiles import WECHAT_PROFILE, RenderProfile
from app.services.wechat_sanitize import (
    _extract_svg_subtrees,
    sanitize_with_profile,
)


# ---------------------------------------------------------------------------
# 三档 profile 定义
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SanitizeProfile:
    """一档清洗口径 = 名字 + 底层 RenderProfile(管线策略参数包)。"""

    name: str
    render_profile: RenderProfile


# api-storage-safe 放宽项(逐条以真值表实测为据;其余全部继承 paste-safe):
#
#   1. 保留 style 内 ``opacity:0`` 起手态(不再改写为 opacity:1)。
#      依据:真值表 61-62 行(探针 opacity-zero-start-style,ALLOWED)——
#      API 存储层保留淡入动画初始态;粘贴口径的 0→1 改写本是防作者失误,
#      对 agent 产文属误伤。
#   2. 样式白名单放行 ``pointer-events``。
#      依据:真值表 39-40 行(探针 pointer-events-none-style,ALLOWED)——
#      style 内 pointer-events:none 存储层保留(穿透热区能力)。
#
# 明确【不放】的存疑项(真值表存储层 ALLOWED 但渲染层未核验/社区一致失效):
#   - position:absolute/fixed(真值表 74 行存储层存活,但调研 §1.2 社区多方
#     一致称渲染层失效)→ 仍走 display:none 隐藏;
#   - transform / 百分比位移(真值表 45/75 行存储层存活,渲染层存疑)→ 仍剥;
#   - data-* / class(真值表零覆盖)→ 仍剥;
#   - div→section、语义标签改写、按钮转 table 等结构改写:API 入口未实测
#     可豁免,保持与 paste-safe 相同(结构改写不损视觉,保守无害)。
_API_STORAGE_RENDER_PROFILE = replace(
    WECHAT_PROFILE,
    name="wechat-api-storage",
    # 放宽项 2:pointer-events(真值表 39-40 行)。
    allowed_style_properties=(
        WECHAT_PROFILE.allowed_style_properties | frozenset({"pointer-events"})
    ),
    # 放宽项 1:opacity:0 起手态(真值表 61-62 行)。
    keep_opacity_zero=True,
)

PASTE_SAFE = SanitizeProfile(name="paste-safe", render_profile=WECHAT_PROFILE)
API_STORAGE_SAFE = SanitizeProfile(
    name="api-storage-safe", render_profile=_API_STORAGE_RENDER_PROFILE
)
# render-verified:本刀为 api-storage-safe 的别名占位(共享同一 RenderProfile
# 实例)。真值表仅验证存储层;待 P1 真机(iOS/Android)渲染核验后再分化。
RENDER_VERIFIED = SanitizeProfile(
    name="render-verified", render_profile=_API_STORAGE_RENDER_PROFILE
)

SANITIZE_PROFILES: dict[str, SanitizeProfile] = {
    "paste-safe": PASTE_SAFE,
    "api-storage-safe": API_STORAGE_SAFE,
    "render-verified": RENDER_VERIFIED,
}


def get_sanitize_profile(name: str = "paste-safe") -> SanitizeProfile:
    """按名取档;未知/空名回落最严的 paste-safe(绝不因坏参数变宽)。"""
    if not name:
        return PASTE_SAFE
    return SANITIZE_PROFILES.get(name.lower(), PASTE_SAFE)


# ---------------------------------------------------------------------------
# SanitizeReport 检测器
# ---------------------------------------------------------------------------

_STYLE_ATTR_RE = re.compile(r"style\s*=\s*([\"'])(.*?)\1", re.IGNORECASE | re.DOTALL)
_SCRIPT_RE = re.compile(r"<script\b", re.IGNORECASE)
_STYLE_BLOCK_RE = re.compile(r"<style(?=[\s>/])", re.IGNORECASE)
_EMBED_RE = re.compile(
    r"<(iframe|embed|object|video|audio|canvas)\b", re.IGNORECASE
)
_ON_HANDLER_RE = re.compile(r"\s+on\w+\s*=", re.IGNORECASE)
_DIV_RE = re.compile(r"<div\b", re.IGNORECASE)
_SEMANTIC_RE = re.compile(
    r"<(article|main|header|footer|aside|nav|hgroup|figure|figcaption|form|button)\b",
    re.IGNORECASE,
)
_CLASS_RE = re.compile(r"\s+class\s*=", re.IGNORECASE)
_ID_RE = re.compile(r"(?<![\w-])id\s*=", re.IGNORECASE)
_DATA_ATTR_RE = re.compile(r"\s+data-[\w-]+\s*=", re.IGNORECASE)
_OPACITY_ZERO_RE = re.compile(r"opacity\s*:\s*0(?:\.0+)?\s*(?=;|$|[\"'])")
_SUBPIXEL_RE = re.compile(r"(?<!\d)0\.5px")
_POSITION_ABS_RE = re.compile(r"position\s*:\s*(absolute|fixed)\b", re.IGNORECASE)
_IMPORTANT_RE = re.compile(r"!important", re.IGNORECASE)
_PRE_RE = re.compile(r"<pre\b", re.IGNORECASE)
_BG_SOLID_RE = re.compile(
    r"background\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))"
)
_DANGEROUS_CSS_URL_RE = re.compile(
    r"""url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)\s*:""", re.IGNORECASE
)
# 批4 minor 清账:report-only 外链图检测(管线不动图片,渲染层防盗链才是坑)。
_IMG_SRC_RE = re.compile(
    r"""<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL
)
# 微信图床域:mmbiz.qpic.cn 及 qpic/qlogo 家族子域。
_WECHAT_IMG_HOST_RE = re.compile(
    r"^https?://(?:[\w-]+\.)*(?:qpic\.cn|qlogo\.cn)(?:[/:?#]|$)", re.IGNORECASE
)

# 白名单外样式属性的可执行中文修复指令(fix_hint)。没命中映射的属性走兜底。
_PROPERTY_FIX_HINTS: dict[str, str] = {
    "transform": "transform 会被微信剥除:静态位移改用 margin/padding 实现;动画改用 SVG <animateTransform>(attributeName=\"transform\")",
    "transform-origin": "transform-origin 会被剥除:改在 SVG 内用 animateTransform 的坐标参数表达旋转中心",
    "transition": "transition 会被剥除:过渡动画改用 SVG SMIL(<animate> + dur/begin)",
    "animation": "CSS animation 会被剥除(@keyframes 随 <style> 块整体被删):动画唯一通道是 SVG SMIL,改用 <animate>/<animateTransform>",
    "float": "float 会被剥除:横排布局改用 display:inline-block + vertical-align:top",
    "clear": "clear 会被剥除:配合放弃 float,改用块级 section 自然换行",
    "gap": "gap 会被剥除:间距改用子元素的 margin 实现",
    "justify-content": "flex 对齐属性会被剥除:居中改用 text-align:center(行内)或 margin:0 auto(块级)",
    "align-items": "flex 对齐属性会被剥除:垂直对齐改用 display:inline-block + vertical-align",
    "z-index": "z-index 会被剥除:微信不支持层叠定位,叠放效果改在 SVG 内实现",
    "top": "定位偏移会被剥除:改用 margin-top(可为负值)实现上移",
    "left": "定位偏移会被剥除:改用 margin-left(可为负值)实现左移",
    "right": "定位偏移会被剥除:改用 margin-right 实现",
    "bottom": "定位偏移会被剥除:改用 margin-bottom 实现",
    "filter": "CSS filter 会被剥除:模糊/阴影改用 SVG <filter> 元素(fe* 原语)或预处理图片",
    "backdrop-filter": "backdrop-filter 会被剥除:改用半透明 background-color 近似毛玻璃",
    "cursor": "cursor 会被剥除:移动端无指针,直接删除该属性",
    "user-select": "user-select 会被剥除:直接删除该属性",
    "pointer-events": "pointer-events 在 paste-safe 档会被剥除:如需穿透热区,改走 api-storage-safe 档(真值表 39 行实测存储层保留)",
    "will-change": "will-change 会被剥除:直接删除该属性(纯性能提示)",
    "position": "position 只允许 relative/static:absolute/fixed 叠放改在 SVG 内实现",
}
_PROPERTY_FIX_FALLBACK = "该属性不在微信白名单,会被剥除:删除它,或改用白名单属性(margin/padding/border/color/font-* 等)表达同等视觉"

_FLEX_GRID_PREFIXES = ("flex", "grid", "justify-", "align-", "order", "row-gap", "column-gap")


def _repair(rules: list[dict], rule: str, detail: str) -> None:
    rules.append({"rule": rule, "detail": detail})


def _violation(rules: list[dict], rule: str, detail: str, fix_hint: str) -> None:
    rules.append({"rule": rule, "detail": detail, "fix_hint": fix_hint})


def _hint_for_property(prop: str) -> str:
    if prop in _PROPERTY_FIX_HINTS:
        return _PROPERTY_FIX_HINTS[prop]
    for prefix in _FLEX_GRID_PREFIXES:
        if prop.startswith(prefix):
            return "flex/grid 布局属性会被微信剥除:横排改用 display:inline-block + vertical-align,栅格改用 <table>(table-layout:fixed)"
    if prop.startswith("animation"):
        return _PROPERTY_FIX_HINTS["animation"]
    return _PROPERTY_FIX_FALLBACK


def _iter_style_bodies(masked_html: str):
    """遍历(SVG 已摘除的)HTML 中每个 style 属性体。"""
    for m in _STYLE_ATTR_RE.finditer(masked_html):
        yield m.group(2)


def _detect_report(html: str, profile: SanitizeProfile) -> dict:
    """在输入上静态检测管线将要修补/剥除的模式,产出 SanitizeReport dict。

    契约:只记账、不影响清洗输出。SVG 子树受管线整体保护(原样通过),
    先摘除再检测,避免对 SVG 内样式(fill/transform/opacity:0)误记账。
    """
    repairs: list[dict] = []
    violations: list[dict] = []
    if not html:
        return {"repairs": repairs, "violations": violations}

    rp = profile.render_profile
    masked, _svg = _extract_svg_subtrees(html, "report")

    # --- 结构级:安全地板剥除(violations) ---
    if _SCRIPT_RE.search(masked):
        _violation(
            violations, "script-removed",
            "检测到 <script>,微信禁 JavaScript,已整段删除",
            "删除脚本;交互效果改用 SVG SMIL 原生交互(如 begin=\"click\")实现",
        )
    if _STYLE_BLOCK_RE.search(masked):
        _violation(
            violations, "style-block-removed",
            "检测到 <style> 块,微信会整块删除(@keyframes/伪类/媒体查询全失效),已删除",
            "把 <style> 里的规则逐条改写成对应元素的内联 style 属性;动画改用 SVG SMIL",
        )
    m = _EMBED_RE.search(masked)
    if m:
        _violation(
            violations, "embed-removed",
            f"检测到 <{m.group(1).lower()}>,微信拒绝嵌入媒体/画布,已整段删除",
            "改用图片(mmbiz 图床)承载内容;视频用公众号后台插入官方视频卡片",
        )
    # report-only:外链图(清洗输出零改——图片本身合法,渲染层防盗链不显示)。
    for im in _IMG_SRC_RE.finditer(masked):
        src = im.group(2).strip()
        if src.lower().startswith(("http://", "https://")) and not _WECHAT_IMG_HOST_RE.match(src):
            _violation(
                violations, "external-image",
                "检测到外链图片(非微信 mmbiz 图床域):微信渲染层防盗链,发布后该图不显示",
                "先经图床上传换 mmbiz 链接(设置→发布→图床,或草稿箱发布时自动搬运)再引用",
            )
            break  # 记一次即可,避免多图刷屏
    if _ON_HANDLER_RE.search(masked):
        _violation(
            violations, "event-handler-removed",
            "检测到 on* 内联事件处理器,微信禁 JavaScript,已剥除",
            "删除 on* 属性;点击交互改用 SVG SMIL 的 begin=\"click\" 自触发",
        )

    # --- 结构级:等价改写(repairs) ---
    if rp.rename_div_to_section and _DIV_RE.search(masked):
        _repair(repairs, "div-to-section", "<div> 已改写为微信原生块容器 <section>(样式保留)")
    if rp.rename_semantic_tags:
        sm = _SEMANTIC_RE.search(masked)
        if sm:
            _repair(
                repairs, "semantic-to-section",
                f"HTML5 语义标签 <{sm.group(1).lower()}> 等已改写为 <section>(微信会解包语义标签并丢其样式)",
            )
    if rp.strip_class_id and _CLASS_RE.search(masked):
        _repair(repairs, "class-stripped", "class 属性已剥除(微信不保留,配套 CSS 已内联无损)")
    if rp.strip_class_id and _ID_RE.search(masked):
        _repair(repairs, "id-stripped", "HTML id 属性已剥除(微信服务端本就全量剥 id,真值表 7-8 行)")
    if rp.strip_data_attrs and _DATA_ATTR_RE.search(masked):
        _repair(repairs, "data-attr-stripped", "data-* 属性已剥除(微信存活性未实测,宁紧勿松)")
    if rp.convert_pre_blocks and _PRE_RE.search(masked):
        _repair(repairs, "pre-converted", "<pre> 代码块已转换为微信安全的 section/code 展示结构")

    # --- 样式声明级 ---
    keep_opacity_zero = getattr(rp, "keep_opacity_zero", False)
    seen_props: set[str] = set()
    for body in _iter_style_bodies(masked):
        if (
            rp.neutralize_layout_tricks
            and not keep_opacity_zero
            and _OPACITY_ZERO_RE.search(body + '"')
        ):
            if "opacity-zero-rewrite" not in seen_props:
                seen_props.add("opacity-zero-rewrite")
                _repair(
                    repairs, "opacity-zero-rewrite",
                    "opacity:0 已改写为 opacity:1(粘贴口径防内容隐身;若是淡入起手态请改走 api-storage-safe 档)",
                )
        if rp.neutralize_layout_tricks and _POSITION_ABS_RE.search(body):
            if "position-hidden" not in seen_props:
                seen_props.add("position-hidden")
                _violation(
                    violations, "position-hidden",
                    "position:absolute/fixed 的元素已被隐藏(display:none)以免脱离文档流叠压正文",
                    "微信渲染层不支持绝对定位:叠放效果改在 SVG 内实现,普通偏移改用 margin 负值",
                )
        if _SUBPIXEL_RE.search(body) and "subpixel" not in seen_props:
            seen_props.add("subpixel")
            _repair(repairs, "subpixel-border", "0.5px 已改写为 1px(亚像素边框粘贴后不可见)")
        if _BG_SOLID_RE.search(body) and "bg-solid" not in seen_props:
            seen_props.add("bg-solid")
            _repair(
                repairs, "background-solid-to-color",
                "background:<纯色> 已改写为 background-color(微信拒非标准 background 简写)",
            )
        if _IMPORTANT_RE.search(body) and "important" not in seen_props:
            seen_props.add("important")
            _repair(repairs, "important-dropped", "!important 已剥除(微信不支持,值本身保留)")
        # 白名单外属性 / 非法取值
        for decl in body.split(";"):
            decl = decl.strip()
            if not decl or ":" not in decl:
                continue
            prop, value = decl.split(":", 1)
            prop = prop.strip().lower()
            value = value.strip()
            if prop == "position":
                continue  # 已按 position-hidden 记账
            if _DANGEROUS_CSS_URL_RE.search(value):
                key = f"dangerous-url:{prop}"
                if key not in seen_props:
                    seen_props.add(key)
                    _violation(
                        violations, "dangerous-css-url",
                        f"样式 {prop} 的取值携带脚本型 URL(javascript:/data:),整条声明已剥除",
                        "改用 https 静态资源链接(图片须走 mmbiz 图床)",
                    )
                continue
            if prop not in rp.allowed_style_properties:
                if prop in seen_props:
                    continue
                seen_props.add(prop)
                _violation(
                    violations, "style-property-dropped",
                    f"样式属性 {prop}:{value} 不在 {profile.name} 档白名单,已剥除",
                    _hint_for_property(prop),
                )
                continue
            if prop == "display" and value.lower() not in rp.allowed_display_values:
                key = f"display:{value.lower()}"
                if key not in seen_props:
                    seen_props.add(key)
                    _violation(
                        violations, "display-value-dropped",
                        f"display:{value} 不被微信支持,整条声明已剥除",
                        "display 只支持 block/inline/inline-block/none/table 系:横排布局改用 inline-block + vertical-align",
                    )

    return {"repairs": repairs, "violations": violations}


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def sanitize_html(html: str, profile: str = "paste-safe") -> tuple[str, dict]:
    """按档清洗 HTML,返回 ``(clean_html, SanitizeReport)``。

    - ``profile="paste-safe"``(默认):输出与 ``sanitize_for_wechat`` 逐字节
      相同(共用 WECHAT_PROFILE 实例走同一条管线,零分叉);
    - report 结构:``{"repairs": [{rule, detail}], "violations":
      [{rule, detail, fix_hint}]}``,fix_hint 为可执行中文指令。
    """
    p = get_sanitize_profile(profile)
    report = _detect_report(html, p)
    clean = sanitize_with_profile(html, p.render_profile)
    return clean, report


# 显式导出,供 agent_tools/list_capabilities 编译能力清单时引用。
__all__ = [
    "SanitizeProfile",
    "PASTE_SAFE",
    "API_STORAGE_SAFE",
    "RENDER_VERIFIED",
    "SANITIZE_PROFILES",
    "get_sanitize_profile",
    "sanitize_html",
]
