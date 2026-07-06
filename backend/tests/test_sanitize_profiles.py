"""批3:sanitize 三档 profile(paste-safe / api-storage-safe / render-verified)。

红线:paste-safe 输出与既有 sanitize_for_wechat 逐字节相等(既有调用方零改)。
宽档放宽项逐条以真值表(docs/research/wechat-svg-truth-table.md)实测为据。
"""
import pytest

from app.services.sanitize_profiles import (
    API_STORAGE_SAFE,
    PASTE_SAFE,
    RENDER_VERIFIED,
    SANITIZE_PROFILES,
    get_sanitize_profile,
    sanitize_html,
)
from app.services.wechat_sanitize import sanitize_for_wechat


# ---------------------------------------------------------------------------
# A. paste-safe 逐字节等价现行为(红线)
# ---------------------------------------------------------------------------

_NASTY_FIXTURES = [
    # 现行口径的代表性输入(取自 test_wechat_safe_sanitizer 的场景族)
    '<div class="x" id="y" data-k="v" style="color:#333; transform:scale(1.1)">hi</div>',
    '<section style="opacity:0; font-size:15px">fade</section>',
    '<p style="position:absolute; top:0; color:red">abs</p>',
    '<article style="background:#fff"><header>h</header><p>body</p></article>',
    '<style>.a{color:red}</style><script>alert(1)</script><p onclick="x()">t</p>',
    '<a href="https://e.com" style="display:inline-block; background:#07c; padding:8px 20px; border-radius:6px; color:#fff">按钮</a>',
    '<table><tr><td style="width:30px">01</td><td>text</td></tr></table>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect id="keep" style="opacity:0; fill:#f00"/>'
    '<animate attributeName="opacity" from="0" to="1" dur="1s"/></svg>',
    '<pre style="background:#000; color:#0f0">code &lt;x&gt;\nline2</pre>',
    '<section style="border:0.5px solid #eee; background:#f5f5f5">thin</section>',
    '<div style="display:flex; gap:8px"><span>a</span><span>b</span></div>',
    '',
    'plain text only',
]


@pytest.mark.parametrize("html", _NASTY_FIXTURES)
def test_paste_safe_byte_identical_to_sanitize_for_wechat(html):
    """paste-safe 档输出必须与现行 sanitize_for_wechat 逐字节相等。"""
    clean, _report = sanitize_html(html, "paste-safe")
    assert clean == sanitize_for_wechat(html)


def test_default_profile_is_paste_safe():
    clean, _ = sanitize_html('<div style="color:red">x</div>')
    assert clean == sanitize_for_wechat('<div style="color:red">x</div>')


# ---------------------------------------------------------------------------
# B. api-storage-safe 放宽项逐条有据(真值表行号见实现注释)
# ---------------------------------------------------------------------------


def test_api_storage_keeps_opacity_zero():
    """真值表 61-62 行:style 内 opacity:0 起手态在 API 存储层保留。"""
    html = '<section style="opacity:0; color:#333">fade-in</section>'
    clean, _ = sanitize_html(html, "api-storage-safe")
    assert "opacity:0" in clean
    # 对照:paste-safe 仍改写为 opacity:1(粘贴口径既有行为)
    paste_clean, _ = sanitize_html(html, "paste-safe")
    assert "opacity:1" in paste_clean


def test_api_storage_keeps_pointer_events():
    """真值表 39-40 行:style 内 pointer-events:none 在 API 存储层保留。"""
    html = '<section style="pointer-events:none; color:#333">x</section>'
    clean, _ = sanitize_html(html, "api-storage-safe")
    assert "pointer-events:none" in clean
    paste_clean, _ = sanitize_html(html, "paste-safe")
    assert "pointer-events" not in paste_clean


def test_api_storage_still_strips_transform():
    """transform 渲染层存疑(调研 §1.2 社区一致称渲染层失效)——宁紧勿松不放。"""
    html = '<section style="transform:translate(10px,0); color:#333">x</section>'
    clean, _ = sanitize_html(html, "api-storage-safe")
    assert "transform" not in clean


def test_api_storage_still_hides_absolute():
    """position:absolute 存储层存活(真值表 74)但渲染层多方一致失效——不放。"""
    html = '<p style="position:absolute; color:red">abs</p>'
    clean, _ = sanitize_html(html, "api-storage-safe")
    assert "position:absolute" not in clean


def test_api_storage_security_floor_unchanged():
    html = '<script>alert(1)</script><p onclick="x()">t</p>'
    clean, _ = sanitize_html(html, "api-storage-safe")
    assert "<script" not in clean
    assert "onclick" not in clean


def test_render_verified_is_alias_of_api_storage():
    """render-verified 本刀 == api-storage-safe 占位,待 P1 真机核验后分化。"""
    assert RENDER_VERIFIED.render_profile is API_STORAGE_SAFE.render_profile
    html = '<section style="opacity:0; pointer-events:none">x</section>'
    a, _ = sanitize_html(html, "api-storage-safe")
    b, _ = sanitize_html(html, "render-verified")
    assert a == b


def test_get_sanitize_profile_fallback():
    assert get_sanitize_profile("nope").name == "paste-safe"
    assert get_sanitize_profile("").name == "paste-safe"
    assert set(SANITIZE_PROFILES) == {
        "paste-safe", "api-storage-safe", "render-verified",
    }


# ---------------------------------------------------------------------------
# C. SanitizeReport:剥掉且记账
# ---------------------------------------------------------------------------


