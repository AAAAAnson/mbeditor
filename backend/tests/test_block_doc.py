"""块模型纯函数测试(``app.services.block_doc``)。

核心不变量:``blocks_to_html(html_to_blocks(h)) == h`` **逐字节相等**——
切分只定位边界、绝不改写内容/空白。素材覆盖 layout_composer 5 套版式的
真实输出 + 手工边界(无信封多顶层/裸文本夹缝/注释/嵌套 section/空文章/
非法 HTML 碎片/rawtext script/属性内大于号)。
"""
import pytest

from app.services.block_doc import Block, BlockDoc, blocks_to_html, html_to_blocks
from app.services.layout_composer import TEMPLATE_IDS, compose

_SAMPLE_MD = (
    "# 秋日散步指南\n\n"
    "第一段:巷口的桂花开了,风一吹满街都是甜的。\n\n"
    "## 路线建议\n\n"
    "第二段带**强调**,以及一点`行内代码`。\n\n"
    "- 先走河堤\n"
    "- 再拐进老街\n\n"
    "> 引用:慢一点,再慢一点。\n"
)

# 手工边界素材:名字 -> HTML(全部参与往返断言)
_MANUAL_CASES = {
    "无信封多顶层": "<h2>标题</h2><p>第一段</p><p>第二段</p>",
    "纯文本节点夹缝": "<p>前</p>裸文本夹缝<p>后</p>",
    "注释": "<!-- 头注 --><p>正文</p><!-- 尾注 -->",
    "嵌套section信封": (
        '<section id="root"><section><p>甲</p></section>'
        "<section><p>乙</p></section></section>"
    ),
    "空文章": "",
    "纯空白": "  \n\t ",
    "非法HTML碎片": '<p>未闭合段落<div>错位</p></div><foo bar="<x>">怪异',
    "信封带首尾空白": '\n  <section class="shell"><h1>题</h1><p>文</p></section>\n',
    "svg与分隔线": (
        '<section><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
        '<hr/><img src="https://example.com/a.png"></section>'
    ),
    "属性内大于号": '<div title="a>b"><p>内容</p></div>',
    "rawtext脚本": (
        "<div><script>if (1 < 2) { x = '</div>'; }</script><p>后文</p></div>"
    ),
    "信封内块间空白": "<section>\n  <p>甲</p>\n  <p>乙</p>\n</section>",
    "doctype声明": "<!DOCTYPE html><p>正文</p>",
}


# ---------- 硬验收:无损往返 ----------

@pytest.mark.parametrize("tid", TEMPLATE_IDS)
def test_roundtrip_composed_layouts(tid):
    """5 套版式真实输出逐字节往返。"""
    html = compose(_SAMPLE_MD, template_id=tid)
    doc = html_to_blocks(html)
    assert blocks_to_html(doc) == html


@pytest.mark.parametrize("name", sorted(_MANUAL_CASES))
def test_roundtrip_manual_cases(name):
    html = _MANUAL_CASES[name]
    doc = html_to_blocks(html)
    assert blocks_to_html(doc) == html


# ---------- 信封检测 ----------

def test_envelope_detected_for_composed_output():
    """AI 产文是单根 <section> 信封:开/闭标签进 shell,子级成块。"""
    html = compose(_SAMPLE_MD, template_id="tpl_literary")
    doc = html_to_blocks(html)
    assert doc.shell_open.lstrip().lower().startswith("<section")
    assert doc.shell_close.rstrip().lower().endswith("</section>")
    assert len(doc.blocks) >= 1


def test_envelope_nested_sections_become_blocks():
    doc = html_to_blocks(_MANUAL_CASES["嵌套section信封"])
    assert doc.shell_open == '<section id="root">'
    assert doc.shell_close == "</section>"
    assert len(doc.blocks) == 2
    assert all(b.kind == "text" for b in doc.blocks)


def test_envelope_with_surrounding_whitespace():
    """信封外的首尾空白进 shell,不丢字节。"""
    doc = html_to_blocks(_MANUAL_CASES["信封带首尾空白"])
    assert doc.shell_open.startswith("\n  <section")
    assert doc.shell_close.endswith("</section>\n")
    kinds = [b.kind for b in doc.blocks]
    assert kinds == ["heading", "text"]


def test_no_envelope_for_multiple_toplevel():
    doc = html_to_blocks(_MANUAL_CASES["无信封多顶层"])
    assert doc.shell_open == ""
    assert doc.shell_close == ""
    assert [b.kind for b in doc.blocks] == ["heading", "text", "text"]


def test_no_envelope_when_comment_outside():
    """顶层有注释兄弟 -> 不算单根信封。"""
    doc = html_to_blocks(_MANUAL_CASES["注释"])
    assert doc.shell_open == ""
    assert [b.kind for b in doc.blocks] == ["raw", "text", "raw"]


# ---------- 启发式分类 ----------

def test_kind_heuristics_inside_envelope():
    doc = html_to_blocks(_MANUAL_CASES["svg与分隔线"])
    assert [b.kind for b in doc.blocks] == ["svg", "divider", "image"]


def test_bare_text_node_is_text_block():
    doc = html_to_blocks(_MANUAL_CASES["纯文本节点夹缝"])
    kinds = [b.kind for b in doc.blocks]
    assert kinds == ["text", "text", "text"]
    assert doc.blocks[1].html == "裸文本夹缝"


def test_heading_detection_wrapped():
    doc = html_to_blocks("<div><h3>小节</h3></div><p>x</p>")
    assert doc.blocks[0].kind == "heading"


def test_empty_element_is_raw():
    doc = html_to_blocks('<section style="height:24px"></section><p>x</p>')
    assert doc.blocks[0].kind == "raw"


# ---------- 块 id 确定性 ----------

def test_block_ids_deterministic_sequence():
    html = _MANUAL_CASES["无信封多顶层"]
    doc1 = html_to_blocks(html)
    doc2 = html_to_blocks(html)
    assert [b.id for b in doc1.blocks] == ["b1", "b2", "b3"]
    assert [b.id for b in doc1.blocks] == [b.id for b in doc2.blocks]


# ---------- 空/退化输入 ----------

def test_empty_article():
    doc = html_to_blocks("")
    assert doc == BlockDoc(shell_open="", shell_close="", blocks=[])
    assert blocks_to_html(doc) == ""


def test_whitespace_only_article_preserved():
    doc = html_to_blocks(_MANUAL_CASES["纯空白"])
    assert blocks_to_html(doc) == _MANUAL_CASES["纯空白"]


def test_blocks_to_html_manual_doc():
    doc = BlockDoc(
        shell_open="<section>",
        shell_close="</section>",
        blocks=[
            Block(id="b1", kind="heading", html="<h1>题</h1>"),
            Block(id="b2", kind="text", html="<p>文</p>"),
        ],
    )
    assert blocks_to_html(doc) == "<section><h1>题</h1><p>文</p></section>"
