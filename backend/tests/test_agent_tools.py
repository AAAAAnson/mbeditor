"""批3:agent 工具层(7 个纯函数工具 + dispatcher + T1/T2 反馈)。

全部工具接 (doc, args) -> ToolOutcome{doc, payload},不持状态、不改入参 doc。
写工具自动后置 api-storage-safe 档 sanitize,payload 带 {applied, repairs,
violations};错误一律返回错误 payload(不抛),让 LLM 能看懂自纠。
"""
import copy

import pytest

from app.services.agent_tools import (
    TOOL_SPECS,
    ToolOutcome,
    _merge_style_into_root,
    run_tool,
)
from app.services.block_doc import BlockDoc, blocks_to_html, html_to_blocks


ARTICLE = (
    '<section style="background:#faf6f0; padding:24px">'
    '<section style="font-size:20px; font-weight:bold">开头的标题一行</section>'
    '<p style="color:#333">这是第一段正文,讲了一个很长很长的故事,'
    "足够长到需要被摘要截断,再多写一点凑够八十个字——"
    "春天的风吹过院子,老人坐在门口晒太阳,猫在墙头打盹,一切都慢了下来。</p>"
    '<img src="https://mmbiz.qpic.cn/x.png" style="width:100%">'
    "<hr>"
    '<p style="color:#666">第二段正文。</p>'
    "</section>"
)


@pytest.fixture()
def doc() -> BlockDoc:
    return html_to_blocks(ARTICLE)


def _snapshot(d: BlockDoc):
    return (
        blocks_to_html(d),
        [(b.id, b.kind, b.html) for b in d.blocks],
        copy.deepcopy(getattr(d, "design_tokens", {})),
    )


# ---------------------------------------------------------------------------
# TOOL_SPECS / dispatcher
# ---------------------------------------------------------------------------


def test_tool_specs_seven_flat_tools():
    names = [s.name for s in TOOL_SPECS]
    assert names == [
        "read_article", "read_blocks", "replace_block", "apply_block_style",
        "set_design_tokens", "edit_structure", "list_capabilities",
    ]
    assert len(names) <= 8
    for spec in TOOL_SPECS:
        assert spec.description  # 中文描述
        props = spec.parameters.get("properties", {})
        for name, schema in props.items():
            # 参数扁平:不允许嵌套 object(DeepSeek 约束,spec §3)
            assert schema.get("type") != "object", (spec.name, name)


def test_run_tool_unknown_tool_returns_error_payload(doc):
    out = run_tool("no_such_tool", doc, {})
    assert isinstance(out, ToolOutcome)
    assert out.doc is doc
    assert "error" in out.payload
    assert "no_such_tool" in out.payload["error"]
    assert set(out.payload["available_tools"]) == {s.name for s in TOOL_SPECS}


def test_run_tool_schema_validation_failure_is_error_payload(doc):
    out = run_tool("read_blocks", doc, {"ids": "b1"})  # 应为数组
    assert "error" in out.payload
    assert out.payload.get("fix_hint")


# ---------------------------------------------------------------------------
# read_article / read_blocks
# ---------------------------------------------------------------------------


def test_read_article_lists_blocks_with_short_summary(doc):
    out = run_tool("read_article", doc, {})
    payload = out.payload
    assert out.doc is doc
    ids = [b["id"] for b in payload["blocks"]]
    assert ids == [b.id for b in doc.blocks]
    for b in payload["blocks"]:
        assert set(b) == {"id", "kind", "summary"}
        assert len(b["summary"]) <= 80
    # 长段落被截断
    long_block = payload["blocks"][1]
    assert "第一段正文" in long_block["summary"]
    assert payload["stats"]["block_count"] == len(doc.blocks)
    assert payload["stats"]["char_count"] == len(blocks_to_html(doc))


def test_read_article_heading_located_by_text_not_kind(doc):
    """批2 交接:真实版式标题是 styled section,kind 永远不是 heading——
    摘要必须携带标题文本,让 LLM 按文本定位。"""
    out = run_tool("read_article", doc, {})
    summaries = [b["summary"] for b in out.payload["blocks"]]
    assert any("开头的标题一行" in s for s in summaries)


def _make_doc(n: int) -> BlockDoc:
    inner = "".join(f'<p style="color:#333">第 {i} 段正文。</p>' for i in range(n))
    return html_to_blocks(f"<section>{inner}</section>")


