"""Tests for the P1-1 interactive effect registry."""
import pytest

from app.services.effect_registry import (
    CATEGORIES,
    EFFECTS,
    list_effects,
    render_effect,
)


# 1. Default-slot render of every effect passes validate_html.
@pytest.mark.parametrize("eid", list(EFFECTS.keys()))
def test_default_render_passes_validator(eid):
    r = render_effect(eid)
    assert r["status"] == "ok", r["report"]
    assert r["html"]
    assert r["report"]["issues"] == []


# 2. list_effects shape.
def test_list_effects_shape():
    effects = list_effects()
    assert len(effects) == 8
    ids = [e["id"] for e in effects]
    assert len(set(ids)) == 8
    for e in effects:
        assert e["category"] in CATEGORIES
        assert e["category"] in ("expand", "carousel", "slide", "longpress", "quiz", "flip")
        assert e["id"] and e["title"] and e["description"]
        for ts in e["textSlots"]:
            assert {"name", "label", "default", "maxLength"} <= ts.keys()
        for ims in e["imageSlots"]:
            assert {"name", "label", "default"} <= ims.keys()
        for cs in e["colorSlots"]:
            assert {"name", "label", "default"} <= cs.keys()
        for tp in e["timingParams"]:
            assert {"name", "label", "unit", "default", "min", "max", "step"} <= tp.keys()


def test_all_six_categories_present():
    cats = {e["category"] for e in list_effects()}
    assert cats == set(CATEGORIES)


# 3. Injection safety.
def test_text_slot_escapes_xml():
    r = render_effect("mask-reveal", text_slots={"SLOT_QUESTION_TEXT": '<script>x</script>&"'})
    assert "<script>" not in r["html"]
    assert "&lt;script&gt;" in r["html"]
    assert r["report"]["issues"] == []
    assert r["status"] == "ok"


def test_color_slot_rejects_injection():
    r = render_effect("scroll-carousel", color_slots={"SLOT_BG_COLOR_1": '"/><script>evil</script>'})
    assert "<script>" not in r["html"]
    assert r["status"] == "ok"


def test_image_slot_rejects_non_https():
    r = render_effect("smil-carousel", image_slots={"SLOT_IMG_1": "javascript:alert(1)"})
    assert "javascript:" not in r["html"]
    assert r["status"] == "ok"


def test_image_slot_rejects_http():
    r = render_effect("smil-carousel", image_slots={"SLOT_IMG_1": "http://evil.example/a.png"})
    assert "http://evil.example" not in r["html"]
    assert r["status"] == "ok"


def test_image_slot_accepts_https():
    r = render_effect("smil-carousel", image_slots={"SLOT_IMG_1": "https://mmbiz.qpic.cn/a.png"})
    assert "https://mmbiz.qpic.cn/a.png" in r["html"]
    assert r["status"] == "ok"


def test_empty_image_strips_image_tag():
    # Default image slots are empty -> no <image> element should survive.
    r = render_effect("smil-carousel")
    assert "<image" not in r["html"]
    assert r["status"] == "ok"


# 3b. Cross-category double-substitution must not occur: a text-slot value that
# happens to equal another slot's literal token name stays verbatim in the
# output and is NOT reinterpreted by a later color/timing pass.
def test_text_slot_value_equal_to_color_token_not_resubstituted():
    r = render_effect("scroll-carousel", text_slots={"SLOT_CAPTION_1": "SLOT_BG_COLOR_2"})
    assert r["status"] == "ok"
    # The real bg color appears exactly once (its own <rect fill=...>), not
    # twice (would mean the caption text got color-substituted too).
    assert r["html"].count("#16213E") == 1
    # The caption shows the literal token text the user typed.
    assert "SLOT_BG_COLOR_2" in r["html"]


def test_text_slot_value_equal_to_timing_token_not_resubstituted():
    r = render_effect(
        "smil-carousel",
        text_slots={"SLOT_TEXT_1": "__VIEWBOX_H__"},
        timing_params={"viewboxH": 700},
    )
    assert r["status"] == "ok"
    # Caption keeps the literal token; only the real viewBox/rect dims use 700.
    assert "__VIEWBOX_H__" in r["html"]


def test_no_sentinel_leakage():
    r = render_effect("scroll-carousel", text_slots={"SLOT_CAPTION_1": "hi"})
    assert "\x00" not in r["html"]


# 3c. longpress-ring must not rely on WeChat-unsupported mouse* events.
def test_longpress_ring_uses_supported_events_only():
    r = render_effect("longpress-ring")
    assert r["status"] == "ok"
    assert "mousedown" not in r["html"]
    assert "mouseup" not in r["html"]
    assert "touchstart" in r["html"]


