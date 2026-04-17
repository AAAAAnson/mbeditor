"""Renderer for raster blocks."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.mbdoc import Block, BlockType, RasterBlock
from app.services.raster_worker import (
    RasterRenderError,
    png_bytes_to_data_url,
    raster_cache_key,
    render_raster_png,
)
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


class RasterRenderer(BlockRenderer):
    block_type = BlockType.RASTER

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, RasterBlock)

        if ctx.upload_images and ctx.image_uploader is None:
            raise RasterRenderError(
                "RasterRenderer requires an image_uploader when upload_images=True; "
                "WeChat drafts cannot carry inline data: URLs."
            )

        png_bytes = render_raster_png(block)
        if ctx.upload_images and ctx.image_uploader is not None:
            filename = f"raster-{raster_cache_key(block)[:12]}.png"
            src = ctx.image_uploader(png_bytes, filename)
        else:
            src = png_bytes_to_data_url(png_bytes)

        return (
            '<figure style="margin:16px auto;">'
            f'<img src="{src}" alt="" style="display:block;width:100%;height:auto;max-width:{block.width}px;" />'
            "</figure>"
        )
