"""Unit coverage for :mod:`app.services.raster_inline_svgs`.

We intentionally stub out ``render_raster_png`` and
``upload_image_to_wechat`` so the test does not require a running Chromium.
The module's value is 90% the regex + dispatch logic; Playwright fidelity is
covered by ``test_raster_worker``.

The module is deprecated (2026.04) but kept as a potential future fallback,
so the tests stay — every call is wrapped in ``pytest.warns(DeprecationWarning)``
to both silence the noise and assert the warning fires.
"""
from __future__ import annotations

import pytest

from app.services import raster_inline_svgs


def test_noop_without_credentials():
    html = '<div><svg width="100" height="50"><rect width="100" height="50"/></svg></div>'
    with pytest.warns(DeprecationWarning):
        out = raster_inline_svgs.rasterize_and_upload_inline_svgs(
            html, appid="", appsecret=""
        )
    assert out == html


def test_noop_when_no_svg():
    html = "<p>Plain text with no svg element.</p>"
    with pytest.warns(DeprecationWarning):
        out = raster_inline_svgs.rasterize_and_upload_inline_svgs(
            html, appid="wx", appsecret="s"
        )
    assert out == html


def test_single_svg_replaced_with_img(monkeypatch):
    calls: list[tuple[bytes, str]] = []

    def fake_render(block):
        assert 'width="100"' in block.html
        return b"fake-png-bytes"

    def fake_upload(image_bytes, filename, *, appid, appsecret):
        calls.append((image_bytes, filename))
        assert appid == "wxA" and appsecret == "secret"
        return "https://mmbiz.qpic.cn/abc.png"

    monkeypatch.setattr(raster_inline_svgs, "render_raster_png", fake_render)
    monkeypatch.setattr(
        raster_inline_svgs.wechat_service, "upload_image_to_wechat", fake_upload
    )

    html = (
        '<section>hello<svg width="100" height="50" viewBox="0 0 100 50">'
        '<rect width="100" height="50" fill="red"/></svg>world</section>'
    )
    with pytest.warns(DeprecationWarning):
        out = raster_inline_svgs.rasterize_and_upload_inline_svgs(
            html, appid="wxA", appsecret="secret"
        )
    assert "<svg" not in out
    assert 'src="https://mmbiz.qpic.cn/abc.png"' in out
    assert len(calls) == 1
    assert calls[0][0] == b"fake-png-bytes"


def test_duplicate_svg_dedupes_upload(monkeypatch):
    """Two identical SVG blocks should trigger exactly one upload."""
    upload_count = {"n": 0}

    def fake_render(block):
        return b"png"

    def fake_upload(image_bytes, filename, *, appid, appsecret):
        upload_count["n"] += 1
        return "https://mmbiz.qpic.cn/same.png"

    monkeypatch.setattr(raster_inline_svgs, "render_raster_png", fake_render)
    monkeypatch.setattr(
        raster_inline_svgs.wechat_service, "upload_image_to_wechat", fake_upload
    )

    svg = '<svg width="200" height="100"><rect fill="blue"/></svg>'
    html = f"<div>{svg}</div><div>{svg}</div>"
    with pytest.warns(DeprecationWarning):
        out = raster_inline_svgs.rasterize_and_upload_inline_svgs(
            html, appid="wxA", appsecret="s"
        )
    assert out.count('src="https://mmbiz.qpic.cn/same.png"') == 2
    assert upload_count["n"] == 1


def test_per_svg_failure_leaves_that_block_alone(monkeypatch):
    """A raster/upload failure on one SVG must not abort the whole pass."""
    call_ix = {"n": 0}

    def flaky_render(block):
        call_ix["n"] += 1
        if call_ix["n"] == 1:
            raise RuntimeError("boom")
        return b"png"

    def fake_upload(image_bytes, filename, *, appid, appsecret):
        return "https://mmbiz.qpic.cn/ok.png"

    monkeypatch.setattr(raster_inline_svgs, "render_raster_png", flaky_render)
    monkeypatch.setattr(
        raster_inline_svgs.wechat_service, "upload_image_to_wechat", fake_upload
    )

    html = (
        '<svg width="100"><rect/></svg>'          # will raise on first
        '<svg width="200"><circle/></svg>'         # succeeds on second
    )
    with pytest.warns(DeprecationWarning):
        out = raster_inline_svgs.rasterize_and_upload_inline_svgs(
            html, appid="wxA", appsecret="s"
        )
    # First SVG survives untouched:
    assert '<svg width="100"><rect/></svg>' in out
    # Second is replaced:
    assert "<circle" not in out
    assert 'src="https://mmbiz.qpic.cn/ok.png"' in out


@pytest.mark.parametrize(
    "svg,expected",
    [
        ('<svg width="320" height="100"/>', 320),
        ('<svg viewBox="0 0 480 240" />', 480),
        ('<svg width="50000"/>', raster_inline_svgs._DEFAULT_RASTER_WIDTH),  # clamped
        ("<svg/>", raster_inline_svgs._DEFAULT_RASTER_WIDTH),
    ],
)
def test_detect_svg_width(svg, expected):
    assert raster_inline_svgs._detect_svg_width(svg) == expected
