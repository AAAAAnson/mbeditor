"""Renderer for inline-safe SVG blocks."""
from __future__ import annotations

from typing import TYPE_CHECKING
from xml.etree import ElementTree as ET

from app.models.mbdoc import Block, BlockType, SvgBlock
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


_ALLOWED_TAGS = {
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "clipPath",
    "mask",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "path",
    "text",
    "tspan",
    "image",
    "linearGradient",
    "radialGradient",
    "stop",
    "pattern",
    "filter",
    "feGaussianBlur",
    "animate",
    "animateTransform",
    "set",
}

_BANNED_TAGS = {"script", "style", "a", "foreignObject"}
_BANNED_ATTRS = {"id", "class"}

# SMIL animation elements can target an attribute (attributeName="href") and
# drive it to a javascript:/data: URL via to/from/by/values, navigating without
# an <a>. <a> is already banned, but this closes the defense-in-depth gap.
_ANIM_TAGS = {"animate", "set", "animateTransform", "animateMotion", "animateColor"}
_ANIM_URL_ATTRS = {"to", "from", "by", "values"}


class SvgValidationError(ValueError):
    """Raised when an SVG block contains markup unsafe for the current path."""


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    if ":" in tag:
        return tag.rsplit(":", 1)[1]
    return tag


def _validate_href(value: str, *, publishing: bool, tag: str) -> None:
    lowered = value.strip().lower()
    if lowered.startswith("javascript:") or lowered.startswith("data:"):
        raise SvgValidationError("SVG href must not use javascript: or data: scheme")
    if lowered.startswith("#"):
        raise SvgValidationError("SVG internal id references are not supported in WeChat-safe mode")
    if publishing and tag == "image" and (lowered.startswith("http://") or lowered.startswith("https://")):
        raise SvgValidationError(
            "SVG <image> with remote href is not allowed at publish time; "
            "convert to an ImageBlock or RasterBlock so the asset is uploaded."
        )


def _validate_animation_value(value: str) -> None:
    """Reject a javascript:/data:/vbscript: scheme in an animation value attr.

    Unlike :func:`_validate_href`, this does NOT reject ``#`` id-refs or remote
    image hrefs — animate ``values``/``to`` legitimately carry non-URL data
    (e.g. ``values="0;1"``). It only blocks the script-execution schemes that
    would let a SMIL animation drive a targeted attribute (e.g.
    ``attributeName="href"``) to an executable URL.
    """
    for chunk in value.split(";"):
        lowered = chunk.strip().lower()
        if (
            lowered.startswith("javascript:")
            or lowered.startswith("vbscript:")
            or lowered.startswith("data:")
        ):
            raise SvgValidationError(
                "SVG animation value must not use javascript:/vbscript:/data: scheme"
            )


def _validate_element(node: ET.Element, *, publishing: bool) -> None:
    tag = _local_name(node.tag)
    if tag in _BANNED_TAGS:
        raise SvgValidationError(f"Unsupported SVG tag: <{tag}>")
    if tag not in _ALLOWED_TAGS:
        raise SvgValidationError(f"Unsupported SVG tag: <{tag}>")

    is_anim = tag in _ANIM_TAGS
    for attr_name, attr_value in node.attrib.items():
        local_attr = _local_name(attr_name)
        if local_attr in _BANNED_ATTRS:
            raise SvgValidationError(f"Unsupported SVG attribute: {local_attr}")
        if local_attr.lower().startswith("on"):
            raise SvgValidationError(f"Unsupported SVG event attribute: {local_attr}")
        if local_attr in {"href"} or attr_name.endswith("}href"):
            _validate_href(attr_value, publishing=publishing, tag=tag)
        elif is_anim and local_attr in _ANIM_URL_ATTRS:
            _validate_animation_value(attr_value)

    for child in node:
        _validate_element(child, publishing=publishing)


class SvgRenderer(BlockRenderer):
    block_type = BlockType.SVG

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, SvgBlock)
        try:
            root = ET.fromstring(block.source.strip())
        except ET.ParseError as exc:
            raise SvgValidationError(f"Invalid SVG markup: {exc}") from exc
        _validate_element(root, publishing=bool(ctx.upload_images))
        return block.source.strip()
