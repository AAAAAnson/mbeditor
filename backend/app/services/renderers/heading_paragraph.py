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


# Calibration baseline (2026-04-11, WeChat 测试账号 test account):
# Dumped computed styles from WeChat MP backend .rich_media_content via
# tests/visual/dump_wechat_computed_styles.py. Findings:
#  1. h1-h6/p inline styles survive WeChat's sanitizer unchanged
#     (fontSize, margin, color, text-align all round-trip byte-exact).
#  2. The 20.96% parity drift measured on 2026-04-11 was driven by
#     CONTAINER-level properties — text-align:justify, letter-spacing
#     0.578px, padding 0 4px / box-sizing border-box — inherited from
#     .rich_media_content's ProseMirror parent in the WeChat draft edit
#     view. The editor body wrapper now replicates these in
#     tests/visual/infrastructure._BODY_STYLE_FLUSH.
#  3. Original line-height:1.4 / line-height:1.8 multipliers produced
#     fractional line-box heights (e.g. h5 = 1.4*16 = 22.4px) whose
#     cumulative rounding diverged between the editor screenshot and
#     WeChat's draft rendering, leaving 3 rows (h5, p[0] last line,
#     p[2] middle line) shifted by exactly 1px after every other change.
#     Switching to integer-px line-heights (still ~1.4× / ~1.8× of the
#     font-size, rounded to nearest even px) eliminates the fractional
#     drift entirely while remaining visually equivalent. Because WeChat
#     preserves the inline styles verbatim, the draft side picks up the
#     same integer line-heights and the rounding match becomes exact.
_HEADING_STYLES: dict[int, str] = {
    1: "font-size:26px;font-weight:700;line-height:36px;margin:24px 0 16px;color:#222;text-align:justify;",
    2: "font-size:22px;font-weight:700;line-height:31px;margin:20px 0 14px;color:#222;text-align:justify;",
    3: "font-size:19px;font-weight:700;line-height:27px;margin:18px 0 12px;color:#222;text-align:justify;",
    4: "font-size:17px;font-weight:700;line-height:24px;margin:16px 0 10px;color:#222;text-align:justify;",
    5: "font-size:16px;font-weight:700;line-height:22px;margin:14px 0 8px;color:#333;text-align:justify;",
    6: "font-size:15px;font-weight:700;line-height:21px;margin:12px 0 6px;color:#555;text-align:justify;",
}


_PARAGRAPH_STYLE = (
    "font-size:16px;line-height:29px;letter-spacing:0.578px;"
    "margin:12px 0;color:#333;text-align:justify;"
)


# WeChat MP backend's ProseMirror contenteditable wraps every block's text
# content in a <span leaf="">...</span> "leaf" marker. This empty-attr span
# is invisible visually BUT it creates an inner inline-level box that
# changes how text-align:justify and letter-spacing distribute sub-pixel
# spacing across the line. Without the span wrapper the editor renders
# justified lines with measurably different per-character offsets from
# the WeChat draft (verified 2026-04-11 against WeChat 测试账号 test account).
# Emitting the span here makes the parity HTML structurally identical to
# what ProseMirror would have produced anyway.
_LEAF_OPEN = '<span leaf="">'
_LEAF_CLOSE = "</span>"


class HeadingRenderer(BlockRenderer):
    block_type = BlockType.HEADING

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, HeadingBlock)
        style = _HEADING_STYLES[block.level]
        text = escape(block.text)
        return (
            f'<h{block.level} style="{style}">'
            f"{_LEAF_OPEN}{text}{_LEAF_CLOSE}"
            f"</h{block.level}>"
        )


class ParagraphRenderer(BlockRenderer):
    block_type = BlockType.PARAGRAPH

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, ParagraphBlock)
        text = escape(block.text)
        return f'<p style="{_PARAGRAPH_STYLE}">{_LEAF_OPEN}{text}{_LEAF_CLOSE}</p>'
