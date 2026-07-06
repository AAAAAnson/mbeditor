# backend/app/services/layout_composer.py
"""把行文 Markdown 套进安全排版外壳,产出 <section> 包裹的「好看」HTML。

确定性 + 零 IO + 必过 svg_validator:外壳取色据 docs/cli/examples/templates/
tpl_*.json 五套提炼写死(_SHELL);装饰按 `_STYLE` 的 kind(literary/minimal/
vibrant/magazine)分套结构性生成——各套有不同的页眉/分割/章节头/引用框/页脚
(非只换色),运行期不读模板文件。compose() 走装饰版(含 SVG,过校验器零 issue/
零警告);compose_plain() 纯净降级(无 SVG、无 <style>),自检不过兜底。
article_author 的「制版」工序按 tone→template 调本模块;对外契约仅
compose/compose_plain/TEMPLATE_IDS。

SVG 装饰刻意只用静态 presentation 属性(无 <animate>/无 id/带 xmlns/静态
stroke-dasharray),全部内联 style 避开微信禁用属性(clip-path/mask/position
等),故 validate_html(...)["issues"] 恒为空——这是「好看」与「必过安全闸」的
共存前提,改动装饰时务必守住。
"""
from __future__ import annotations

import re
from functools import lru_cache

# 五套内置模板(文件名即 id)。tone->模板映射由 article_author 负责,本模块只认 id。
TEMPLATE_IDS: tuple[str, ...] = (
    "tpl_literary", "tpl_biz_minimal", "tpl_vibrant", "tpl_magazine", "tpl_tech_neon",
)

# 各模板纸张外壳取色(据对应 tpl_*.json 背景/正文/点缀色提炼,写死避免运行期解析)。
# 字段:paper=纸底, ink=正文色, accent=点缀(序号/分割/引用边框), muted=辅助灰,
#       label=页眉小字标签。
_SHELL: dict[str, dict[str, str]] = {
    "tpl_literary":    {"paper": "#faf6eb", "ink": "#5c4a3a", "accent": "#c4a76c", "muted": "#a09078", "label": "手 札"},
    "tpl_biz_minimal": {"paper": "#ffffff", "ink": "#2b2b2b", "accent": "#1f6feb", "muted": "#8a94a6", "label": "干 货"},
    "tpl_vibrant":     {"paper": "#fff8f0", "ink": "#33240f", "accent": "#ff5a3c", "muted": "#c69a7a", "label": "随 笔"},
    "tpl_magazine":    {"paper": "#f5f2ec", "ink": "#1f1b16", "accent": "#8a6d5b", "muted": "#9c8e7e", "label": "专 栏"},
    "tpl_tech_neon":   {"paper": "#0f1117", "ink": "#d3dae8", "accent": "#39d0d8", "muted": "#6b7689", "label": "T E C H"},
}

# 纯净降级外壳:白纸黑字、灰点缀。
_PLAIN_SHELL: dict[str, str] = {
    "paper": "#ffffff", "ink": "#222222", "accent": "#999999", "muted": "#888888", "label": "",
}

# 每套模板的「结构调性」描述符。kind 决定 hero/h2/quote/p/divider/footer 用哪组
# 渲染器,使各 tone 视觉/结构性不同(不只是换色)。tone->模板映射在 article_author:
#   温柔治愈 -> literary, 干货利落 -> minimal, 俏皮带梗 -> vibrant, 克制高级 -> magazine。
# tpl_tech_neon 未被 tone 映射,复用 magazine 结构(克制版式 + 霓虹配色,仍守零 issue)。
_STYLE: dict[str, str] = {
    "tpl_literary":    "literary",
    "tpl_biz_minimal": "minimal",
    "tpl_vibrant":     "vibrant",
    "tpl_magazine":    "magazine",
    "tpl_tech_neon":   "magazine",
}


