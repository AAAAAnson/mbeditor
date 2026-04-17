"""Playwright-backed raster rendering for RasterBlock.

The worker takes a ``RasterBlock`` (html + css + target width), spins up a
headless Chromium via Playwright, and screenshots the content into a PNG.
Results are cached by content hash so repeated renders are fast.

Publish flow uploads the PNG through ``RenderContext.image_uploader``; the
worker itself only produces bytes.
"""
from __future__ import annotations

import base64
import hashlib
import re
from typing import Dict

from app.models.mbdoc import RasterBlock
from app.services.renderers.image_renderer import _read_image_bytes


class RasterRenderError(RuntimeError):
    """Raised when raster rendering cannot complete.

    Covers missing Playwright install, browser launch failures, and
    missing uploader at publish time.
    """


_RASTER_CACHE: Dict[str, bytes] = {}
_IMG_SRC_RE = re.compile(r'(<img\b[^>]*\bsrc=["\'])([^"\']+)(["\'])', re.IGNORECASE)


def raster_cache_key(block: RasterBlock) -> str:
    payload = f"{block.width}\n{block.html}\n{block.css}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _mime_for_filename(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    if ext in {"jpg", "jpeg"}:
        return "image/jpeg"
    if ext == "gif":
        return "image/gif"
    if ext == "webp":
        return "image/webp"
    if ext == "svg":
        return "image/svg+xml"
    return "image/png"


def _inline_images(html: str) -> str:
    """Rewrite <img src> to data: URLs so headless Chromium can paint them.

    Non-resolvable sources are left as-is, which means Chromium will
    render a broken image placeholder. That is intentional — we do not
    silently drop unknown sources at raster time.
    """
    def repl(match: re.Match[str]) -> str:
        src = match.group(2)
        if src.startswith("data:"):
            return match.group(0)
        image_payload = _read_image_bytes(src)
        if image_payload is None:
            return match.group(0)
        image_bytes, filename = image_payload
        mime = _mime_for_filename(filename)
        data_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        return f"{match.group(1)}{data_url}{match.group(3)}"

    return _IMG_SRC_RE.sub(repl, html)


def _build_document(block: RasterBlock) -> str:
    inline_html = _inline_images(block.html)
    return f"""<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {{
        margin: 0;
        padding: 0;
        background: transparent;
      }}
      #mbeditor-raster-root {{
        width: {block.width}px;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }}
      img {{
        max-width: 100%;
      }}
      {block.css}
    </style>
  </head>
  <body>
    <div id="mbeditor-raster-root">{inline_html}</div>
  </body>
</html>"""


def _screenshot_via_playwright(block: RasterBlock, full_html: str) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RasterRenderError(
            "Playwright is not installed. Install with `pip install playwright` "
            "and `playwright install chromium`."
        ) from exc

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    viewport={"width": block.width, "height": 1200},
                    device_scale_factor=2,
                )
                page.set_content(full_html, wait_until="load")
                page.wait_for_timeout(50)
                return page.locator("#mbeditor-raster-root").screenshot(
                    type="png",
                    animations="disabled",
                )
            finally:
                browser.close()
    except RasterRenderError:
        raise
    except Exception as exc:
        raise RasterRenderError(f"Headless Chromium failed: {exc}") from exc


def render_raster_png(block: RasterBlock) -> bytes:
    cache_key = raster_cache_key(block)
    cached = _RASTER_CACHE.get(cache_key)
    if cached is not None:
        return cached

    screenshot = _screenshot_via_playwright(block, _build_document(block))
    _RASTER_CACHE[cache_key] = screenshot
    return screenshot


def png_bytes_to_data_url(png_bytes: bytes) -> str:
    return f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"
