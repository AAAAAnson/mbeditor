"""Tests for layout_composer: Markdown 正文套安全装饰外壳(增强确定性外壳)。

契约(article_author 制版工序消费):
- compose(markdown, *, template_id) -> 单块装饰版 <section>(含 SVG,过 validator 零 issue)。
- compose_plain(markdown) -> 纯净降级(无 SVG、无 <style>),自检不过兜底。
- TEMPLATE_IDS 五套。未知模板 / 套版异常 -> compose_plain。
"""
from __future__ import annotations

from app.services import layout_composer  # noqa: F401  (保留模块引用,便于 monkeypatch)
from app.services.layout_composer import TEMPLATE_IDS, compose, compose_plain
from app.services.svg_validator import validate_html


def test_known_templates_registered():
    # 五套排版模板齐全,id 与文件名一致。
    assert set(TEMPLATE_IDS) == {
        "tpl_literary", "tpl_biz_minimal", "tpl_vibrant",
        "tpl_magazine", "tpl_tech_neon",
    }


def test_compose_wraps_body_in_section_and_passes_validator():
    md = "# 海洋馆的两小时\n\n上周末带娃去海洋馆。\n\n第二段正文。"
    html = compose(md, template_id="tpl_literary")
    assert html.startswith("<section")
    assert html.rstrip().endswith("</section>")
    assert "上周末带娃去海洋馆。" in html
    # 套出来的 HTML 必须过微信安全闸(零 issue)。
    assert validate_html(html)["issues"] == []


def test_compose_escapes_html_in_body():
    html = compose("正文含 <script>alert(1)</script> 危险标签", template_id="tpl_biz_minimal")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert validate_html(html)["issues"] == []


def test_compose_unknown_template_falls_back_to_plain():
    # 未知 id 不抛,降级纯净排版(无 SVG)。
    html = compose("正文", template_id="tpl_does_not_exist")
    assert html.startswith("<section")
    assert "<svg" not in html
    assert validate_html(html)["issues"] == []


def test_compose_plain_is_minimal_and_safe():
    html = compose_plain("# 标题\n\n一段正文。\n\n另一段。")
    assert html.startswith("<section")
    assert "一段正文。" in html
    assert "另一段。" in html
    # 纯净排版无 SVG、无 <style>、过校验。
    assert "<svg" not in html
    assert validate_html(html)["issues"] == []


# —— 增强确定性外壳:页眉/SVG 装饰 / 章节中文序号 / 朱砂引用框 / 无标题兜底 ——

def test_compose_decorated_has_hero_and_svg_divider():
    md = "# 标题\n\n## 第一节\n\n正文一。\n\n## 第二节\n\n正文二。"
    html = compose(md, template_id="tpl_literary")
    assert "<svg" in html                                  # 装饰版含 SVG 分割/页脚
    assert 'xmlns="http://www.w3.org/2000/svg"' in html    # SVG 声明 xmlns(零警告)
    assert "标题" in html
    assert validate_html(html)["issues"] == []


def test_compose_numbers_h2_chapters():
    # literary 用 CJK 序号(壹/贰);minimal/magazine 改用零填充阿拉伯数字徽标,
    # 各自的章节编号见 test_per_style_structural_markers。
    md = "# T\n\n## 甲\n\n一。\n\n## 乙\n\n二。"
    html = compose(md, template_id="tpl_literary")
    assert "壹" in html and "贰" in html                    # 章节中文序号确定性递增
    assert validate_html(html)["issues"] == []


def test_compose_renders_blockquote_as_quote_frame():
    # literary/minimal/vibrant 用左边框/边框引用框;magazine 改用上下发际线居中引用,
    # 见 test_per_style_structural_markers。此处验证带边框那类的引用渲染。
    md = "# T\n\n> 这是一句引用\n\n正文。"
    html = compose(md, template_id="tpl_literary")
    assert "这是一句引用" in html
    assert "border-left" in html                           # 朱砂左边框引用框
    assert validate_html(html)["issues"] == []


def test_compose_handles_no_title_gracefully():
    html = compose("没有标题的纯段落。\n\n第二段。", template_id="tpl_vibrant")
    assert html.startswith("<section")
    assert "没有标题的纯段落。" in html
    assert validate_html(html)["issues"] == []


def test_compose_neutralizes_validator_tripping_text():
    # 正文里出现会被 svg_validator 误判的子串——事件处理器 " onX="、伪属性
    # style="..." / attributeName="..."——转义后装饰版(各模板)与纯净版都必须
    # 仍过校验器零 issue,否则 article_author 自检会硬拦无辜文章(如讲前端的科普)。
    tricky = (
        "# 讲讲前端事件\n\n"
        "可以用 onclick= 绑定,也别写 style=\"clip-path:inset(0)\" 这种。\n\n"
        "> 还有 onload= 与 attributeName=\"d\" 也要扛住"
    )
    for tid in ("tpl_literary", "tpl_tech_neon", "tpl_does_not_exist"):
        assert validate_html(compose(tricky, template_id=tid))["issues"] == []
    assert validate_html(compose_plain(tricky))["issues"] == []


# —— 按调子做结构性不同的外壳:每套结构/装饰独立,仍守零 issue + 零警告铁律 ——