@lru_cache(maxsize=8)
def _kind_for(template_id: str) -> str:
    """取模板结构调性;未知 id -> literary 兜底。"""
    return _STYLE.get(template_id, "literary")

# 章节中文序号(壹贰叁…);超出退化为阿拉伯数字。
_CJK_NUMERALS: tuple[str, ...] = ("壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾")


@lru_cache(maxsize=8)
def _shell_for(template_id: str) -> dict[str, str]:
    """取模板外壳取色;未知 id -> literary 兜底。lru_cache 避免重复 dict 构造。"""
    return _SHELL.get(template_id, _SHELL["tpl_literary"])


def _esc(text: str) -> str:
    """HTML 转义 + 中和 svg_validator 易误判的字符。

    除常规 & < > 外,额外转义:
    - `"` `'` → 防正文里出现 `style="..."` / `attributeName="..."` 被校验器当成
      真属性扫描(否则正文写 `style="clip-path:x"` 会被判 forbidden-css)。
    - `=` → 防正文里 ` onclick=` 之类子串被事件处理器正则(\\son\\w*\\s*=)误判为
      内联事件。
    三者转义后渲染视觉无差异(`&quot;`/`&#39;`/`&#61;` 即 `"`/`'`/`=`),但保证
    任意正文产出都过 svg_validator 零 issue——本模块「好看 + 必过安全闸」不变量的
    前提(只作用于用户正文,不碰本模块自己构造的 style 属性,故结构样式照常有效)。
    """
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
        .replace("=", "&#61;")
    )


def _chapter_label(n: int) -> str:
    """1-based 章节序号 -> 中文数字;超出 _CJK_NUMERALS -> 阿拉伯数字。"""
    return _CJK_NUMERALS[n - 1] if 1 <= n <= len(_CJK_NUMERALS) else str(n)


def _chapter_num2(n: int) -> str:
    """1-based 章节序号 -> 零填充阿拉伯数字('01'/'02'…),供 minimal/magazine 用。"""
    return f"{n:02d}"


# Markdown 行解析:支持 # / ## 标题、> 引用、段落(列表/其它退化为段落)。
_H1_RE = re.compile(r"^#\s+(.*)$")
_H2_RE = re.compile(r"^##\s+(.*)$")
_QUOTE_RE = re.compile(r"^>\s?(.*)$")


def _split_blocks(markdown: str) -> list[tuple[str, str]]:
    """把 Markdown 切成 (kind, text) 块。kind ∈ {'h1','h2','p','quote'}。
    空行分段;连续 > 行合并为一个引用块。"""
    blocks: list[tuple[str, str]] = []
    pbuf: list[str] = []
    qbuf: list[str] = []

    def flush_p() -> None:
        if pbuf:
            text = " ".join(s.strip() for s in pbuf if s.strip())
            if text:
                blocks.append(("p", text))
            pbuf.clear()

    def flush_q() -> None:
        if qbuf:
            text = " ".join(s.strip() for s in qbuf if s.strip())
            if text:
                blocks.append(("quote", text))
            qbuf.clear()

    for raw in (markdown or "").splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush_p()
            flush_q()
            continue
        mq = _QUOTE_RE.match(line)
        m2 = _H2_RE.match(line)
        m1 = _H1_RE.match(line)
        if mq:
            flush_p()
            qbuf.append(mq.group(1))
        elif m2:                       # 先判 ## ,避免被 # 规则吞掉
            flush_p()
            flush_q()
            blocks.append(("h2", m2.group(1).strip()))
        elif m1:
            flush_p()
            flush_q()
            blocks.append(("h1", m1.group(1).strip()))
        else:
            flush_q()
            pbuf.append(line)
    flush_p()
    flush_q()
    return blocks


