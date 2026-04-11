"""Minimal HeadingRenderer and ParagraphRenderer for Stage 1.

These are plain-text renderers — they take ``block.text`` and wrap it in
the appropriate HTML tag with an inline style. They are sufficient for
the Stage-1 end-to-end API test and will remain unchanged through
Stage 2-5 (which add other block types, not change these two).

Styles are minimal and tuned to the WeChat mobile reading chrome so that
preview ≡ final content: PingFang-like sans-serif at 16px body with
line-height 1.8, headings at the scale WeChat readers expect.
"""
from html import escape
from typing import TYPE_CHECKING

from app.models.mbdoc import Block, BlockType, HeadingBlock, ParagraphBlock
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


_HEADING_STYLES: dict[int, str] = {
    1: "font-size:26px;font-weight:700;line-height:1.4;margin:24px 0 16px;color:#222;",
    2: "font-size:22px;font-weight:700;line-height:1.4;margin:20px 0 14px;color:#222;",
    3: "font-size:19px;font-weight:700;line-height:1.4;margin:18px 0 12px;color:#222;",
    4: "font-size:17px;font-weight:700;line-height:1.4;margin:16px 0 10px;color:#222;",
    5: "font-size:16px;font-weight:700;line-height:1.4;margin:14px 0 8px;color:#333;",
    6: "font-size:15px;font-weight:700;line-height:1.4;margin:12px 0 6px;color:#555;",
}


_PARAGRAPH_STYLE = "font-size:16px;line-height:1.8;margin:12px 0;color:#333;"


class HeadingRenderer(BlockRenderer):
    block_type = BlockType.HEADING

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, HeadingBlock)
        style = _HEADING_STYLES[block.level]
        text = escape(block.text)
        return f'<h{block.level} style="{style}">{text}</h{block.level}>'


class ParagraphRenderer(BlockRenderer):
    block_type = BlockType.PARAGRAPH

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, ParagraphBlock)
        text = escape(block.text)
        return f'<p style="{_PARAGRAPH_STYLE}">{text}</p>'