def test_read_article_caps_block_list_at_200_with_note():
    """项4:超 200 块时块清单截断,附 truncated + note;stats 仍是真实总数。"""
    doc = _make_doc(201)
    out = run_tool("read_article", doc, {})
    payload = out.payload
    assert len(payload["blocks"]) == 200
    assert payload["truncated"] is True
    assert "201" in payload["note"]
    assert "read_blocks" in payload["note"]
    assert payload["stats"]["block_count"] == 201
    # 截断保序:回的是前 200 块
    assert payload["blocks"][0]["id"] == doc.blocks[0].id
    assert payload["blocks"][-1]["id"] == doc.blocks[199].id


def test_read_article_at_limit_has_no_truncation_fields():
    """项4:恰好 200 块(≤上限)行为不变,不出现 truncated/note 字段。"""
    doc = _make_doc(200)
    out = run_tool("read_article", doc, {})
    payload = out.payload
    assert len(payload["blocks"]) == 200
    assert "truncated" not in payload
    assert "note" not in payload


def test_read_blocks_returns_full_html(doc):
    first = doc.blocks[0]
    out = run_tool("read_blocks", doc, {"ids": [first.id]})
    assert out.payload["blocks"] == [
        {"id": first.id, "kind": first.kind, "html": first.html}
    ]


def test_read_blocks_unknown_id_lists_existing_ids(doc):
    out = run_tool("read_blocks", doc, {"ids": ["b999"]})
    assert "error" in out.payload
    assert "b999" in out.payload["error"]
    assert out.payload["existing_ids"] == [b.id for b in doc.blocks]


# ---------------------------------------------------------------------------
# replace_block(含 T1 记账)
# ---------------------------------------------------------------------------


def test_replace_block_applies_sanitized_html(doc):
    before = _snapshot(doc)
    bid = doc.blocks[1].id
    out = run_tool("replace_block", doc, {
        "block_id": bid,
        "html": '<p style="color:#222; transform:scale(1.2)">新的段落</p>',
    })
    assert out.payload["applied"] is True
    new_block = next(b for b in out.doc.blocks if b.id == bid)
    assert "新的段落" in new_block.html
    assert "transform" not in new_block.html  # T1 修补后的版本被应用
    v = [x for x in out.payload["violations"] if x["rule"] == "style-property-dropped"]
    assert v and v[0]["fix_hint"]
    # 纯函数:入参 doc 不被改动
    assert _snapshot(doc) == before


def test_replace_block_unsalvageable_keeps_original(doc):
    bid = doc.blocks[1].id
    original = doc.blocks[1].html
    out = run_tool("replace_block", doc, {
        "block_id": bid,
        "html": "<script>alert(1)</script>",
    })
    assert out.payload["applied"] is False
    kept = next(b for b in out.doc.blocks if b.id == bid)
    assert kept.html == original


def test_replace_block_unknown_id(doc):
    out = run_tool("replace_block", doc, {"block_id": "bx", "html": "<p>x</p>"})
    assert "error" in out.payload
    assert out.payload["existing_ids"] == [b.id for b in doc.blocks]


# ---------------------------------------------------------------------------
# apply_block_style
# ---------------------------------------------------------------------------


def test_apply_block_style_merges_into_root_style(doc):
    bid = doc.blocks[1].id
    out = run_tool("apply_block_style", doc, {
        "block_ids": [bid], "font_size": "17px", "line_height": "1.9",
        "color": "#444",
    })
    assert out.payload["applied"] is True
    html = next(b for b in out.doc.blocks if b.id == bid).html
    assert "font-size:17px" in html
    assert "line-height:1.9" in html
    assert "color:#444" in html


def test_apply_block_style_overrides_existing_and_is_deterministic(doc):
    bid = doc.blocks[1].id  # 原有 color:#333
    args = {"block_ids": [bid], "color": "#000"}
    a = run_tool("apply_block_style", doc, args)
    b = run_tool("apply_block_style", doc, args)
    html = next(x for x in a.doc.blocks if x.id == bid).html
    assert "color:#000" in html
    assert "#333" not in html
    assert blocks_to_html(a.doc) == blocks_to_html(b.doc)  # 确定性


def test_apply_block_style_multiple_blocks_and_margin(doc):
    ids = [doc.blocks[1].id, doc.blocks[4].id]
    out = run_tool("apply_block_style", doc, {
        "block_ids": ids, "margin_top": "12px", "margin_bottom": "12px",
        "text_align": "justify", "letter_spacing": "1px", "background": "#fffdf8",
    })
    for bid in ids:
        html = next(b for b in out.doc.blocks if b.id == bid).html
        assert "margin-top:12px" in html
        assert "text-align:justify" in html