def test_report_structure():
    _, report = sanitize_html('<div style="color:red">x</div>')
    assert set(report) == {"repairs", "violations"}
    for r in report["repairs"]:
        assert set(r) == {"rule", "detail"}
    for v in report["violations"]:
        assert set(v) == {"rule", "detail", "fix_hint"}


def test_report_div_rename_is_repair():
    _, report = sanitize_html('<div style="color:red">x</div>')
    rules = {r["rule"] for r in report["repairs"]}
    assert "div-to-section" in rules


def test_report_dropped_style_property_is_violation_with_fix_hint():
    _, report = sanitize_html(
        '<section style="transform:scale(1.1); color:red">x</section>'
    )
    v = [x for x in report["violations"] if x["rule"] == "style-property-dropped"]
    assert v, report
    assert "transform" in v[0]["detail"]
    # fix_hint 必须是可执行中文指令
    assert v[0]["fix_hint"]
    assert any("一" <= ch <= "鿿" for ch in v[0]["fix_hint"])


def test_report_script_removed_is_violation():
    _, report = sanitize_html("<script>alert(1)</script><p>x</p>")
    rules = {v["rule"] for v in report["violations"]}
    assert "script-removed" in rules


def test_report_style_block_removed_is_violation():
    _, report = sanitize_html("<style>.a{color:red}</style><p>x</p>")
    rules = {v["rule"] for v in report["violations"]}
    assert "style-block-removed" in rules


def test_report_opacity_rewrite_only_on_paste_safe():
    html = '<section style="opacity:0">x</section>'
    _, paste_report = sanitize_html(html, "paste-safe")
    _, api_report = sanitize_html(html, "api-storage-safe")
    assert "opacity-zero-rewrite" in {r["rule"] for r in paste_report["repairs"]}
    assert "opacity-zero-rewrite" not in {r["rule"] for r in api_report["repairs"]}


def test_report_position_absolute_hidden_is_violation():
    _, report = sanitize_html('<p style="position:absolute">x</p>')
    v = [x for x in report["violations"] if x["rule"] == "position-hidden"]
    assert v and v[0]["fix_hint"]


def test_report_ignores_svg_subtree():
    """SVG 子树受管线保护原样通过——report 不得对 SVG 内样式误记账。"""
    html = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<rect style="transform:rotate(3deg); fill:#f00"/></svg><p>x</p>'
    )
    _, report = sanitize_html(html)
    assert not any(
        "transform" in v["detail"] for v in report["violations"]
    ), report


def test_clean_report_on_safe_html():
    _, report = sanitize_html('<section style="color:#333; font-size:15px">好文</section>')
    assert report["violations"] == []


# ---------------------------------------------------------------------------
# D. svg_validator 两处修复(调研 §1.3)
# ---------------------------------------------------------------------------


def test_svg_validator_allows_stroke_linecap():
    """§1.3:WHITELIST_ATTRIBUTES 补 stroke-linecap(T/CASME 1609—2024 白名单内)。"""
    from app.services.svg_validator import validate_html

    html = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<line stroke="#000"><animate attributeName="stroke-linecap" '
        'values="butt;round" dur="1s"/></line></svg>'
    )
    report = validate_html(html)
    assert not [
        i for i in report["issues"] if i["rule"] == "attribute-whitelist"
    ], report["issues"]


def test_svg_validator_flags_inline_css_animation():
    """§1.3:FORBIDDEN_CSS_PROPERTIES 补 animation(内联 CSS 动画漏检)。"""
    from app.services.svg_validator import validate_html

    html = '<section style="animation:spin 2s linear infinite">x</section>'
    report = validate_html(html)
    assert [
        i for i in report["issues"]
        if i["rule"] == "forbidden-css" and "animation" in i["message"]
    ], report["issues"]


def test_svg_validator_animation_inside_svg_not_flagged():
    """SVG 子树内样式被管线保护,forbidden-css 扫描沿用 masked_no_svg,不误报。"""
    from app.services.svg_validator import validate_html

    html = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<rect style="animation:x 1s"/></svg>'
    )
    report = validate_html(html)
    assert not [
        i for i in report["issues"] if i["rule"] == "forbidden-css"
    ], report["issues"]


# --- 批4 minor 清账:report-only 外链图检测 --------------------------------------
class TestExternalImageReport:
    def test_external_image_flagged_as_violation(self):
        html = '<p><img src="https://example.com/pic.png" style="width:100%"></p>'
        clean, report = sanitize_html(html, "api-storage-safe")
        rules = [v["rule"] for v in report["violations"]]
        assert "external-image" in rules
        vio = next(v for v in report["violations"] if v["rule"] == "external-image")
        assert "mmbiz" in vio["fix_hint"]

    def test_mmbiz_image_not_flagged(self):
        html = '<p><img src="https://mmbiz.qpic.cn/abc/x.png"></p>'
        _clean, report = sanitize_html(html, "api-storage-safe")
        assert all(v["rule"] != "external-image" for v in report["violations"])

    def test_detection_does_not_change_clean_output(self):
        from app.services.sanitize_profiles import API_STORAGE_SAFE
        from app.services.wechat_sanitize import sanitize_with_profile
        html = '<p><img src="https://example.com/pic.png"></p>'
        clean, _report = sanitize_html(html, "api-storage-safe")
        assert clean == sanitize_with_profile(html, API_STORAGE_SAFE.render_profile)
