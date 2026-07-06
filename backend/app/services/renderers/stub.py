"""StubBlockRenderer — placeholder for block types not yet implemented."""
from html import escape
from typing import TYPE_CHECKING

from app.models.mbdoc import Block, BlockType
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


class StubBlockRenderer(BlockRenderer):
    """Renderer that emits a highly visible warning block.

    Used in Stage 1 for block types whose real renderer lands in later
    stages (Stage 2 for html/markdown, Stage 3 for image, Stage 4 for svg,
    Stage 5 for raster).

    The output is inline-styled so it shows up even in production-like
    preview contexts.
    """

    def __init__(self, block_type: BlockType):
        self.block_type = block_type

    def render(self, block: Block, ctx: "RenderContext") -> str:
        return (
            '<section style="margin:16px 0;padding:12px 16px;'
            'background:#fff3cd;border:2px solid #e8784a;'
            'border-radius:8px;color:#664d03;font-family:monospace;'
            'font-size:13px;">'
            f"[stub renderer — block type <b>{escape(str(self.block_type.value))}</b> "
            f"(id={escape(block.id)}) not implemented yet]"
            "</section>"
        )