def _svg_divider(shell: dict[str, str]) -> str:
    """确定性 SVG 波浪分割线(无动画、无 id、带 xmlns,过校验器零 issue/零警告)。"""
    accent, muted = shell["accent"], shell["muted"]
    return (
        '<section style="text-align:center;padding:6px 0 16px;">'
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="22" viewBox="0 0 400 22" '
        'style="display:inline-block;max-width:300px;">'
        f'<line x1="0" y1="11" x2="158" y2="11" stroke="{muted}" stroke-width="0.6" stroke-dasharray="4,4"/>'
        f'<path d="M184,11 Q192,2 200,11 Q208,2 216,11" fill="none" stroke="{accent}" stroke-width="1"/>'
        f'<circle cx="200" cy="5" r="1.8" fill="{accent}"/>'
        f'<line x1="242" y1="11" x2="400" y2="11" stroke="{muted}" stroke-width="0.6" stroke-dasharray="4,4"/>'
        '</svg></section>'
    )


def _render_hero(title: str, shell: dict[str, str]) -> str:
    """页眉:小字标签 + 居中大标题 + 点缀短分隔线。"""
    parts = ['<section style="padding:34px 26px 6px;text-align:center;">']
    if shell["label"]:
        parts.append(
            f'<section style="font-size:11px;color:{shell["muted"]};'
            f'letter-spacing:6px;margin-bottom:16px;">{_esc(shell["label"])}</section>'
        )
    parts.append(
        f'<section style="font-size:25px;font-weight:bold;color:{shell["ink"]};'
        f'line-height:1.5;letter-spacing:1.5px;">{_esc(title)}</section>'
    )
    parts.append(
        f'<section style="width:40px;height:2px;background-color:{shell["accent"]};'
        f'margin:18px auto 0;"></section>'
    )
    parts.append('</section>')
    return "".join(parts)


def _render_h2(text: str, n: int, shell: dict[str, str]) -> str:
    """章节标题:大号点缀色中文序号 + 标题(inline-block 并排)。"""
    return (
        '<section style="padding:6px 26px 2px;">'
        f'<section style="display:inline-block;vertical-align:middle;font-size:28px;'
        f'font-weight:bold;color:{shell["accent"]};line-height:1;margin-right:10px;">'
        f'{_esc(_chapter_label(n))}</section>'
        f'<section style="display:inline-block;vertical-align:middle;font-size:19px;'
        f'font-weight:bold;color:{shell["ink"]};line-height:1.5;">{_esc(text)}</section>'
        '</section>'
    )


def _render_quote(text: str, shell: dict[str, str]) -> str:
    """引用框:点缀色左边框 + 斜体(朱砂式)。"""
    return (
        f'<section style="border-left:3px solid {shell["accent"]};margin:10px 26px 22px;'
        f'padding:6px 0 6px 16px;font-size:15px;line-height:1.9;color:{shell["ink"]};'
        f'font-style:italic;letter-spacing:0.4px;">{_esc(text)}</section>'
    )


def _render_p(text: str, shell: dict[str, str]) -> str:
    """正文段落:首行缩进 2em。"""
    return (
        f'<section style="font-size:15px;line-height:2.1;color:{shell["ink"]};'
        f'letter-spacing:0.4px;padding:0 26px;margin-bottom:16px;text-indent:2em;">'
        f'{_esc(text)}</section>'
    )


def _render_footer(shell: dict[str, str]) -> str:
    """页脚:SVG 小装饰 + 收束标记。"""
    accent, muted = shell["accent"], shell["muted"]
    return (
        '<section style="text-align:center;padding:18px 26px 36px;">'
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="16" viewBox="0 0 80 16" '
        'style="display:inline-block;margin-bottom:8px;">'
        f'<line x1="0" y1="8" x2="26" y2="8" stroke="{accent}" stroke-width="0.6"/>'
        f'<path d="M34,8 Q37,2 40,8 Q43,2 46,8" fill="none" stroke="{accent}" stroke-width="0.8"/>'
        f'<circle cx="40" cy="4" r="1.4" fill="{accent}"/>'
        f'<line x1="54" y1="8" x2="80" y2="8" stroke="{accent}" stroke-width="0.6"/>'
        '</svg>'
        f'<section style="font-size:11px;color:{muted};letter-spacing:3px;">· 完 ·</section>'
        '</section>'
    )