def test_merge_style_unquoted_style_attr_merges_into_single_style():
    """项5:无引号 style 属性也走合并路径,输出唯一且双引号包裹的 style。"""
    out = _merge_style_into_root("<p style=color:red>正文</p>", [("font-size", "17px")])
    assert out.count("style=") == 1
    assert 'style="' in out
    assert "color:red" in out
    assert "font-size:17px" in out
    assert out.endswith(">正文</p>")


def test_merge_style_unquoted_style_attr_same_property_overrides():
    """项5:无引号 style 的同名属性原位覆盖,不产生重复声明。"""
    out = _merge_style_into_root("<p style=color:red>x</p>", [("color", "#000")])
    assert out.count("style=") == 1
    assert "color:#000" in out
    assert "color:red" not in out


def test_merge_style_quoted_attr_value_containing_style_eq_untouched():
    """项5 边界:引号属性值内部的 style= 不得被误认成 style 属性。"""
    out = _merge_style_into_root('<p title="a style=red">x</p>', [("font-size", "17px")])
    assert 'title="a style=red"' in out
    assert 'style="font-size:17px"' in out
    assert out.endswith(">x</p>")


def test_merge_style_unquoted_style_on_selfclosing_keeps_slash():
    """项5 边界:自闭合标签的 / 不得被吞进无引号 style 值。"""
    out = _merge_style_into_root("<img style=color:red/>", [("font-size", "17px")])
    assert "color:red/" not in out
    assert "color:red" in out
    assert "font-size:17px" in out
    assert out.rstrip().endswith("/>")


def test_apply_block_style_unknown_id(doc):
    out = run_tool("apply_block_style", doc, {"block_ids": ["nope"], "color": "#000"})
    assert "error" in out.payload
    assert out.payload["existing_ids"] == [b.id for b in doc.blocks]


# ---------------------------------------------------------------------------
# set_design_tokens
# ---------------------------------------------------------------------------


def test_set_design_tokens_stores_and_applies_base_typography(doc):
    before = _snapshot(doc)
    out = run_tool("set_design_tokens", doc, {
        "primary_color": "#b45309", "text_color": "#3d3a34",
        "body_font_size": "16px", "line_height": "1.85",
        "paragraph_spacing": "18px",
    })
    assert out.payload["applied"] is True
    assert out.payload["tokens"]["primary_color"] == "#b45309"
    assert out.doc.design_tokens["line_height"] == "1.85"
    # 基础排版确定性应用到 text 块根元素
    text_blocks = [b for b in out.doc.blocks if b.kind == "text"]
    assert text_blocks
    for b in text_blocks:
        assert "color:#3d3a34" in b.html
        assert "line-height:1.85" in b.html
    # 非 text 块(image/divider)不动
    img = next(b for b in out.doc.blocks if b.kind == "image")
    orig_img = next(b for b in doc.blocks if b.kind == "image")
    assert img.html == orig_img.html
    assert _snapshot(doc) == before  # 纯函数


def test_set_design_tokens_merges_with_existing(doc):
    a = run_tool("set_design_tokens", doc, {"primary_color": "#b45309"})
    b = run_tool("set_design_tokens", a.doc, {"line_height": "2.0"})
    assert b.doc.design_tokens["primary_color"] == "#b45309"
    assert b.doc.design_tokens["line_height"] == "2.0"
    assert b.payload["tokens"]["primary_color"] == "#b45309"


# ---------------------------------------------------------------------------
# edit_structure
# ---------------------------------------------------------------------------


def test_edit_structure_insert_after(doc):
    anchor = doc.blocks[0].id
    out = run_tool("edit_structure", doc, {
        "op": "insert_after", "block_id": anchor,
        "html": '<p style="color:#333">插入的新段</p>',
    })
    assert out.payload["applied"] is True
    new_id = out.payload["new_block_id"]
    ids = [b.id for b in out.doc.blocks]
    assert ids.index(new_id) == ids.index(anchor) + 1
    assert new_id not in [b.id for b in doc.blocks]  # 不撞既有 id
    assert "插入的新段" in next(b for b in out.doc.blocks if b.id == new_id).html


def test_edit_structure_insert_at_start(doc):
    out = run_tool("edit_structure", doc, {
        "op": "insert_after", "block_id": "start", "html": "<p>导语</p>",
    })
    assert out.doc.blocks[0].id == out.payload["new_block_id"]


def test_edit_structure_delete(doc):
    bid = doc.blocks[3].id  # blocks[3] = <hr> 分隔块(非媒体),删除放行
    out = run_tool("edit_structure", doc, {"op": "delete", "block_id": bid})
    assert out.payload["applied"] is True
    assert bid not in [b.id for b in out.doc.blocks]
    assert len(out.doc.blocks) == len(doc.blocks) - 1


