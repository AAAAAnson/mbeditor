"""Renderer for raw HTML blocks."""
from typing import TYPE_CHECKING

from app.models.mbdoc import Block, BlockType, HtmlBlock
from app.services.legacy_render_pipeline import process_for_wechat
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


class HtmlRenderer(BlockRenderer):
    block_type = BlockType.HTML

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, HtmlBlock)
        return process_for_wechat(block.source, block.css)
