"""Raster worker tests: real Playwright path, cache, failure, image inlining."""
from __future__ import annotations

import base64
from pathlib import Path

import pytest

from app.models.mbdoc import RasterBlock
from app.services import raster_worker
from app.services.raster_worker import (
    RasterRenderError,
    _inline_images,
    png_bytes_to_data_url,
    raster_cache_key,
    render_raster_png,
)


def _playwright_chromium_available() -> bool:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return False
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
    except Exception:
        return False
    return True


PLAYWRIGHT_AVAILABLE = _playwright_chromium_available()


@pytest.fixture(autouse=True)
def _clear_raster_cache():
    raster_worker._RASTER_CACHE.clear()
    yield
    raster_worker._RASTER_CACHE.clear()


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="Playwright chromium not available")
def test_render_raster_png_produces_real_png_bytes():
    block = RasterBlock(
        id="r-real",
        html='<div class="card"><strong>Hello</strong><p>MBEditor raster path.</p></div>',
        css=".card{padding:12px 16px;background:#fef3c7;border-radius:8px;color:#92400e;font-family:sans-serif;}",
        width=280,
    )
    png = render_raster_png(block)

    assert png.startswith(b"\x89PNG\r\n\x1a\n"), "output is not a valid PNG signature"
    assert len(png) > 300, "screenshot is implausibly small"

    data_url = png_bytes_to_data_url(png)
    assert data_url.startswith("data:image/png;base64,")
    assert base64.b64decode(data_url.split(",", 1)[1]) == png


def test_render_raster_png_cache_hit_skips_playwright(monkeypatch):
    block = RasterBlock(id="r-cache", html="<div>x</div>", css="", width=100)
    raster_worker._RASTER_CACHE[raster_cache_key(block)] = b"PNG-CACHED"

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("playwright must not be called on cache hit")

    monkeypatch.setattr(raster_worker, "_screenshot_via_playwright", _forbidden)

    assert render_raster_png(block) == b"PNG-CACHED"


def test_render_raster_png_cache_miss_populates_cache(monkeypatch):
    block = RasterBlock(id="r-fill", html="<div>x</div>", css="", width=120)

    calls = {"n": 0}

    def _fake(block_arg, full_html):
        calls["n"] += 1
        assert "mbeditor-raster-root" in full_html
        return b"PNG-FAKE"

    monkeypatch.setattr(raster_worker, "_screenshot_via_playwright", _fake)

    first = render_raster_png(block)
    second = render_raster_png(block)

    assert first == second == b"PNG-FAKE"
    assert calls["n"] == 1
    assert raster_worker._RASTER_CACHE[raster_cache_key(block)] == b"PNG-FAKE"


def test_screenshot_via_playwright_raises_clear_error_on_import_failure(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "playwright.sync_api":
            raise ImportError("synthetic: playwright missing")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    block = RasterBlock(id="r-noplay", html="<div/>", css="", width=100)
    with pytest.raises(RasterRenderError, match="Playwright is not installed"):
        raster_worker._screenshot_via_playwright(block, "<html><body/></html>")


def test_screenshot_via_playwright_wraps_browser_errors(monkeypatch):
    class _FakeCtxMgr:
        def __enter__(self):
            raise RuntimeError("chromium boom")

        def __exit__(self, *exc_info):
            return False

    def fake_sync_playwright():
        return _FakeCtxMgr()

    import sys
    import types

    fake_module = types.ModuleType("playwright.sync_api")
    fake_module.sync_playwright = fake_sync_playwright
    monkeypatch.setitem(sys.modules, "playwright.sync_api", fake_module)

    block = RasterBlock(id="r-boom", html="<div/>", css="", width=100)
    with pytest.raises(RasterRenderError, match="Headless Chromium failed"):
        raster_worker._screenshot_via_playwright(block, "<html><body/></html>")


def test_cache_key_is_stable_and_content_sensitive():
    a = RasterBlock(id="r-a", html="<div>x</div>", css="", width=200)
    a_dup = RasterBlock(id="r-a-dup", html="<div>x</div>", css="", width=200)
    different_html = RasterBlock(id="r-b", html="<div>y</div>", css="", width=200)
    different_css = RasterBlock(id="r-c", html="<div>x</div>", css="div{color:red;}", width=200)
    different_width = RasterBlock(id="r-d", html="<div>x</div>", css="", width=240)

    key_a = raster_cache_key(a)
    assert key_a == raster_cache_key(a_dup), "id must not influence cache key"
    assert key_a != raster_cache_key(different_html)
    assert key_a != raster_cache_key(different_css)
    assert key_a != raster_cache_key(different_width)


def test_inline_images_local_path(monkeypatch, tmp_path):
    from app.core import config as config_mod

    images_dir = tmp_path / "images"
    images_dir.mkdir()
    png_bytes = b"\x89PNG\r\n\x1a\nFAKEBODY"
    (images_dir / "card.png").write_bytes(png_bytes)
    monkeypatch.setattr(config_mod.settings, "IMAGES_DIR", str(images_dir))

    html = '<img src="/images/card.png" alt="c" />'
    out = _inline_images(html)
    expected = base64.b64encode(png_bytes).decode("ascii")
    assert f"data:image/png;base64,{expected}" in out


def test_inline_images_leaves_missing_local_path_unchanged(monkeypatch, tmp_path):
    from app.core import config as config_mod

    images_dir = tmp_path / "images"
    images_dir.mkdir()
    monkeypatch.setattr(config_mod.settings, "IMAGES_DIR", str(images_dir))

    html = '<img src="/images/missing.png" />'
    assert _inline_images(html) == html


def test_inline_images_preserves_existing_data_url():
    html = '<img src="data:image/jpeg;base64,AAAA" />'
    assert _inline_images(html) == html


def test_inline_images_leaves_unknown_scheme_unchanged():
    html = '<img src="file:///etc/passwd" />'
    assert _inline_images(html) == html


def test_inline_images_handles_multiple_imgs(monkeypatch, tmp_path):
    from app.core import config as config_mod

    images_dir = tmp_path / "images"
    images_dir.mkdir()
    (images_dir / "a.png").write_bytes(b"A")
    (images_dir / "b.jpg").write_bytes(b"B")
    monkeypatch.setattr(config_mod.settings, "IMAGES_DIR", str(images_dir))

    html = '<div><img src="/images/a.png"/><img src="/images/b.jpg"/></div>'
    out = _inline_images(html)
    assert "data:image/png;base64," in out
    assert "data:image/jpeg;base64," in out