# 3d. smil-carousel: each frame carries a bare self-trigger click hide so frames
# advance exclusively. 微信剥 id 后纯自触发 begin="click"（target=该 frame 整组）
# 仍生效, 不再依赖 begin="frameN.click" 跨元素引用。
def test_smil_carousel_frames_self_hide_on_click():
    r = render_effect("smil-carousel")
    assert r["status"] == "ok"
    # 两帧各一条裸自触发 click 隐藏（frame1 入场 fade 用 begin="0s" 不计入）。
    assert r["html"].count('begin="click"') >= 2
    # 不得残留任何 id 跨元素引用形式。
    assert 'begin="frame1.click"' not in r["html"]
    assert 'begin="frame2.click"' not in r["html"]
    assert "nextbtn.click+0.5" not in r["html"]
    assert "nextbtn.click+0.001" not in r["html"]


# 4. Timing clamp.
def test_timing_clamped_high():
    r = render_effect("flip-card", timing_params={"dur": 999})
    assert r["status"] == "ok"
    assert "999" not in r["html"]
    assert 'dur="0.5s"' in r["html"]


def test_timing_clamped_low():
    r = render_effect("flip-card", timing_params={"dur": 0})
    assert r["status"] == "ok"
    assert 'dur="0.1s"' in r["html"]


def test_timing_non_numeric_uses_default():
    r = render_effect("smil-carousel", timing_params={"dur": "not-a-number"})
    assert r["status"] == "ok"
    assert 'dur="0.45s"' in r["html"]


def test_integer_timing_no_trailing_dot_zero():
    # viewboxH default 420 should render as integer, not "420.0".
    r = render_effect("smil-carousel")
    assert "420.0" not in r["html"]
    assert "0 0 750 420" in r["html"]


# 5. Unknown id.
def test_unknown_effect_id():
    r = render_effect("does-not-exist")
    assert r["status"] == "error"
    assert r["html"] == ""
    assert "does-not-exist" in r["message"]
    assert r["report"] is None


# 6. Unknown slot names are ignored.
def test_unknown_slot_ignored():
    r = render_effect("mask-reveal", text_slots={"NOT_A_SLOT": "x"})
    assert r["status"] == "ok"


def test_text_truncated_to_max_length():
    long = "あ" * 100
    r = render_effect("mask-reveal", text_slots={"SLOT_ANSWER_MAIN": long})
    # SLOT_ANSWER_MAIN maxLength is 20.
    assert r["html"].count("あ") == 20


# 7. HTTP endpoints.
def test_get_effects_endpoint(client):
    resp = client.get("/api/v1/agent/effects")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert len(body["data"]["effects"]) == 8


