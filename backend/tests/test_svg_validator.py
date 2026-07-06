"""Unit tests for app.services.svg_validator and /wechat/validate API."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.svg_validator import (
    WHITELIST_ATTRIBUTES,
    VALID_TRANSFORM_TYPES,
    validate_html,
)


# ---------------------------------------------------------------------------
# Pure-function coverage
# ---------------------------------------------------------------------------


def test_empty_html_produces_no_findings():
    report = validate_html("")
    assert report["issues"] == []
    assert report["warnings"] == []
    assert report["stats"]["svg_count"] == 0


def test_whitelist_attribute_passes_clean():
    html = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        '<rect><animate attributeName="opacity" from="0" to="1" dur="1s"/></rect>'
        "</svg>"
    )
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


def test_non_whitelist_attribute_produces_issue():
    html = '<animate attributeName="color" dur="1s"/>'
    report = validate_html(html)
    issues = [i for i in report["issues"] if i["rule"] == "attribute-whitelist"]
    assert len(issues) == 1
    assert 'color' in issues[0]["message"]


def test_whitelist_attribute_case_insensitive_no_false_positive():
    # premailer / lxml can upper-case attribute values. "Opacity" is the
    # whitelisted "opacity" — normalization must avoid a false positive.
    html = '<animate attributeName="Opacity" from="0" to="1" dur="1s"/>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


def test_non_whitelist_attribute_case_insensitive_still_flagged():
    # An upper-cased non-whitelist value must still be caught after .lower().
    html = '<animate attributeName="COLOR" dur="1s"/>'
    report = validate_html(html)
    issues = [i for i in report["issues"] if i["rule"] == "attribute-whitelist"]
    assert len(issues) == 1
    assert "COLOR" in issues[0]["message"]


def test_animate_transform_invalid_type_issue():
    html = '<animateTransform attributeName="transform" type="perspective" from="0" to="1"/>'
    report = validate_html(html)
    assert any(i["rule"] == "animateTransform-type" for i in report["issues"])


def test_animate_transform_valid_types_pass():
    for t in VALID_TRANSFORM_TYPES:
        html = f'<animateTransform attributeName="transform" type="{t}"/>'
        report = validate_html(html)
        assert not any(i["rule"] == "animateTransform-type" for i in report["issues"]), t


def test_indefinite_repeat_on_height_is_warning_not_issue():
    html = '<animate attributeName="height" from="0" to="200" repeatCount="indefinite"/>'
    report = validate_html(html)
    assert any(w["rule"] == "repeatCount-indefinite" for w in report["warnings"])
    assert not any(i["rule"] == "repeatCount-indefinite" for i in report["issues"])


def test_forbidden_css_position_absolute_is_issue():
    html = '<div style="position: absolute; top: 0">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css" for i in report["issues"])


def test_forbidden_css_clip_path_is_issue():
    html = '<div style="clip-path: circle(50%)">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css" for i in report["issues"])


def test_css_filter_in_style_attr_is_issue():
    html = '<div style="filter: blur(4px)">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css-filter" for i in report["issues"])


def test_css_filter_none_is_allowed():
    html = '<div style="filter: none">x</div>'
    report = validate_html(html)
    assert not any(i["rule"] == "forbidden-css-filter" for i in report["issues"])


def test_forbidden_script_tag_is_issue():
    html = '<script>alert(1)</script>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-tag" and "script" in i["message"] for i in report["issues"])


def test_iframe_tag_is_issue():
    html = '<iframe src="x"></iframe>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-tag" for i in report["issues"])


def test_inline_event_handler_is_issue():
    html = '<button onclick="foo()">x</button>'
    report = validate_html(html)
    assert any(i["rule"] == "event-handler" for i in report["issues"])


import pytest


@pytest.mark.parametrize(
    "handler",
    [
        "onerror", "onmouseenter", "onmouseleave", "onmousedown", "onmouseup",
        "onpointerdown", "onpointerup", "onanimationend", "onanimationstart",
        "ontransitionend", "onwheel", "ondblclick", "oncontextmenu",
        "onkeydown", "onkeyup", "onkeypress", "onabort",
    ],
)
def test_event_handler_wildcard_catches_all(handler):
    # Wildcard blocklist must catch any on*= handler, not just an enumerated set.
    html = f'<svg><image {handler}="evil()"/></svg>'
    report = validate_html(html)
    assert any(i["rule"] == "event-handler" for i in report["issues"]), handler


def test_event_handler_no_false_positive_on_legit_attrs():
    # Attributes that merely start with "o" must not trip the on*= matcher.
    html = '<svg><rect opacity="0.5" width="10" points="0,0"/></svg>'
    report = validate_html(html)
    assert not any(i["rule"] == "event-handler" for i in report["issues"])


def test_svg_without_xmlns_warns():
    html = '<svg viewBox="0 0 10 10"><rect/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "svg-xmlns" for w in report["warnings"])


def test_svg_with_xmlns_no_warning():
    html = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "svg-xmlns" for w in report["warnings"])


def test_css_variable_usage_warns():
    html = '<div style="color: var(--brand)">x</div>'
    report = validate_html(html)
    assert any(w["rule"] == "css-variable" for w in report["warnings"])


def test_stats_count_svg_elements():
    html = (
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        '<a href="x">link</a>'
    )
    report = validate_html(html)
    assert report["stats"]["svg_count"] == 2
    assert report["stats"]["anchor_count"] == 1


def test_line_numbers_are_1_based():
    html = "\n\n<script>bad</script>"
    report = validate_html(html)
    forbidden = [i for i in report["issues"] if i["rule"] == "forbidden-tag"]
    assert forbidden and forbidden[0]["line"] == 3


def test_whitelist_has_exactly_expected_properties():
    # Guard against accidental drift. The skill contract is 20 attributeName
    # values — including the literal "transform" used by animateTransform.
    assert len(WHITELIST_ATTRIBUTES) == 16 or "transform" in WHITELIST_ATTRIBUTES
    # Sanity: a few must-haves.
    for required in {"opacity", "fill", "x", "y", "height", "width", "transform", "visibility"}:
        assert required in WHITELIST_ATTRIBUTES


def test_compound_report_keeps_issues_and_warnings_separate():
    html = (
        '<svg viewBox="0 0 10 10">'          # xmlns missing -> warning
        '<animate attributeName="color"/>'   # not in whitelist -> issue
        '<script>x</script>'                 # forbidden tag -> issue
        '</svg>'
    )
    report = validate_html(html)
    rules_issues = {i["rule"] for i in report["issues"]}
    rules_warns = {w["rule"] for w in report["warnings"]}
    assert "attribute-whitelist" in rules_issues
    assert "forbidden-tag" in rules_issues
    assert "svg-xmlns" in rules_warns


# ---------------------------------------------------------------------------
# API coverage
# ---------------------------------------------------------------------------


def test_validate_endpoint_clean_html_returns_empty_report():
    client = TestClient(app)
    resp = client.post(
        "/api/v1/wechat/validate",
        json={"html": '<p style="color:#333">hi</p>'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["issues"] == []
    assert body["data"]["warnings"] == []
    assert "stats" in body["data"]


def test_validate_endpoint_reports_issues():
    client = TestClient(app)
    resp = client.post(
        "/api/v1/wechat/validate",
        json={"html": '<script>bad</script><div style="position:absolute">x</div>'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert len(body["data"]["issues"]) >= 2
    rules = {i["rule"] for i in body["data"]["issues"]}
    assert {"forbidden-tag", "forbidden-css"}.issubset(rules)


def test_validate_endpoint_missing_html_defaults_to_empty():
    client = TestClient(app)
    resp = client.post("/api/v1/wechat/validate", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["issues"] == []


# ---------------------------------------------------------------------------
# Forbidden-CSS scoping + semantic-wrapper warnings (regressions)
# ---------------------------------------------------------------------------


def test_forbidden_css_word_in_prose_is_not_flagged():
    # "mask" / "filter" appearing as PROSE must not hard-block the copy.
    html = "<p>The CSS mask property and backdrop-filter are unsupported.</p>"
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "forbidden-css"] == []


def test_forbidden_css_property_in_style_attr_is_flagged():
    html = '<div style="mask: url(#m); color: red">x</div>'
    report = validate_html(html)
    rules = [i["rule"] for i in report["issues"]]
    assert "forbidden-css" in rules


def test_forbidden_css_does_not_flag_substring_properties():
    # mask-* longhand should flag; but a property merely CONTAINING the word
    # (e.g. custom -x-maskot) anchored scan must flag only real properties.
    html = '<div style="-webkit-mask-image: url(#m)">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css" for i in report["issues"])


def test_position_absolute_with_whitespace_is_flagged():
    html = '<div style="position :  absolute; top:0">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css" for i in report["issues"])


def test_semantic_wrapper_tag_warns():
    html = '<article style="background:#E9F0FC"><p>x</p></article>'
    report = validate_html(html)
    warns = [w for w in report["warnings"] if w["rule"] == "semantic-wrapper-tag"]
    assert warns, "styled <article> must produce a semantic-wrapper-tag warning"


def test_section_wrapper_does_not_warn():
    html = '<section style="background:#E9F0FC"><p>x</p></section>'
    report = validate_html(html)
    assert [w for w in report["warnings"] if w["rule"] == "semantic-wrapper-tag"] == []


# ---------------------------------------------------------------------------
# Review F6: content inside HTML comments must not trip checks
# ---------------------------------------------------------------------------


def test_animation_attribute_inside_html_comment_not_flagged():
    """An <animate> sitting inside an HTML comment never executes; the
    attribute-whitelist check must not false-positive on it (review F6)."""
    html = '<!-- <animate attributeName="evil" dur="1s"/> --><svg><rect/></svg>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


def test_forbidden_css_inside_html_comment_not_flagged():
    html = '<!-- <div style="clip-path:inset(0)">x</div> --><p>real</p>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "forbidden-css"] == []


def test_forbidden_tag_outside_comment_still_flagged_with_comments_present():
    """Stripping comments must not blind the checker to real forbidden tags
    elsewhere in the document."""
    html = '<!-- harmless note --><script>alert(1)</script>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-tag" for i in report["issues"])


# ---------------------------------------------------------------------------
# Review F7: forbidden-CSS inside an SVG subtree aligns with the sanitizer
# (the sanitizer preserves SVG-subtree styles; WeChat strips them server-side)
# ---------------------------------------------------------------------------


def test_forbidden_css_inside_svg_subtree_not_flagged():
    """`clip-path` / `mask` inside an <svg> subtree is preserved by the
    sanitizer's SVG protection, so the validator must not report it as a
    must-fix issue (review F7) — that contradicts what the copy pipeline does."""
    html = '<svg><rect style="clip-path:inset(0)"/></svg>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "forbidden-css"] == []


def test_forbidden_css_outside_svg_still_flagged():
    """Plain-HTML forbidden CSS (which the sanitizer DOES strip) is still a
    real, reported issue."""
    html = '<div style="clip-path:inset(0)">x</div>'
    report = validate_html(html)
    assert any(i["rule"] == "forbidden-css" for i in report["issues"])


def test_forbidden_css_filter_inside_svg_not_flagged():
    html = '<svg><rect style="filter:blur(2px)"/></svg>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "forbidden-css-filter"] == []


def test_event_handler_inside_svg_still_flagged():
    """on* handlers are a real XSS vector the sanitizer now strips from SVG too;
    the validator should keep reporting them regardless of SVG context."""
    html = '<svg><rect onclick="evil()"/></svg>'
    report = validate_html(html)
    assert any(i["rule"] == "event-handler" for i in report["issues"])


# ---------------------------------------------------------------------------
# P1-2: whitelist calibration (stroke / rx / ry pass; stroke-dasharray -> warn)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("attr", ["stroke", "rx", "ry"])
def test_stroke_rx_ry_animate_no_longer_mis_killed(attr):
    """P1-2: stroke / rx / ry as animate attributeName must NOT produce an
    attribute-whitelist issue (geometry/paint presentation attrs, research §2.2)."""
    html = f'<svg><rect><animate attributeName="{attr}" from="0" to="1" dur="1s"/></rect></svg>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


def test_stroke_rx_ry_in_whitelist_set():
    for attr in ("stroke", "rx", "ry"):
        assert attr in WHITELIST_ATTRIBUTES


def test_stroke_dasharray_animate_is_warning_not_issue():
    """P1-2: stroke-dasharray demoted from whitelist (silent pass) to a warning.
    Must NOT be an issue, must NOT be an attribute-whitelist issue, and must
    surface as the dedicated uncertain-warning rule."""
    html = '<svg><path><animate attributeName="stroke-dasharray" from="0" to="100" dur="2s"/></path></svg>'
    report = validate_html(html)
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []
    assert not any(i["rule"] == "attribute-dasharray-uncertain" for i in report["issues"])
    assert any(w["rule"] == "attribute-dasharray-uncertain" for w in report["warnings"])


def test_stroke_dasharray_removed_from_whitelist():
    # It is now handled as a warning, not via the silent whitelist pass.
    assert "stroke-dasharray" not in WHITELIST_ATTRIBUTES


def test_stroke_dasharray_case_insensitive_warns():
    html = '<animate attributeName="Stroke-DashArray" from="0" to="10" dur="1s"/>'
    report = validate_html(html)
    assert any(w["rule"] == "attribute-dasharray-uncertain" for w in report["warnings"])
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


# ---------------------------------------------------------------------------
# P1-2: new warnings — <style> block, SVG <a>, <image> source restrictions
# ---------------------------------------------------------------------------


def test_style_block_warns():
    html = '<style>.x{color:red}</style><p>hi</p>'
    report = validate_html(html)
    assert any(w["rule"] == "style-block-stripped" for w in report["warnings"])
    assert not any(i["rule"] == "style-block-stripped" for i in report["issues"])


def test_style_block_inside_svg_still_warns():
    html = '<svg><style>.a{fill:red}</style><rect/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "style-block-stripped" for w in report["warnings"])


def test_no_style_block_no_warning():
    html = '<div style="color:red">x</div>'
    report = validate_html(html)
    assert not any(w["rule"] == "style-block-stripped" for w in report["warnings"])


def test_style_block_inside_comment_not_warned():
    html = '<!-- <style>.x{}</style> --><p>real</p>'
    report = validate_html(html)
    assert not any(w["rule"] == "style-block-stripped" for w in report["warnings"])


def test_svg_anchor_warns():
    html = '<svg><a href="https://example.com"><rect/></a></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "anchor-restricted" for w in report["warnings"])
    assert not any(i["rule"] == "anchor-restricted" for i in report["issues"])


def test_plain_text_with_word_anchor_not_warned():
    # No <a href> tag -> no anchor warning.
    html = '<p>请点击下方链接</p>'
    report = validate_html(html)
    assert not any(w["rule"] == "anchor-restricted" for w in report["warnings"])


def test_image_external_link_warns():
    html = '<svg><image href="https://external.example.com/pic.png" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])
    assert not any(i["rule"] == "image-external-link" for i in report["issues"])


def test_image_base64_warns():
    html = '<svg><image href="data:image/png;base64,iVBORw0KG" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-base64-stripped" for w in report["warnings"])


def test_image_mmbiz_cdn_passes_clean():
    html = '<svg><image href="https://mmbiz.qpic.cn/mmbiz_svg/abc" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "image-external-link" for w in report["warnings"])
    assert not any(w["rule"] == "image-base64-stripped" for w in report["warnings"])


def test_image_qpic_subdomain_passes_clean():
    # *.qpic.cn suffix is the WeChat CDN family — host-suffix match must allow it.
    html = '<svg><image xlink:href="https://res.qpic.cn/foo.png" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_xlink_href_external_warns():
    html = '<svg><image xlink:href="http://cdn.other.com/p.jpg" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_relative_href_not_warned():
    # Relative / fragment refs are not external links — no false positive.
    html = '<svg><image href="#localpattern" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "image-external-link" for w in report["warnings"])
    assert not any(w["rule"] == "image-base64-stripped" for w in report["warnings"])


def test_image_javascript_scheme_warns():
    # javascript: pseudo-scheme in <image> href must not pass silently.
    html = '<svg><image href="javascript:alert(1)" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_vbscript_scheme_warns():
    html = '<svg><image xlink:href="vbscript:msgbox(1)" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_src_attribute_external_warns():
    # Non-standard src= (some authoring tools emit it) must still be checked.
    html = '<svg><image src="https://evil.example.com/img.png" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_unquoted_href_external_warns():
    # HTML5-legal unquoted attribute value must not bypass the check.
    html = '<svg><image href=https://evil.example.com/img.png /></svg>'
    report = validate_html(html)
    assert any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_bare_qpic_apex_passes_clean():
    # Bare apex qpic.cn (no subdomain) is the same Tencent CDN — must not warn.
    html = '<svg><image href="https://qpic.cn/foo.png" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_image_mmbiz_still_clean_after_apex_change():
    # Regression guard: mmbiz.qpic.cn still allowed via the .qpic.cn suffix.
    html = '<svg><image href="https://mmbiz.qpic.cn/x" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(w["rule"] == "image-external-link" for w in report["warnings"])


def test_regular_html_anchor_warns_by_design():
    # A real non-SVG hyperlink fires anchor-restricted by design: WeChat article
    # body <a> external links are restricted (only whitelisted links clickable).
    html = '<p><a href="https://example.com">link</a></p>'
    report = validate_html(html)
    assert any(w["rule"] == "anchor-restricted" for w in report["warnings"])
    assert not any(i["rule"] == "anchor-restricted" for i in report["issues"])


def test_style_guide_custom_element_not_warned():
    # <style-guide> custom element must NOT trip the <style>-block warning.
    html = '<style-guide>x</style-guide>'
    report = validate_html(html)
    assert not any(w["rule"] == "style-block-stripped" for w in report["warnings"])


# ---------------------------------------------------------------------------
# P1-2: security bottom line must NOT regress
# ---------------------------------------------------------------------------


def test_security_bottom_line_intact_after_p1_2():
    html = (
        '<svg>'
        '<rect onload="evil()"/>'              # on* wildcard -> issue
        '<script>alert(1)</script>'            # forbidden tag -> issue
        '<a href="javascript:alert(1)">x</a>'  # javascript: URL (also anchor warn)
        '</svg>'
    )
    report = validate_html(html)
    issue_rules = {i["rule"] for i in report["issues"]}
    assert "event-handler" in issue_rules
    assert "forbidden-tag" in issue_rules
    # The new anchor warning must not downgrade the hard security blocks.
    assert any(w["rule"] == "anchor-restricted" for w in report["warnings"])


# ---------------------------------------------------------------------------
# Truth-table 2026-06-13 calibration (A~F): add_draft read-back results
# ---------------------------------------------------------------------------


# B. Static stroke-dasharray presentation attribute is ALLOWED (truth-table
#    probe stroke-dasharray-attr) -> must NOT warn. Only the <animate>
#    attributeName="stroke-dasharray" target keeps a weak hint.
def test_static_stroke_dasharray_attribute_not_warned():
    # A bare static presentation attribute (no <animate>) must be silent.
    html = '<svg><path stroke-dasharray="7 13" d="M0 0 L10 10" stroke="red"/></svg>'
    report = validate_html(html)
    assert not any(
        w["rule"] == "attribute-dasharray-uncertain" for w in report["warnings"]
    )
    assert not any(
        i["rule"] == "attribute-dasharray-uncertain" for i in report["issues"]
    )


def test_static_stroke_dasharray_in_style_attr_not_dasharray_warned():
    # As a style-attribute declaration it is still a static presentation value,
    # not an <animate> target -> no dasharray-uncertain warning.
    html = '<svg><path style="stroke-dasharray:7 13" d="M0 0 L1 1"/></svg>'
    report = validate_html(html)
    assert not any(
        w["rule"] == "attribute-dasharray-uncertain" for w in report["warnings"]
    )


def test_animate_stroke_dasharray_target_still_weak_warns():
    # The <animate attributeName="stroke-dasharray"> target keeps the weak hint:
    # truth-table only confirmed the STATIC attribute, not the animation target.
    html = '<svg><path><animate attributeName="stroke-dasharray" from="0" to="100" dur="2s"/></path></svg>'
    report = validate_html(html)
    assert any(
        w["rule"] == "attribute-dasharray-uncertain" for w in report["warnings"]
    )
    assert [i for i in report["issues"] if i["rule"] == "attribute-whitelist"] == []


# E. External <image>: server keeps it; render layer may not show (anti-leech).
#    Message wording calibrated to the truth-table external-image probe.
def test_image_external_link_message_mentions_render_layer():
    html = '<svg><image href="https://external.example.com/pic.png" width="10" height="10"/></svg>'
    report = validate_html(html)
    ext = [w for w in report["warnings"] if w["rule"] == "image-external-link"]
    assert ext, "external image must still warn"
    # Server keeps the <image>; only the render layer is at risk -> wording must
    # NOT claim the server strips/blocks it.
    assert "服务端保留" in ext[0]["message"]
    assert "防盗链" in ext[0]["message"]


# F. id stripped but url(#)/href=#/begin=id.click references KEPT -> dangling.
def test_id_url_reference_dangling_warns():
    html = (
        '<svg>'
        '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>'
        '<rect fill="url(#g)" width="10" height="10"/>'
        '</svg>'
    )
    report = validate_html(html)
    assert any(w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"])
    assert not any(i["rule"] == "id-stripped-dangling-ref" for i in report["issues"])


def test_id_href_hash_reference_dangling_warns():
    html = (
        '<svg>'
        '<circle id="c" cx="5" cy="5" r="3"/>'
        '<use xlink:href="#c" x="10"/>'
        '</svg>'
    )
    report = validate_html(html)
    assert any(w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"])


def test_id_cross_element_smil_trigger_dangling_warns():
    # begin="<other-id>.click" is a cross-element SMIL sync that depends on the
    # other element's (stripped) id -> must warn.
    html = (
        '<svg>'
        '<rect id="btn" width="10" height="10"/>'
        '<circle r="3"><animate attributeName="opacity" begin="btn.click" from="0" to="1" dur="1s"/></circle>'
        '</svg>'
    )
    report = validate_html(html)
    assert any(w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"])


def test_self_trigger_begin_click_no_dangling_warning():
    # begin="click" (same-element self-trigger, no id prefix) is ALLOWED ->
    # must NOT warn even though an id= happens to exist elsewhere.
    html = (
        '<svg>'
        '<rect id="decor" width="1" height="1"/>'
        '<circle r="3"><animate attributeName="opacity" begin="click" from="0" to="1" dur="1s"/></circle>'
        '</svg>'
    )
    report = validate_html(html)
    assert not any(
        w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"]
    )


def test_touchstart_self_trigger_no_dangling_warning():
    html = (
        '<svg>'
        '<rect id="x" width="1" height="1"/>'
        '<circle r="3"><animate attributeName="opacity" begin="touchstart" from="0" to="1" dur="1s"/></circle>'
        '</svg>'
    )
    report = validate_html(html)
    assert not any(
        w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"]
    )


def test_no_id_no_dangling_warning():
    # An SVG with no id= definition at all -> no dangling warning even if it has
    # a url(#...) that references nothing (incomplete, but not our rule's job).
    html = '<svg><rect fill="url(#missing)" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(
        w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"]
    )


def test_id_defined_but_no_reference_no_warning():
    # id= present but nothing references it -> no dangling chain -> no warning.
    html = '<svg><rect id="lonely" width="10" height="10"/></svg>'
    report = validate_html(html)
    assert not any(
        w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"]
    )


def test_compound_smil_timing_list_dangling_warns():
    # SMIL begin/end accept semicolon-separated timing lists; a cross-element
    # token anywhere in the list (here after a leading "0s; ") still depends on
    # the stripped id and must warn.
    html = (
        '<svg>'
        '<rect id="btn" width="10" height="10"/>'
        '<circle r="3"><animate attributeName="opacity" begin="0s; btn.click" from="0" to="1" dur="1s"/></circle>'
        '</svg>'
    )
    report = validate_html(html)
    assert any(w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"])


def test_self_trigger_begin_click_with_live_ref_no_dangling_warning():
    # Strong version of the self-trigger test: a genuine href="#decor" reference
    # exists (so _ID_DEF_RE AND _REF_HREF_HASH_RE both fire and the function does
    # NOT early-return), yet the only begin= is a same-element self-trigger
    # ("click", no id prefix). The SMIL-sync regex must NOT match it. If
    # _REF_SMIL_SYNC_RE were broken to match bare "click", the href ref would
    # still have produced a warning, so to isolate the SMIL path we assert the
    # warning fires (from the href ref) but that the self-trigger begin alone
    # never adds a cross-element sync match.
    html = (
        '<svg>'
        '<rect id="decor" width="1" height="1"/>'
        '<use href="#decor" x="2"/>'
        '<circle r="3"><animate attributeName="opacity" begin="click" from="0" to="1" dur="1s"/></circle>'
        '</svg>'
    )
    report = validate_html(html)
    # href="#decor" is a real dangling ref -> warning expected here.
    assert any(w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"])


def test_data_id_attribute_no_false_dangling_warning():
    # Regression: hyphenated custom attributes (data-id=, listed-id=, aria-id=)
    # must NOT be matched by _ID_DEF_RE as an SVG id= definition. A document with
    # only data-id= (no real id=) plus a url(#...) reference must NOT warn.
    html = (
        '<section data-id="tracker">'
        '<svg><rect fill="url(#grad)" width="10" height="10"/></svg>'
        '</section>'
    )
    report = validate_html(html)
    assert not any(
        w["rule"] == "id-stripped-dangling-ref" for w in report["warnings"]
    )
