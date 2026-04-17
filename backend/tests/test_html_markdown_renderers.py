from app.models.mbdoc import HtmlBlock, MarkdownBlock, MBDoc, MBDocMeta
from app.services.block_registry import BlockRegistry, RenderContext
from app.services.render_for_wechat import render_for_wechat
from app.services.renderers.html_renderer import HtmlRenderer
from app.services.renderers.markdown_renderer import render_markdown_source


def test_registry_default_uses_real_html_and_markdown_renderers():
    registry = BlockRegistry.default()
    assert isinstance(registry.find(HtmlBlock(id="h", source="<p>x</p>", css="").type), HtmlRenderer)
    assert registry.find(MarkdownBlock(id="m", source="# x").type).__class__.__name__ == "MarkdownRenderer"


def test_html_renderer_processes_inline_styles():
    doc = MBDoc(
        id="d1",
        meta=MBDocMeta(title="T"),
        blocks=[HtmlBlock(id="html1", source="<p>Hello</p>", css="p{color:#e8553a;}")],
    )
    html = render_for_wechat(doc, RenderContext())
    assert "Hello" in html
    assert "<p" in html
    assert "stub" not in html.lower()


def test_markdown_renderer_renders_basic_markdown():
    doc = MBDoc(
        id="d2",
        meta=MBDocMeta(title="T"),
        blocks=[MarkdownBlock(id="md1", source="# Hello\n\nWorld")],
    )
    html = render_for_wechat(doc, RenderContext())
    assert "Hello" in html
    assert "World" in html
    assert "<h1" in html
    assert "<p" in html
    assert "stub" not in html.lower()


def test_render_markdown_source_supports_basic_emphasis():
    html = render_markdown_source("**Bold** and *italic* and `code`")
    assert "<strong>" in html
    assert "<em>" in html
    assert "<code>" in html
