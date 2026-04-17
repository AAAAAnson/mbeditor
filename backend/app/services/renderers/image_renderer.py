"""Renderer for image blocks."""
from __future__ import annotations

import base64
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

from app.core.config import settings
from app.models.mbdoc import Block, BlockType, ImageBlock
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


def _read_image_bytes(src: str) -> tuple[bytes, str] | None:
    if src.startswith("/images/"):
        local_path = Path(settings.IMAGES_DIR) / src.removeprefix("/images/")
        if local_path.exists():
            return local_path.read_bytes(), local_path.name
        return None

    if src.startswith("http://") or src.startswith("https://"):
        response = httpx.get(src, timeout=20, follow_redirects=True)
        response.raise_for_status()
        name = src.split("/")[-1].split("?")[0] or "image.png"
        return response.content, name

    if src.startswith("data:image/"):
        header, b64data = src.split(",", 1)
        mime = header.split(";")[0].removeprefix("data:")
        ext = mime.split("/")[-1].replace("jpeg", "jpg").replace("svg+xml", "svg")
        return base64.b64decode(b64data), f"inline_image.{ext}"

    return None


class ImageRenderer(BlockRenderer):
    block_type = BlockType.IMAGE

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, ImageBlock)
        src = block.src

        if ctx.upload_images and ctx.image_uploader is not None:
            image_payload = _read_image_bytes(block.src)
            if image_payload is not None:
                image_bytes, filename = image_payload
                src = ctx.image_uploader(image_bytes, filename)

        style_parts = ["display:block", "width:100%", "height:auto", "border-radius:8px"]
        if block.width:
            style_parts.append(f"max-width:{block.width}px")

        attrs = [f'src="{src}"', f'alt="{block.alt}"', f'style="{";".join(style_parts)}"']
        if block.width:
            attrs.append(f'width="{block.width}"')
        if block.height:
            attrs.append(f'height="{block.height}"')
        return f"<img {' '.join(attrs)} />"