# ============================================================================
# minimal(干货利落):左对齐 / 锐利 / 实心徽标 / 纯横线分隔 / 无 SVG 波浪。
# ============================================================================

def _render_hero_minimal(title: str, shell: dict[str, str]) -> str:
    """页眉:左对齐粗标题 + 左侧粗点缀竖条 + 上方小号大写标签(非居中)。"""
    parts = ['<section style="padding:34px 26px 10px;">']
    if shell["label"]:
        parts.append(
            f'<section style="font-size:11px;color:{shell["muted"]};'
            f'letter-spacing:3px;margin-bottom:12px;text-transform:uppercase;">'
            f'{_esc(shell["label"])}</section>'
        )
    parts.append(
        f'<section style="border-left:5px solid {shell["accent"]};padding-left:14px;'
        f'font-size:25px;font-weight:bold;color:{shell["ink"]};line-height:1.45;">'
        f'{_esc(title)}</section>'
    )
    parts.append('</section>')
    return "".join(parts)


def _rule_minimal(shell: dict[str, str]) -> str:
    """分隔:整宽细横线(border-top,无 SVG)。"""
    return (
        f'<section style="border-top:1px solid {shell["muted"]};'
        f'margin:8px 26px 18px;"></section>'
    )


def _render_h2_minimal(text: str, n: int, shell: dict[str, str]) -> str:
    """章节标题:实心点缀色方形数字徽标(01/02) + 左对齐粗标题。"""
    return (
        '<section style="padding:4px 26px 2px;">'
        f'<section style="display:inline-block;vertical-align:middle;'
        f'background-color:{shell["accent"]};color:{shell["paper"]};font-size:13px;'
        f'font-weight:bold;line-height:1;padding:6px 8px;margin-right:10px;'
        f'letter-spacing:1px;">{_esc(_chapter_num2(n))}</section>'
        f'<section style="display:inline-block;vertical-align:middle;font-size:19px;'
        f'font-weight:bold;color:{shell["ink"]};line-height:1.5;">{_esc(text)}</section>'
        '</section>'
    )


def _render_quote_minimal(text: str, shell: dict[str, str]) -> str:
    """引用:粗点缀色左边框 callout,非斜体,略缩进。"""
    return (
        f'<section style="border-left:5px solid {shell["accent"]};margin:10px 34px 22px;'
        f'padding:10px 0 10px 16px;font-size:15px;line-height:1.85;color:{shell["ink"]};'
        f'letter-spacing:0.3px;">{_esc(text)}</section>'
    )


def _render_p_minimal(text: str, shell: dict[str, str]) -> str:
    """正文:齐头(无缩进),line-height ~1.8。"""
    return (
        f'<section style="font-size:15px;line-height:1.8;color:{shell["ink"]};'
        f'letter-spacing:0.3px;padding:0 26px;margin-bottom:15px;">'
        f'{_esc(text)}</section>'
    )


def _render_footer_minimal(shell: dict[str, str]) -> str:
    """页脚:居中细横线 + 小号疏字距灰色 END(无 SVG)。"""
    return (
        '<section style="text-align:center;padding:20px 26px 36px;">'
        f'<section style="width:48px;height:1px;background-color:{shell["muted"]};'
        f'margin:0 auto 12px;"></section>'
        f'<section style="font-size:11px;color:{shell["muted"]};letter-spacing:5px;">'
        f'E N D</section>'
        '</section>'
    )


# ============================================================================
# vibrant(俏皮带梗):圆润 / 圆点 / 圆形徽标 / 气泡引用。
# ============================================================================