def test_render_endpoint(client):
    resp = client.post(
        "/api/v1/agent/effects/mask-reveal/render",
        json={"textSlots": {"SLOT_ANSWER_MAIN": "42"}},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "ok"
    assert "42" in data["html"]


def test_render_endpoint_unknown_id():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    resp = c.post("/api/v1/agent/effects/nope/render", json={})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "error"
    assert data["html"] == ""


def test_tab_panel_degraded_to_self_trigger_cover_reveal():
    """tab-panel 微信真机受限, 降级为覆盖揭示式手风琴。

    三面板互斥切换 = 真跨元素控制（点 A 强制隐 B/C）, 微信 add_draft 回读剥 id 后
    begin="tabNbtn.click" 跨元素引用悬空 → 真机无反应。已诚实判定受限并降级:
    每个板块内容常驻、上盖标题板, 点标题板 begin="click" 让盖板自身淡出露出内容
    （纯自触发, target=盖板组自己）。各板块独立展开, 不互斥。

    回归保护: 不得回退到任何 begin="tabNbtn.click" 跨元素引用（剥 id 后必失效）。
    """
    r = render_effect("tab-panel")
    assert r["status"] == "ok", r["report"]
    html = r["html"]
    # 不得残留任何 tabNbtn 跨元素 click 引用。
    for btn in ("tab1btn", "tab2btn", "tab3btn"):
        assert f"{btn}.click" not in html, f"不应再有 {btn}.click 跨元素引用"
    # 每个盖板用裸自触发 begin="click" 淡出（三个盖板 → 至少 3 条）。
    assert html.count('begin="click"') >= 3
    # 三块内容板与三块盖板都在。
    for gid in ("panel1", "panel2", "panel3", "cover1", "cover2", "cover3"):
        assert f'<g id="{gid}">' in html, f"缺少 <g id=\"{gid}\">"


# 3e. 改造后的自触发效果: SVG 的 begin/end 不得含任何 id 跨元素事件引用,
# 只允许裸 click / touchstart 或时间偏移; 且模拟微信剥 id 后无新增悬空引用。
import re as _re

# 复用 svg_validator._REF_SMIL_SYNC_RE 同形: begin/end="...<token>.<event>"
# 引号部分用 ["'] 同时覆盖双/单引号, 与 _REF_SMIL_SYNC_RE 对齐, 避免单引号
# begin='frame1.click' 漏报。
_CROSS_REF_RE = _re.compile(
    r'(?:begin|end)\s*=\s*[\'"][^\'"]*?'
    r'[A-Za-z_][\w:.-]*\.(?:click|begin|end|'
    r'mousedown|mouseup|mouseover|mouseout|'
    r'touchstart|touchend|focus|blur|activate|repeat)\b'
)
_HASH_REF_RE = _re.compile(
    r'url\(\s*#|(?:xlink:)?href\s*=\s*[\'"]\s*#|<use\b|<mpath\b'
)

_SELF_TRIGGER_EFFECTS = [
    "smil-carousel",
    "mask-reveal",
    "flip-card",
    "longpress-ring",
    "tab-panel",
    "multi-choice",
]


@pytest.mark.parametrize("eid", _SELF_TRIGGER_EFFECTS)
def test_self_trigger_effect_renders_ok(eid):
    assert render_effect(eid)["status"] == "ok"


@pytest.mark.parametrize("eid", _SELF_TRIGGER_EFFECTS)
def test_self_trigger_effect_has_no_cross_element_ref(eid):
    html = render_effect(eid)["html"]
    m = _CROSS_REF_RE.search(html)
    assert m is None, f"{eid} 残留 id 跨元素引用: {m.group(0) if m else ''}"
    assert _HASH_REF_RE.search(html) is None, f"{eid} 含 url(#/href=#/use/mpath"


@pytest.mark.parametrize("eid", _SELF_TRIGGER_EFFECTS)
def test_self_trigger_effect_survives_wechat_id_stripping(eid):
    """模拟微信 add_draft 剥光所有 id= 后, begin/end 仍无 <token>.event 悬空引用。"""
    html = render_effect(eid)["html"]
    stripped = _re.sub(r'\s+id="[^"]*"', "", html)
    m = _CROSS_REF_RE.search(stripped)
    assert m is None, f"{eid} 剥 id 后出现悬空跨元素引用: {m.group(0) if m else ''}"
    assert _HASH_REF_RE.search(stripped) is None


def test_longpress_ring_reveal_not_trapped_under_pressbtn_cover():
    """longpress-ring: reveal animate 的 SMIL 目标必须能收到按压事件。

    旧实现把 reveal 内容连同其 fade-in <animate> 放进一个 opacity=0 的 <g>,
    而按压落在该组的【兄弟】环形 circle 上 —— 事件冒泡到公共父节点即止, 永远
    抵达不了 sibling reveal, 且 opacity=0 默认 visiblePainted 不可命中, reveal
    永不触发。修复后改为覆盖揭示: reveal 内容常驻可见在底层(不再 opacity=0),
    上层 g#pressbtn 盖板用同元素自触发(target=pressbtn 自身)淡出露出 reveal。

    回归保护:
      - reveal 组不得再是 opacity=0 的"陷阱组"(否则永不可见);
      - pressbtn 盖板必须携带 from=1 to=0 的淡出 animate(揭示机制);
      - 仍为纯自触发, 无 id 跨元素引用(由 test_self_trigger_* 另行守护)。
    """
    h = render_effect("longpress-ring")["html"]
    # reveal 组不再被 opacity=0 困住。
    assert 'id="reveal" opacity="0"' not in h
    assert 'id="reveal"' in h
    # pressbtn 盖板淡出: 揭示靠盖板自身 1->0 淡出, 而非 reveal 0->1。
    assert 'from="1" to="0"' in h
    # reveal 的内容文本仍在(常驻底层)。
    assert "揭晓标题" in h


def test_multi_choice_option_text_lets_clicks_fall_through_to_rect():
    """multi-choice: 选项 <text> 必须 pointer-events=none, 否则文字区是死区。

    <set begin="click"> 挂在 rect 上(target=rect)。<text> 标签是 rect 的兄弟
    且 z-order 更高, 直接盖在 rect 上方。若 text 默认可命中, 点击文字时事件
    target=text、冒泡绕过 rect, set 收不到 click。给每个选项 text 加
    pointer-events="none" 让点击穿透到下层 rect, 整条选项任意位置都能触发高亮。
    """
    h = render_effect("multi-choice")["html"]
    # 四个选项的 <text> 各一个 pointer-events="none"。
    assert h.count('pointer-events="none"') == 4


@pytest.mark.parametrize("eid", list(EFFECTS.keys()))
def test_no_id_stripped_dangling_ref_warning(eid):
    """全部 8 效果均不得触发 validator 的 id-stripped-dangling-ref 告警。"""
    from app.services.svg_validator import validate_html

    r = render_effect(eid)
    assert r["status"] == "ok"
    report = validate_html(r["html"])
    rules = {w["rule"] for w in report["warnings"]}
    assert "id-stripped-dangling-ref" not in rules, report["warnings"]
