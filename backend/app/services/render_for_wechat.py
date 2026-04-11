"""
render_for_wechat — the single canonical rendering entry point.

This function is the SINGLE source of truth for converting an MBDoc into
WeChat-compatible HTML. Preview iframe, "copy rich text", and "push to
draft" all call this function. The diff between ``upload_images=False``
and ``upload_images=True`` calls MUST be confined to ``<img src>``
attributes; this invariant is verified in
``tests/test_render_for_wechat.py``.

Stage 1 uses the minimal Heading/Paragraph renderers plus stubs for the
remaining 5 block types. Stage 2-5 replace stubs with real renderers by
updating ``BlockRegistry.default()``; this function does not change.
"""
from typing import Optional

from app.models.mbdoc import MBDoc
from app.services.block_registry import BlockRegistry, RenderContext


def render_for_wechat(
    doc: MBDoc,
    ctx: RenderContext,
    *,
    registry: Optional[BlockRegistry] = None,
) -> str:
    """Render a full MBDoc into a single HTML string.

    Args:
        doc: the source document.
        ctx: rendering context (``upload_images`` flag, image uploader, etc.).
        registry: optional custom registry. Defaults to
            ``BlockRegistry.default()`` which wires up all 7 Stage-1
            renderers (2 real + 5 stubs).

    Returns:
        A concatenated HTML string ready to be:

        - written into the preview iframe body (``ctx.upload_images=False``)
        - copied to the clipboard (``ctx.upload_images=True`` with uploader)
        - sent to the WeChat draft/add content field (same as above)

    The returned HTML is guaranteed to:

        - Contain no ``<style>``, ``<script>``, ``<link>``, or ``class=``
        - Have inline styles on every semantically styled element
        - Produce byte-identical output for two calls with the same doc and
          same ``ctx.upload_images`` value (deterministic)
    """
    reg = registry or BlockRegistry.default()
    pieces: list[str] = []
    for block in doc.blocks:
        pieces.append(reg.render_block(block, ctx))
    return "\n".join(pieces)