def _svg_dots_vibrant(shell: dict[str, str], n: int = 3) -> str:
    """点缀:n 个点缀色圆点(SVG circle,无动画/无 id/带 xmlns)。"""
    accent = shell["accent"]
    w = 18 * n
    circles = "".join(
        f'<circle cx="{9 + i * 18}" cy="9" r="3.4" fill="{accent}"/>' for i in range(n)
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="18" '
        f'viewBox="0 0 {w} 18" style="display:inline-block;">{circles}</svg>'
    )


def _render_hero_vibrant(title: str, shell: dict[str, str]) -> str:
    """页眉:居中标题在圆角卡片内(border-radius + 2px 点缀边框) + 上方点缀小圆点。"""
    parts = ['<section style="padding:30px 22px 8px;text-align:center;">']
    parts.append(f'<section style="margin-bottom:14px;">{_svg_dots_vibrant(shell)}</section>')
    label = ""
    if shell["label"]:
        label = (
            f'<section style="font-size:11px;color:{shell["muted"]};'
            f'letter-spacing:4px;margin-bottom:10px;">{_esc(shell["label"])}</section>'
        )
    parts.append(
        f'<section style="border:2px solid {shell["accent"]};border-radius:18px;'
        f'padding:20px 18px;background-color:{shell["paper"]};">'
        f'{label}'
        f'<section style="font-size:24px;font-weight:bold;color:{shell["ink"]};'
        f'line-height:1.5;letter-spacing:1px;">{_esc(title)}</section>'
        f'</section>'
    )
    parts.append('</section>')
    return "".join(parts)


def _divider_vibrant(shell: dict[str, str]) -> str:
    """分隔:居中三颗点缀色圆点(SVG circles)。"""
    return (
        '<section style="text-align:center;padding:8px 0 16px;">'
        f'{_svg_dots_vibrant(shell)}'
        '</section>'
    )


def _render_h2_vibrant(text: str, n: int, shell: dict[str, str]) -> str:
    """章节标题:圆形点缀徽标(border-radius:50%,点缀底/纸色数字) + 标题。"""
    return (
        '<section style="padding:4px 22px 2px;">'
        f'<section style="display:inline-block;vertical-align:middle;width:30px;height:30px;'
        f'border-radius:50%;background-color:{shell["accent"]};color:{shell["paper"]};'
        f'text-align:center;line-height:30px;font-size:15px;font-weight:bold;'
        f'margin-right:10px;">{_esc(str(n))}</section>'
        f'<section style="display:inline-block;vertical-align:middle;font-size:19px;'
        f'font-weight:bold;color:{shell["ink"]};line-height:1.5;">{_esc(text)}</section>'
        '</section>'
    )


def _render_quote_vibrant(text: str, shell: dict[str, str]) -> str:
    """引用:圆角气泡(border-radius)+ 点缀边框,非斜体。"""
    return (
        f'<section style="border:2px solid {shell["accent"]};border-radius:14px;'
        f'margin:10px 24px 22px;padding:12px 16px;font-size:15px;line-height:1.9;'
        f'color:{shell["ink"]};background-color:{shell["paper"]};">{_esc(text)}</section>'
    )


def _render_p_vibrant(text: str, shell: dict[str, str]) -> str:
    """正文:首行缩进 2em,line-height ~2.0。"""
    return (
        f'<section style="font-size:15px;line-height:2.0;color:{shell["ink"]};'
        f'letter-spacing:0.4px;padding:0 24px;margin-bottom:16px;text-indent:2em;">'
        f'{_esc(text)}</section>'
    )


def _render_footer_vibrant(shell: dict[str, str]) -> str:
    """页脚:小号点缀圆点 SVG + 俏皮 · 完 ✦ ·。"""
    return (
        '<section style="text-align:center;padding:18px 24px 36px;">'
        f'<section style="margin-bottom:8px;">{_svg_dots_vibrant(shell)}</section>'
        f'<section style="font-size:12px;color:{shell["muted"]};letter-spacing:3px;">'
        f'· 完 ✦ ·</section>'
        '</section>'
    )


