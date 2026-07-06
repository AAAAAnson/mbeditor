"""Tests for the minimal HeadingRenderer and ParagraphRenderer."""
from app.models.mbdoc import HeadingBlock, ParagraphBlock
from app.services.block_registry import RenderContext
from app.services.renderers.heading_paragraph import (
    HeadingRenderer,
    ParagraphRenderer,
)


def test_heading_renders_h1_to_h6():
    r = HeadingRenderer()
    ctx = RenderContext()
    for level in range(1, 7):
        block = HeadingBlock(id=f"h{level}", level=level, text=f"T{level}")
        out = r.render(block, ctx)
        assert f"<h{level}" in out
        assert f"</h{level}>" in out
        assert f"T{level}" in out


def test_heading_has_inline_style():
    r = HeadingRenderer()
    block = HeadingBlock(id="h1", level=1, text="Hello")
    out = r.render(block, RenderContext())
    assert 'style="' in out
    assert "font-size" in out.lower() or "font-weight" in out.lower()


def test_heading_no_class_no_style_tag():
    """Output must be WeChat-compatible: no class, no <style>, no <script>."""
    r = HeadingRenderer()
    block = HeadingBlock(id="h1", level=2, text="Greet")
    out = r.render(block, RenderContext())
    assert "class=" not in out
    assert "<style" not in out
    assert "<script" not in out


def test_heading_escapes_html():
    r = HeadingRenderer()
    block = HeadingBlock(id="h1", level=1, text="<script>alert(1)</script>")
    out = r.render(block, RenderContext())
    assert "<script>alert" not in out
    assert "&lt;script&gt;" in out


def test_paragraph_renders_p():
    r = ParagraphRenderer()
    block = ParagraphBlock(id="p1", text="Body text.")
    out = r.render(block, RenderContext())
    assert "<p" in out
    assert "</p>" in out
    assert "Body text." in out


def test_paragraph_has_inline_style():
    r = ParagraphRenderer()
    block = ParagraphBlock(id="p1", text="Body.")
    out = r.render(block, RenderContext())
    assert 'style="' in out
    assert "line-height" in out.lower()


def test_paragraph_escapes_html():
    r = ParagraphRenderer()
    block = ParagraphBlock(id="p1", text="<b>not bold</b>")
    out = r.render(block, RenderContext())
    assert "<b>not bold</b>" not in out
    assert "&lt;b&gt;" in out