# ---------------------------------------------------------------------------
# 媒体守恒硬闸(H1 根治,2026-07-05 NAS 真 DeepSeek QA:换调子会删装饰 SVG)。
# 任何写工具若让全文 <svg>/<img> 总数减少,一律拒绝并回原 doc + fix_hint,
# 让模型换个不丢图的改法。覆盖两种删除矢量:edit_structure delete 掉媒体块、
# replace_block 重写含图块时丢掉内嵌 <svg>/<img>。
# ---------------------------------------------------------------------------
_SVG_ARTICLE = (
    '<section>'
    '<section style="padding:8px">配图一 '
    '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>'
    "</section>"
    '<p style="color:#333">这是一段正文。</p>'
    "</section>"
)


def test_delete_media_block_is_rejected(doc):
    img = next(b for b in doc.blocks if b.kind == "image")
    before = blocks_to_html(doc)
    out = run_tool("edit_structure", doc, {"op": "delete", "block_id": img.id})
    assert "error" in out.payload
    assert "fix_hint" in out.payload
    assert out.doc is doc  # 原 doc 一字不动
    assert blocks_to_html(out.doc) == before  # 图片仍在


def test_replace_block_dropping_embedded_svg_is_rejected():
    d = html_to_blocks(_SVG_ARTICLE)
    svg_block = next(b for b in d.blocks if "<svg" in b.html.lower())
    before = blocks_to_html(d)
    out = run_tool("replace_block", d, {
        "block_id": svg_block.id,
        "html": '<section style="padding:8px">只剩文字,把配图删了</section>',
    })
    assert "error" in out.payload
    assert "fix_hint" in out.payload
    assert out.doc is d  # 拒绝,内嵌 svg 原样保留
    assert blocks_to_html(out.doc) == before


def test_replace_block_keeping_embedded_svg_is_allowed():
    d = html_to_blocks(_SVG_ARTICLE)
    svg_block = next(b for b in d.blocks if "<svg" in b.html.lower())
    out = run_tool("replace_block", d, {
        "block_id": svg_block.id,
        "html": ('<section style="padding:14px">换个说法的配图 '
                 '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>'
                 "</section>"),
    })
    assert out.payload.get("applied") is True  # svg 仍在 → 放行
    assert "<svg" in blocks_to_html(out.doc).lower()


def test_delete_non_media_block_still_allowed(doc):
    text = next(b for b in doc.blocks if b.kind == "text")
    out = run_tool("edit_structure", doc, {"op": "delete", "block_id": text.id})
    assert out.payload.get("applied") is True  # 删文本块不减少媒体 → 放行
    assert text.id not in [b.id for b in out.doc.blocks]


def test_edit_structure_move(doc):
    bid = doc.blocks[4].id
    target = doc.blocks[0].id
    out = run_tool("edit_structure", doc, {
        "op": "move", "block_id": bid, "target_id": target,
    })
    ids = [b.id for b in out.doc.blocks]
    assert ids.index(bid) == ids.index(target) + 1


def test_edit_structure_move_to_start(doc):
    bid = doc.blocks[2].id
    out = run_tool("edit_structure", doc, {
        "op": "move", "block_id": bid, "target_id": "start",
    })
    assert out.doc.blocks[0].id == bid


def test_edit_structure_errors(doc):
    assert "error" in run_tool(
        "edit_structure", doc, {"op": "explode", "block_id": "b1"}
    ).payload
    assert "error" in run_tool(
        "edit_structure", doc, {"op": "delete", "block_id": "b999"}
    ).payload
    # insert_after 缺 html
    assert "error" in run_tool(
        "edit_structure", doc, {"op": "insert_after", "block_id": "b1"}
    ).payload
    # move 缺 target_id
    assert "error" in run_tool(
        "edit_structure", doc, {"op": "move", "block_id": "b1"}
    ).payload


def test_edit_structure_insert_sanitizes(doc):
    out = run_tool("edit_structure", doc, {
        "op": "insert_after", "block_id": "start",
        "html": '<div style="color:red" onclick="x()">t</div>',
    })
    html = out.doc.blocks[0].html
    assert "onclick" not in html
    assert html.startswith("<section")  # div -> section(api-storage-safe 档)
    assert isinstance(out.payload["repairs"], list)


# ---------------------------------------------------------------------------
# list_capabilities
# ---------------------------------------------------------------------------