# ============================================================================
# magazine(克制高级):发际线 / 留白 / 大写 kicker / 宽字距。
# ============================================================================

def _render_hero_magazine(title: str, shell: dict[str, str]) -> str:
    """页眉:小号大写疏字距 kicker + 宽字距大标题 + 整宽细发际线(border-bottom)。"""
    parts = ['<section style="padding:44px 28px 0;">']
    if shell["label"]:
        parts.append(
            f'<section style="font-size:11px;color:{shell["muted"]};'
            f'letter-spacing:5px;margin-bottom:18px;text-transform:uppercase;">'
            f'{_esc(shell["label"])}</section>'
        )
    parts.append(
        f'<section style="font-size:27px;font-weight:bold;color:{shell["ink"]};'
        f'line-height:1.5;letter-spacing:3px;padding-bottom:22px;">{_esc(title)}</section>'
    )
    parts.append('</section>')
    parts.append(
        f'<section style="border-bottom:1px solid {shell["muted"]};margin:0 28px 6px;">'
        f'</section>'
    )
    return "".join(parts)


def _divider_magazine(shell: dict[str, str]) -> str:
    """分隔:单条居中短发际线(无波浪)。"""
    return (
        f'<section style="text-align:center;padding:10px 0 18px;">'
        f'<section style="display:inline-block;width:56px;height:1px;'
        f'background-color:{shell["muted"]};"></section>'
        f'</section>'
    )


def _render_h2_magazine(text: str, n: int, shell: dict[str, str]) -> str:
    """章节标题:小号大写灰数字标签 + 短细线 + 宽字距标题 + 充裕留白。"""
    return (
        '<section style="padding:6px 28px 2px;margin-top:6px;">'
        f'<section style="font-size:11px;color:{shell["muted"]};letter-spacing:4px;'
        f'text-transform:uppercase;margin-bottom:6px;">{_esc(_chapter_num2(n))}</section>'
        f'<section style="width:28px;height:1px;background-color:{shell["accent"]};'
        f'margin-bottom:10px;"></section>'
        f'<section style="font-size:19px;font-weight:bold;color:{shell["ink"]};'
        f'line-height:1.5;letter-spacing:1.5px;">{_esc(text)}</section>'
        '</section>'
    )


def _render_quote_magazine(text: str, shell: dict[str, str]) -> str:
    """引用:居中、较大字号、克制色(ink),上下细发际线框。"""
    return (
        f'<section style="text-align:center;margin:14px 32px 24px;'
        f'border-top:1px solid {shell["muted"]};border-bottom:1px solid {shell["muted"]};'
        f'padding:16px 8px;font-size:17px;line-height:1.8;color:{shell["ink"]};'
        f'letter-spacing:0.8px;">{_esc(text)}</section>'
    )


def _render_p_magazine(text: str, shell: dict[str, str]) -> str:
    """正文:齐头(无缩进),line-height ~2.0,小字距。"""
    return (
        f'<section style="font-size:15px;line-height:2.0;color:{shell["ink"]};'
        f'letter-spacing:0.6px;padding:0 28px;margin-bottom:17px;">'
        f'{_esc(text)}</section>'
    )


def _render_footer_magazine(shell: dict[str, str]) -> str:
    """页脚:单个居中灰点 · ,宽字距,充裕留白。"""
    return (
        '<section style="text-align:center;padding:26px 28px 44px;">'
        f'<section style="font-size:14px;color:{shell["muted"]};letter-spacing:8px;">'
        f'·</section>'
        '</section>'
    )


# ============================================================================
# 按 kind 分派的渲染器表。literary 即原始确定性外壳(保持视觉不变)。
# ============================================================================

