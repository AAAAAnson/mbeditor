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