def test_list_capabilities_all_topics(doc):
    out = run_tool("list_capabilities", doc, {})
    p = out.payload
    assert set(p["topics"]) == {
        "svg_animation", "style_properties", "forbidden", "structure",
    }
    # svg 白名单来自 svg_validator
    from app.services.svg_validator import WHITELIST_ATTRIBUTES

    assert set(p["svg_animation"]["attribute_whitelist"]) == set(WHITELIST_ATTRIBUTES)
    assert "font-size" in p["style_properties"]["allowed_properties"]
    assert any("id" in item for item in p["forbidden"]["rules"])


def test_list_capabilities_single_topic(doc):
    out = run_tool("list_capabilities", doc, {"topic": "style_properties"})
    assert "allowed_properties" in out.payload
    bad = run_tool("list_capabilities", doc, {"topic": "quantum"})
    assert "error" in bad.payload
    assert "topics" in bad.payload


# --- 批4 minor 清账:批量写工具 payload 带 skipped_block_ids ----------------------
class TestSkippedBlockIds:
    def test_apply_block_style_reports_skipped_unsalvageable_block(self):
        doc = html_to_blocks(
            "<section><p>正常段</p><iframe src=\"https://x\"></iframe></section>"
        )
        out = run_tool("apply_block_style", doc, {
            "block_ids": ["b1", "b2"], "font_size": 17,
        })
        assert out.payload["applied"] is True
        assert out.payload["skipped_block_ids"] == ["b2"]
        # 被跳过的块原样保留
        assert out.doc.blocks[1].html == doc.blocks[1].html

    def test_apply_block_style_skipped_empty_when_all_applied(self):
        doc = html_to_blocks("<section><p>甲</p><p>乙</p></section>")
        out = run_tool("apply_block_style", doc, {"block_ids": ["b1"], "color": "#333333"})
        assert out.payload["skipped_block_ids"] == []

    def test_set_design_tokens_payload_has_skipped_block_ids(self):
        doc = html_to_blocks("<section><p>甲</p></section>")
        out = run_tool("set_design_tokens", doc, {"body_font_size": 16})
        assert out.payload["applied"] is True
        assert out.payload["skipped_block_ids"] == []


# ── set_design_tokens(background_color) 接上壳背景改写(2026-07-07)──────────
def test_set_background_injects_on_shell_open():
    doc = html_to_blocks('<section style="padding:18px 0 4px;"><p>正文</p></section>')
    out = run_tool("set_design_tokens", doc, {"background_color": "#e8f0ff"})
    assert out.payload["applied"] is True
    html = blocks_to_html(out.doc)
    assert "background-color:#e8f0ff" in out.doc.shell_open
    assert html.startswith('<section style="padding:18px 0 4px; background-color:#e8f0ff">')
    assert "<p>正文</p>" in html


def test_set_background_replaces_existing_shell_background():
    doc = html_to_blocks('<section style="background-color:#faf6eb;padding:10px;"><p>x</p></section>')
    out = run_tool("set_design_tokens", doc, {"background_color": "#0f1117"})
    assert out.doc.shell_open.count("background-color") == 1
    assert "background-color:#0f1117" in out.doc.shell_open
    assert "#faf6eb" not in out.doc.shell_open


def test_set_background_wraps_when_no_shell():
    doc = html_to_blocks('<p>甲</p><p>乙</p>')  # 多顶层元素 -> 无信封壳
    assert doc.shell_open == ""
    out = run_tool("set_design_tokens", doc, {"background_color": "#222244"})
    html = blocks_to_html(out.doc)
    assert html == '<section style="background-color:#222244;"><p>甲</p><p>乙</p></section>'


def test_set_background_roundtrip_byte_equal():
    doc = html_to_blocks('<section style="padding:8px;"><p>甲</p><p>乙</p></section>')
    out = run_tool("set_design_tokens", doc, {"background_color": "transparent"})
    html = blocks_to_html(out.doc)
    assert blocks_to_html(html_to_blocks(html)) == html


def test_set_background_preserves_media_count():
    doc = html_to_blocks(
        '<section style="padding:8px;">'
        '<svg xmlns="http://www.w3.org/2000/svg"></svg><img src="a.png"></section>'
    )
    out = run_tool("set_design_tokens", doc, {"background_color": "#123456"})
    html = blocks_to_html(out.doc)
    assert html.count("<svg") == 1 and html.count("<img") == 1


def test_set_tokens_without_background_leaves_shell_untouched():
    doc = html_to_blocks('<section style="padding:8px;"><p>x</p></section>')
    out = run_tool("set_design_tokens", doc, {"text_color": "#333333"})
    assert out.doc.shell_open == '<section style="padding:8px;">'