_RENDERERS: dict[str, dict[str, object]] = {
    "literary": {
        "hero": _render_hero, "h2": _render_h2, "quote": _render_quote,
        "p": _render_p, "divider": _svg_divider, "footer": _render_footer,
    },
    "minimal": {
        "hero": _render_hero_minimal, "h2": _render_h2_minimal,
        "quote": _render_quote_minimal, "p": _render_p_minimal,
        "divider": _rule_minimal, "footer": _render_footer_minimal,
    },
    "vibrant": {
        "hero": _render_hero_vibrant, "h2": _render_h2_vibrant,
        "quote": _render_quote_vibrant, "p": _render_p_vibrant,
        "divider": _divider_vibrant, "footer": _render_footer_vibrant,
    },
    "magazine": {
        "hero": _render_hero_magazine, "h2": _render_h2_magazine,
        "quote": _render_quote_magazine, "p": _render_p_magazine,
        "divider": _divider_magazine, "footer": _render_footer_magazine,
    },
}


def _render_rich(markdown: str, shell: dict[str, str], kind: str = "literary") -> str:
    """装饰版:按 kind 选一组渲染器,页眉 + 分隔 + 编号章节 + 引用 + 正文 + 页脚。
    单块 <section>。literary 即原始外壳;minimal/vibrant/magazine 结构各异。"""
    r = _RENDERERS.get(kind, _RENDERERS["literary"])
    parts: list[str] = [f'<section style="background-color:{shell["paper"]};padding:18px 0 4px;">']
    chapter = 0
    hero_done = False
    for blk_kind, text in _split_blocks(markdown):
        if blk_kind == "h1" and not hero_done:
            parts.append(r["hero"](text, shell))
            hero_done = True
        elif blk_kind in ("h1", "h2"):   # 二级标题 / 文中再现的一级标题 -> 编号章节
            parts.append(r["divider"](shell))
            chapter += 1
            parts.append(r["h2"](text, chapter, shell))
        elif blk_kind == "quote":
            parts.append(r["quote"](text, shell))
        else:
            parts.append(r["p"](text, shell))
    parts.append(r["footer"](shell))
    parts.append("</section>")
    return "".join(parts)


def _render_plain(markdown: str, shell: dict[str, str]) -> str:
    """纯净版:白纸黑字、无 SVG、无 <style>。自检不过兜底。"""
    parts: list[str] = [f'<section style="background-color:{shell["paper"]};padding:28px 24px;">']
    for kind, text in _split_blocks(markdown):
        safe = _esc(text)
        if kind == "h1":
            parts.append(
                f'<section style="font-size:24px;font-weight:bold;color:{shell["ink"]};'
                f'line-height:1.5;margin-bottom:18px;">{safe}</section>'
            )
        elif kind == "h2":
            parts.append(
                f'<section style="font-size:18px;font-weight:bold;color:{shell["ink"]};'
                f'line-height:1.6;margin:20px 0 10px;">{safe}</section>'
            )
        elif kind == "quote":
            parts.append(
                f'<section style="border-left:3px solid {shell["accent"]};padding-left:14px;'
                f'margin:10px 0 18px;color:{shell["ink"]};line-height:1.9;font-style:italic;">{safe}</section>'
            )
        else:
            parts.append(
                f'<section style="font-size:15px;line-height:2.0;color:{shell["ink"]};'
                f'margin-bottom:16px;text-indent:2em;">{safe}</section>'
            )
    parts.append("</section>")
    return "".join(parts)


def compose_plain(markdown: str) -> str:
    """纯净排版降级:白纸黑字、无 SVG、无 <style>。自检不过时的兜底。"""
    return _render_plain(markdown, _PLAIN_SHELL)


def compose(markdown: str, *, template_id: str) -> str:
    """把行文 Markdown 套进 template_id 对应的装饰外壳,返回单块安全 <section> HTML。

    未知 template_id 或套版异常 -> compose_plain。产出保证过 svg_validator 零 issue。
    """
    if template_id not in TEMPLATE_IDS:
        return compose_plain(markdown)
    try:
        return _render_rich(markdown, _shell_for(template_id), _kind_for(template_id))
    except Exception:
        return compose_plain(markdown)