import pytest  # noqa: E402

# 含一级标题 / 两段正文 / ## 小节 / > 引用 —— 各装饰分支都被覆盖。
_SAMPLE_MD = (
    "# 海边那一下午\n\n"
    "海风把伞吹得东倒西歪,小孩追着浪跑。\n\n"
    "我们捡了一兜贝壳,装在矿泉水瓶里。\n\n"
    "## 退潮以后\n\n"
    "礁石上爬满了寄居蟹,像一场小小的迁徙。\n\n"
    "> 海不负人,人却常常辜负一个安静的下午。\n\n"
    "回程时夕阳正好,把每个人都镀成了金色。"
)

# 4 套被 article_author tone 映射的模板(literary/biz_minimal/vibrant/magazine)。
_TONE_TEMPLATES = ("tpl_literary", "tpl_biz_minimal", "tpl_vibrant", "tpl_magazine")


@pytest.mark.parametrize("tid", TEMPLATE_IDS)
def test_every_template_zero_issue_zero_warning(tid):
    # 铁律:每套模板套真实 markdown(含 ## 与 > 与多段)都过校验器零 issue + 零警告。
    html = compose(_SAMPLE_MD, template_id=tid)
    report = validate_html(html)
    assert report["issues"] == [], (tid, report["issues"])
    assert report["warnings"] == [], (tid, report["warnings"])


@pytest.mark.parametrize("tid", TEMPLATE_IDS)
def test_every_template_includes_escaped_body(tid):
    # 任何模板都必须含转义后的正文(直推送草稿,正文不能丢)。
    html = compose(_SAMPLE_MD, template_id=tid)
    assert "海风把伞吹得东倒西歪" in html
    assert "退潮以后" in html
    assert "海不负人" in html


def test_tone_templates_are_mutually_distinct():
    # 4 套 tone 模板两两 HTML 不同 —— 不是仅换色,而是结构性不同。
    htmls = {tid: compose(_SAMPLE_MD, template_id=tid) for tid in _TONE_TEMPLATES}
    pairs = [
        (a, b)
        for i, a in enumerate(_TONE_TEMPLATES)
        for b in _TONE_TEMPLATES[i + 1:]
    ]
    for a, b in pairs:
        assert htmls[a] != htmls[b], f"{a} 与 {b} 渲染结果相同(只换了色?)"


def test_per_style_structural_markers():
    # 每套有独占的结构性标记子串,证明结构不同而非仅重新着色。
    literary = compose(_SAMPLE_MD, template_id="tpl_literary")
    minimal = compose(_SAMPLE_MD, template_id="tpl_biz_minimal")
    vibrant = compose(_SAMPLE_MD, template_id="tpl_vibrant")
    magazine = compose(_SAMPLE_MD, template_id="tpl_magazine")

    # literary:CJK 章节序号(壹) + 斜体引用
    assert "壹" in literary
    assert "font-style:italic" in literary
    # biz_minimal:零填充阿拉伯数字徽标(01) + 无 SVG 波浪(纯横线分隔)
    assert "01" in minimal
    assert "壹" not in minimal
    # vibrant:圆形徽标 border-radius:50%
    assert "border-radius:50%" in vibrant
    # magazine:大写 kicker 标签 + letter-spacing 发际线;无 CJK 序号、无 50% 圆
    assert "letter-spacing" in magazine
    assert "壹" not in magazine
    assert "border-radius:50%" not in magazine


def test_compose_is_deterministic_per_template():
    for tid in TEMPLATE_IDS:
        assert compose(_SAMPLE_MD, template_id=tid) == compose(_SAMPLE_MD, template_id=tid)


# ── 守护:paper 只在信封壳、正文块透明、深色模板壳深色(2026-07-07)────────
_BG_MD = "# 标题\n\n第一段正文足够长足够长足够长。\n\n## 小节\n\n第二段正文足够长。\n"


def test_shell_carries_template_paper_as_page_background():
    """paper「搬家到壳」:每套模板的页背景在信封壳开标签上,是唯一真源。"""
    from app.services.block_doc import html_to_blocks
    from app.services.layout_composer import _SHELL

    for tid in TEMPLATE_IDS:
        doc = html_to_blocks(compose(_BG_MD, template_id=tid))
        assert doc.shell_open.startswith("<section")
        assert doc.shell_close.strip() == "</section>"
        assert f'background-color:{_SHELL[tid]["paper"]}' in doc.shell_open


def test_dark_template_keeps_dark_shell_background():
    """深色模板 tech_neon 壳背景必须是深色,否则浅字掉白画布不可读。"""
    from app.services.block_doc import html_to_blocks

    doc = html_to_blocks(compose(_BG_MD, template_id="tpl_tech_neon"))
    assert "#0f1117" in doc.shell_open


def test_minimal_content_blocks_have_no_background_fill():
    """干货模板正文/结构块不带自身背景填充 -> 改壳背景全篇跟随。"""
    from app.services.block_doc import html_to_blocks

    doc = html_to_blocks(compose(_BG_MD, template_id="tpl_biz_minimal"))
    for b in doc.blocks:
        root = b.html[: b.html.find(">") + 1] if b.html.startswith("<") else ""
        assert "background-color" not in root, (b.kind, root)
