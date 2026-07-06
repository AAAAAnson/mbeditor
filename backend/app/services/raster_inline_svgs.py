"""Rasterize inline ``<svg>...</svg>`` blocks so they survive WeChat publish.

WeChat's rich-text pipeline (both clipboard paste and ``add_draft`` API) strips
raw ``<svg>`` elements. Articles authored as "one big SVG hero" therefore end
up in WeChat with ``0图`` even though the MBEditor preview shows them fine.

This module walks the outgoing HTML, rasterizes every top-level inline SVG
through the existing headless-Chromium ``raster_worker`` (``RasterBlock``), and
rewrites the SVG node as ``<img src="mmbiz...">`` pointing at the upload. No
account credentials → no-op, same policy as :func:`wechat_service.process_html_images`.
Per-SVG failures are logged and leave that one SVG in place; one bad block
should not nuke the rest of the article.

.. deprecated:: 2026.04
   MBEditor pivoted to "validator is the gate": WeChat-safe SVG is written
   to spec up-front (see ``app.services.svg_validator`` and the
   ``POST /api/v1/wechat/validate`` endpoint), not rasterized after the fact.
   The publish pipeline in :mod:`app.services.publish_adapter` no longer
   wires this module in. Kept for potential future fallback and to preserve
   the existing test suite — **do not add new callers**.
"""
from __future__ import annotations

import hashlib
import logging
import re
import warnings
from typing import Dict

from app.models.mbdoc import RasterBlock
from app.services import wechat_service
from app.services.raster_worker import render_raster_png

logger = logging.getLogger(__name__)

# Non-greedy match — stops at the first </svg>. Nested SVGs are extremely
# rare in article content and the common case is a single self-contained hero
# block per section; if users hit a nesting edge case we'll revisit.
_SVG_BLOCK_RE = re.compile(r"<svg\b[^>]*>[\s\S]*?</svg>", re.IGNORECASE)
_WIDTH_ATTR_RE = re.compile(r'\bwidth\s*=\s*["\']?(\d+(?:\.\d+)?)', re.IGNORECASE)
_VIEWBOX_RE = re.compile(
    r'\bviewBox\s*=\s*["\']\s*[\d.\-eE]+\s+[\d.\-eE]+\s+([\d.\-eE]+)\s+[\d.\-eE]+',
    re.IGNORECASE,
)

_MIN_RASTER_WIDTH = 200
_MAX_RASTER_WIDTH = 1500
_DEFAULT_RASTER_WIDTH = 600


def _detect_svg_width(svg: str) -> int:
    """Pick a raster viewport width for this SVG.

    Prefers an explicit integer ``width="..."`` attribute, falls back to the
    first number in ``viewBox``, finally to a sane default. Values are clamped
    so an author typo (``width="50000"``) can't hang the rasterizer.
    """
    width_match = _WIDTH_ATTR_RE.search(svg)
    if width_match:
        try:
            width = int(float(width_match.group(1)))
            if _MIN_RASTER_WIDTH <= width <= _MAX_RASTER_WIDTH:
                return width
        except ValueError:
            pass

    viewbox_match = _VIEWBOX_RE.search(svg)
    if viewbox_match:
        try:
            width = int(float(viewbox_match.group(1)))
            if _MIN_RASTER_WIDTH <= width <= _MAX_RASTER_WIDTH:
                return width
        except ValueError:
            pass

    return _DEFAULT_RASTER_WIDTH


def _img_tag(url: str) -> str:
    # Inline style rather than a class: WeChat's rich-text sanitizer drops
    # arbitrary class names, so the layout has to live on the element.
    return (
        f'<img src="{url}" '
        'style="display:block;width:100%;height:auto;max-width:100%;margin:16px auto;" '
        'alt="" />'
    )


def rasterize_and_upload_inline_svgs(
    html: str, *, appid: str, appsecret: str
) -> str:
    """Replace every inline ``<svg>`` in *html* with an uploaded-PNG ``<img>``.

    Returns the rewritten HTML. When credentials are missing, or the HTML has
    no SVG, the input is returned unchanged.

    .. deprecated:: 2026.04
       The publish pipeline no longer rasterizes SVG. Gate compatibility on
       ``POST /api/v1/wechat/validate`` (``app.services.svg_validator``)
       instead. See module docstring.
    """
    warnings.warn(
        "rasterize_and_upload_inline_svgs is deprecated; the publish pipeline "
        "no longer rasterizes SVG. Gate on POST /api/v1/wechat/validate instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    if not appid or not appsecret:
        return html
    if "<svg" not in html.lower():
        return html

    uploaded: Dict[str, str] = {}

    def replace(match: "re.Match[str]") -> str:
        svg = match.group(0)
        digest = hashlib.sha256(svg.encode("utf-8")).hexdigest()
        cached = uploaded.get(digest)
        if cached is not None:
            return _img_tag(cached)

        try:
            block = RasterBlock(
                id=f"inline-svg-{digest[:12]}",
                html=svg,
                css="",
                width=_detect_svg_width(svg),
            )
            png_bytes = render_raster_png(block)
            url = wechat_service.upload_image_to_wechat(
                png_bytes,
                f"svg-{digest[:10]}.png",
                appid=appid,
                appsecret=appsecret,
            )
        except Exception as exc:  # noqa: BLE001 — we intentionally degrade per-SVG
            logger.warning(
                "Failed to rasterize/upload inline SVG (%d chars): %s",
                len(svg),
                exc,
            )
            return svg

        uploaded[digest] = url
        return _img_tag(url)

    return _SVG_BLOCK_RE.sub(replace, html)
