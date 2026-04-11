"""Tests for the top-level render_for_wechat function."""
from app.models.mbdoc import (
    MBDoc,
    MBDocMeta,
    HeadingBlock,
    ParagraphBlock,
    SvgBlock,
)
from app.services.block_registry import BlockRegistry, RenderContext
from app.services.render_for_wechat import render_for_wechat


def _sample_doc() -> MBDoc:
    return MBDoc(
        id="d1",
        meta=MBDocMeta(title="Demo"),
        blocks=[
            HeadingBlock(id="h1", level=1, text="Welcome"),
            ParagraphBlock(id="p1", text="Hello, WeChat."),
            HeadingBlock(id="h2", level=2, text="Details"),
            ParagraphBlock(id="p2", text="More text."),
        ],
    )


def test_render_for_wechat_concatenates_blocks():
    doc = _sample_doc()
    ctx = RenderContext(upload_images=False)
    html = render_for_wechat(doc, ctx)
    assert "Welcome" in html
    assert "Hello, WeChat." in html
    assert "Details" in html
    assert "<h1" in html
    assert "<h2" in html
    assert "<p" in html


def test_render_for_wechat_no_forbidden_tags():
    doc = _sample_doc()
    html = render_for_wechat(doc, RenderContext())
    assert "<style" not in html
    assert "<script" not in html
    assert "<link" not in html
    assert "class=" not in html


def test_render_for_wechat_two_calls_identical_for_text_blocks():
    """With only text blocks, upload_images=True/False must yield identical HTML.

    Core WYSIWYG invariant: the diff between the two modes must be
    confined to <img src> attributes. For text-only docs, there is no
    diff at all.
    """
    doc = _sample_doc()
    a = render_for_wechat(doc, RenderContext(upload_images=False))
    b = render_for_wechat(
        doc,
        RenderContext(
            upload_images=True,
            image_uploader=lambda data, name: f"https://mmbiz.qpic.cn/{name}",
        ),
    )
    assert a == b


def test_render_for_wechat_stub_block_shows_warning():
    """A block whose renderer is a stub produces visible warning markup."""
    doc = MBDoc(
        id="d1",
        meta=MBDocMeta(title="T"),
        blocks=[
            HeadingBlock(id="h1", level=1, text="Title"),
            SvgBlock(id="s1", source="<svg></svg>"),
        ],
    )
    html = render_for_wechat(doc, RenderContext())
    assert "stub" in html.lower()
    assert "s1" in html


def test_render_for_wechat_empty_doc():
    doc = MBDoc(id="d1", meta=MBDocMeta(title="T"), blocks=[])
    html = render_for_wechat(doc, RenderContext())
    # Empty doc renders to an empty string (or just whitespace)
    assert html.strip() == ""


def test_render_for_wechat_accepts_custom_registry():
    """A caller may supply their own registry (dependency injection)."""
    custom = BlockRegistry.default()
    doc = _sample_doc()
    html = render_for_wechat(doc, RenderContext(), registry=custom)
    assert "Welcome" in html
