# backend/tests/test_api_publish.py
"""Tests for publish API endpoints."""
import pytest


def test_preview(client, sample_article):
    """Test preview endpoint."""
    response = client.post("/api/v1/publish/preview", json={
        "html": sample_article["html"],
        "css": sample_article["css"],
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "html" in data["data"]


def test_process_for_copy(client, sample_article):
    """Test process-for-copy endpoint."""
    response = client.post("/api/v1/publish/process-for-copy", json={
        "html": sample_article["html"],
        "css": sample_article["css"],
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "html" in data["data"]
    assert "report" in data["data"]


def test_process_for_copy_validates_raw_html_not_sanitized(client, sample_article):
    """Validation must run on the ORIGINAL html, not the sanitized output.

    The sanitizer strips/normalizes <animate attributeName=...> (lower-cases
    the attribute name and unwraps the tag), so validating the sanitized
    output yields zero findings. Injecting a known-bad SVG and asserting the
    report is non-empty proves validation sees the raw input.
    """
    bad_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<animate attributeName="color" dur="1s"/>'
        "</svg>"
    )
    response = client.post("/api/v1/publish/process-for-copy", json={
        "html": sample_article["html"] + bad_svg,
        "css": sample_article["css"],
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    issues = data["data"]["report"]["issues"]
    assert issues, "expected non-empty report when raw html contains a non-whitelist attributeName"
    assert any(i["rule"] == "attribute-whitelist" for i in issues)


def test_preview_still_sanitizes_smil(client):
    """The /publish/preview endpoint must keep stripping SMIL interaction.

    "公众号效果" preview unconditionally runs inline_css -> sanitize_for_wechat.
    The sanitizer lower-cases SVG attribute names (attributeName -> attributename),
    which makes declarative SMIL animation inert (SVG attribute names are
    case-sensitive). This guards the endpoint's job boundary: the original
    interactive-preview path must NOT be moved into the backend in a way that
    weakens this sanitize line (see L31-53 for the same documented breakage).
    """
    smil_html = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<rect id="r" width="10" height="10"/>'
        '<animate begin="r.click" attributeName="fill" to="red" dur="1s"/>'
        "</svg>"
    )
    response = client.post("/api/v1/publish/preview", json={
        "html": smil_html,
        "css": "",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    out = data["data"]["html"]
    # The case-sensitive SMIL trigger attribute is destroyed by sanitize:
    # the canonical "attributeName" no longer survives, proving SMIL is broken.
    # We assert only on the case-sensitive original — whether the sanitizer
    # lower-cases the attribute OR strips the <animate> element entirely, both
    # are correct outcomes that defeat the declarative trigger. Coupling the
    # test to the lower-casing branch (asserting "attributename" survives) would
    # false-fail a legitimately stricter sanitizer.
    assert "attributeName" not in out, "preview must sanitize SMIL (attributeName should be lower-cased/stripped)"


def test_validate(client, sample_article):
    """Test validate endpoint."""
    response = client.post("/api/v1/wechat/validate", json={
        "html": sample_article["html"],
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "issues" in data["data"]
    assert "warnings" in data["data"]


def test_preview_empty_html(client):
    """Test preview with empty HTML."""
    response = client.post("/api/v1/publish/preview", json={
        "html": "",
        "css": "",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0


def test_preview_with_css(client):
    """Test preview with CSS."""
    response = client.post("/api/v1/publish/preview", json={
        "html": "<p>Test</p>",
        "css": "p { color: red; }",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "html" in data["data"]
