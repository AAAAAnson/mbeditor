"""Smoke tests for visual parity infrastructure.

Validates importability and pure-function correctness WITHOUT:
  - Calling any WeChat API
  - Requiring a logged-in browser session
  - Network access of any kind

Run:
    cd backend && python -m pytest tests/visual/test_infrastructure_smoke.py -q
"""

import io
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helper to build minimal MBDoc objects
# ---------------------------------------------------------------------------

def _make_doc(doc_id: str = "smoke-doc"):
    from app.models.mbdoc import MBDoc, MBDocMeta, HeadingBlock, ParagraphBlock, BlockType

    return MBDoc(
        id=doc_id,
        version="1",
        meta=MBDocMeta(title="Smoke Test Doc"),
        blocks=[
            HeadingBlock(id="h1", level=1, text="Hello World"),
            ParagraphBlock(id="p1", text="This is a paragraph for visual parity testing."),
        ],
    )


# ---------------------------------------------------------------------------
# 1. render_mbdoc_to_screenshot produces a valid PNG
# ---------------------------------------------------------------------------

def test_render_mbdoc_to_screenshot_produces_png(tmp_path):
    from tests.visual.infrastructure import render_mbdoc_to_screenshot

    doc = _make_doc("smoke-render")
    out_path = render_mbdoc_to_screenshot(doc, out_dir=tmp_path)

    assert out_path.exists(), f"Expected PNG at {out_path}"
    assert out_path.name == "smoke-render_editor.png"

    # Verify PNG magic bytes
    header = out_path.read_bytes()[:8]
    assert header[:4] == b"\x89PNG", f"File is not a PNG (header: {header!r})"


# ---------------------------------------------------------------------------
# 2. diff_images — identical image → diff_pct == 0
# ---------------------------------------------------------------------------

def test_diff_images_identical(tmp_path):
    from PIL import Image
    from tests.visual.infrastructure import diff_images

    # Create a simple 100×100 solid-colour PNG
    img = Image.new("RGB", (100, 100), color=(100, 150, 200))
    path = tmp_path / "solid.png"
    img.save(str(path))

    result = diff_images(path, path)

    assert result["diff_pct"] == 0.0
    assert result["diff_pixels"] == 0
    assert result["total_pixels"] == 100 * 100
    assert result["diff_image_path"] is None


# ---------------------------------------------------------------------------
# 3. diff_images — different sizes handled without exception
# ---------------------------------------------------------------------------

def test_diff_images_different_sizes_are_handled(tmp_path):
    from PIL import Image
    from tests.visual.infrastructure import diff_images

    img_a = Image.new("RGB", (200, 300), color=(255, 0, 0))
    img_b = Image.new("RGB", (100, 150), color=(0, 255, 0))

    path_a = tmp_path / "img_a.png"
    path_b = tmp_path / "img_b.png"
    img_a.save(str(path_a))
    img_b.save(str(path_b))

    # Should not raise; b gets resized to a's dimensions
    result = diff_images(path_a, path_b, tolerance=0.0)

    assert "diff_pct" in result
    assert "diff_pixels" in result
    assert result["total_pixels"] == 200 * 300  # a's dimensions


# ---------------------------------------------------------------------------
# 4. diff_dom — data-* attribute differences are ignored
# ---------------------------------------------------------------------------

def test_diff_dom_ignores_data_attrs():
    from tests.visual.infrastructure import diff_dom

    html_a = '<p data-foo="1">x</p>'
    html_b = '<p data-foo="2">x</p>'

    result = diff_dom(html_a, html_b)

    assert result["equal"] is True, f"Expected equal but got diff:\n{result['diff']}"


# ---------------------------------------------------------------------------
# 5. diff_dom — real content diff is detected
# ---------------------------------------------------------------------------

def test_diff_dom_detects_real_diff():
    from tests.visual.infrastructure import diff_dom

    html_a = "<p>a</p>"
    html_b = "<p>b</p>"

    result = diff_dom(html_a, html_b)

    assert result["equal"] is False
    assert result["diff"] != ""


# ---------------------------------------------------------------------------
# 6. push_mbdoc_to_wechat_draft and screenshot_wechat_draft are importable
# ---------------------------------------------------------------------------

def test_push_mbdoc_to_wechat_draft_and_screenshot_functions_are_importable():
    # Only tests that the functions exist and are callable objects.
    # Does NOT call them (would require WeChat credentials + login state).
    from tests.visual.infrastructure import (
        push_mbdoc_to_wechat_draft,
        screenshot_wechat_draft,
    )

    assert callable(push_mbdoc_to_wechat_draft)
    assert callable(screenshot_wechat_draft)
