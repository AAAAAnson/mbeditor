"""Tests for BlockRegistry and renderer dispatch."""
import pytest

from app.models.mbdoc import (
    BlockType,
    HeadingBlock,
    SvgBlock,
)
from app.services.block_registry import (
    BlockRegistry,
    UnknownBlockTypeError,
    RenderContext,
)
from app.services.renderers.base import BlockRenderer
from app.services.renderers.stub import StubBlockRenderer


class _FakeRenderer(BlockRenderer):
    block_type = BlockType.HEADING

    def render(self, block, ctx):
        return f"<h{block.level}>{block.text}</h{block.level}>"


def test_registry_register_and_find():
    r = BlockRegistry()
    r.register(_FakeRenderer())
    result = r.find(BlockType.HEADING)
    assert isinstance(result, _FakeRenderer)


def test_registry_unknown_type_raises():
    r = BlockRegistry()
    with pytest.raises(UnknownBlockTypeError):
        r.find(BlockType.HEADING)


def test_registry_render_block():
    r = BlockRegistry()
    r.register(_FakeRenderer())
    block = HeadingBlock(id="h1", level=2, text="Greet")
    ctx = RenderContext(upload_images=False)
    out = r.render_block(block, ctx)
    assert out == "<h2>Greet</h2>"


def test_stub_renderer_returns_warning_markup():
    stub = StubBlockRenderer(BlockType.SVG)
    block = SvgBlock(id="s1", source="<svg></svg>")
    ctx = RenderContext(upload_images=False)
    out = stub.render(block, ctx)
    # Stub output must be visible so devs notice missing renderers.
    assert "stub" in out.lower() or "not implemented" in out.lower()
    assert block.id in out


def test_render_context_defaults():
    ctx = RenderContext()
    assert ctx.upload_images is False
    assert ctx.image_uploader is None


def test_registry_default_has_all_7_types():
    r = BlockRegistry.default()
    for bt in BlockType:
        # find() should not raise for any built-in type
        r.find(bt)


def test_registry_default_heading_and_paragraph_are_real():
    from app.services.renderers.heading_paragraph import (
        HeadingRenderer,
        ParagraphRenderer,
    )
    r = BlockRegistry.default()
    assert isinstance(r.find(BlockType.HEADING), HeadingRenderer)
    assert isinstance(r.find(BlockType.PARAGRAPH), ParagraphRenderer)


def test_registry_default_others_are_stubs():
    from app.services.renderers.stub import StubBlockRenderer
    r = BlockRegistry.default()
    for bt in (
        BlockType.MARKDOWN,
        BlockType.HTML,
        BlockType.IMAGE,
        BlockType.SVG,
        BlockType.RASTER,
    ):
        assert isinstance(r.find(bt), StubBlockRenderer)
