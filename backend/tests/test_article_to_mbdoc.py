"""Tests for Article to MBDoc converter."""
import pytest
from app.services.article_to_mbdoc import article_to_mbdoc, mbdoc_to_article
from app.models.mbdoc import (
    MBDoc, MBDocMeta,
    HeadingBlock, ParagraphBlock, MarkdownBlock, HtmlBlock, ImageBlock, SvgBlock,
)


class TestArticleToMbdDoc:
    """Test Article -> MBDoc conversion."""

    def test_empty_article(self):
        mbdoc = article_to_mbdoc("test-1", "Empty", "")
        assert mbdoc.id == "test-1"
        assert mbdoc.meta.title == "Empty"
        assert len(mbdoc.blocks) == 1
        assert isinstance(mbdoc.blocks[0], ParagraphBlock)

    def test_simple_paragraph(self):
        html = "<p>Hello World</p>"
        mbdoc = article_to_mbdoc("test-1", "Simple", html)
        assert len(mbdoc.blocks) == 1
        assert isinstance(mbdoc.blocks[0], ParagraphBlock)
        assert mbdoc.blocks[0].text == "Hello World"

    def test_heading_extraction(self):
        html = "<h1>Title</h1><p>Content</p>"
        mbdoc = article_to_mbdoc("test-1", "With Heading", html)
        assert len(mbdoc.blocks) == 2
        assert isinstance(mbdoc.blocks[0], HeadingBlock)
        assert mbdoc.blocks[0].level == 1
        assert mbdoc.blocks[0].text == "Title"

    def test_multiple_heading_levels(self):
        html = "<h1>One</h1><h2>Two</h2><h3>Three</h3>"
        mbdoc = article_to_mbdoc("test-1", "Headings", html)
        assert len(mbdoc.blocks) == 3
        assert mbdoc.blocks[0].level == 1
        assert mbdoc.blocks[1].level == 2
        assert mbdoc.blocks[2].level == 3

    def test_image_extraction(self):
        html = '<img src="https://example.com/img.png" alt="Test">'
        mbdoc = article_to_mbdoc("test-1", "With Image", html)
        assert len(mbdoc.blocks) == 1
        assert isinstance(mbdoc.blocks[0], ImageBlock)
        assert mbdoc.blocks[0].src == "https://example.com/img.png"
        assert mbdoc.blocks[0].alt == "Test"

    def test_svg_extraction(self):
        html = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
        mbdoc = article_to_mbdoc("test-1", "With SVG", html)
        assert len(mbdoc.blocks) == 1
        assert isinstance(mbdoc.blocks[0], SvgBlock)
        assert "<svg" in mbdoc.blocks[0].source

    def test_markdown_mode(self):
        markdown = "# Hello\n\nWorld"
        mbdoc = article_to_mbdoc("test-1", "Markdown", "", mode="markdown", markdown=markdown)
        assert len(mbdoc.blocks) == 1
        assert isinstance(mbdoc.blocks[0], MarkdownBlock)
        assert mbdoc.blocks[0].source == markdown

    def test_complex_html_fallback(self):
        html = '<div class="container"><section><p>Complex</p></section></div>'
        mbdoc = article_to_mbdoc("test-1", "Complex", html)
        assert len(mbdoc.blocks) >= 1

    def test_metadata_preserved(self):
        mbdoc = article_to_mbdoc(
            "test-1", "Title", "<p>Content</p>",
            author="Author", digest="Digest", cover="cover.jpg"
        )
        assert mbdoc.meta.author == "Author"
        assert mbdoc.meta.digest == "Digest"
        assert mbdoc.meta.cover == "cover.jpg"

    def test_block_ids_unique(self):
        html = "<h1>A</h1><p>B</p><p>C</p>"
        mbdoc = article_to_mbdoc("test-1", "Unique IDs", html)
        ids = [b.id for b in mbdoc.blocks]
        assert len(ids) == len(set(ids))

    def test_id_validation(self):
        """article_id must pass safe-id validation."""
        with pytest.raises(Exception):
            article_to_mbdoc("../bad", "T", "<p>X</p>")

    # --- New-block-type coverage (additive; reverse-import completion) ---

    def test_unordered_list_to_html_block(self):
        html = "<ul><li>a</li><li>b</li></ul>"
        mbdoc = article_to_mbdoc("test-1", "List", html)
        block = next(b for b in mbdoc.blocks if isinstance(b, HtmlBlock))
        assert "a" in block.source and "b" in block.source
        assert "<ul" in block.source

    def test_pre_block_imported_as_html(self):
        html = "<pre><code>x = 1</code></pre>"
        mbdoc = article_to_mbdoc("test-1", "Pre", html)
        block = next(b for b in mbdoc.blocks if isinstance(b, HtmlBlock))
        assert "<pre" in block.source

    def test_figure_emits_image_and_caption(self):
        html = (
            '<figure><img src="https://x.com/p.png" alt="P">'
            '<figcaption>Cap</figcaption></figure>'
        )
        mbdoc = article_to_mbdoc("test-1", "Fig", html)
        assert isinstance(mbdoc.blocks[0], ImageBlock)
        assert isinstance(mbdoc.blocks[1], ParagraphBlock)
        assert mbdoc.blocks[1].text == "Cap"

    def test_interactive_svg_preserves_child_attrs(self):
        html = (
            '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4">'
            '<animate attributeName="opacity" from="0" to="1" dur="1s"/>'
            '</circle></svg>'
        )
        mbdoc = article_to_mbdoc("test-1", "SVG", html)
        svg = next(b for b in mbdoc.blocks if isinstance(b, SvgBlock))
        assert "attributeName=" in svg.source
        assert "cx=" in svg.source
        assert "<animate" in svg.source

    def test_standalone_anchor_preserves_href(self):
        html = '<a href="https://x.com">link</a>'
        mbdoc = article_to_mbdoc("test-1", "A", html)
        block = next(b for b in mbdoc.blocks if isinstance(b, HtmlBlock))
        assert 'href="https://x.com"' in block.source

    def test_img_width_height_populated(self):
        html = '<img src="https://x.com/i.png" width="100" height="50">'
        mbdoc = article_to_mbdoc("test-1", "Img", html)
        img = next(b for b in mbdoc.blocks if isinstance(b, ImageBlock))
        assert img.width == 100
        assert img.height == 50

    def test_nested_container_emits_paragraph(self):
        html = "<div><section><p>Deep</p></section></div>"
        mbdoc = article_to_mbdoc("test-1", "Nested", html)
        para = [b for b in mbdoc.blocks if isinstance(b, ParagraphBlock)]
        assert any(p.text == "Deep" for p in para)

    def test_malicious_script_dropped(self):
        html = '<p>ok</p><script>alert(1)</script>'
        mbdoc = article_to_mbdoc("test-1", "Mal", html)
        blob = " ".join(
            getattr(b, "source", "") + getattr(b, "text", "") for b in mbdoc.blocks
        )
        assert "<script" not in blob


class TestMbdDocToArticle:
    """Test MBDoc -> Article conversion."""

    def test_heading_to_html(self):
        mbdoc = MBDoc(
            id="test-1",
            meta=MBDocMeta(title="Test"),
            blocks=[HeadingBlock(id="b1", level=1, text="Hello")],
        )
        article = mbdoc_to_article(mbdoc)
        assert "<h1>Hello</h1>" in article["html"]

    def test_paragraph_to_html(self):
        mbdoc = MBDoc(
            id="test-1",
            meta=MBDocMeta(title="Test"),
            blocks=[ParagraphBlock(id="b1", text="World")],
        )
        article = mbdoc_to_article(mbdoc)
        assert "<p>World</p>" in article["html"]

    def test_image_to_html(self):
        mbdoc = MBDoc(
            id="test-1",
            meta=MBDocMeta(title="Test"),
            blocks=[ImageBlock(id="b1", src="https://x.com/i.png", alt="Img")],
        )
        article = mbdoc_to_article(mbdoc)
        assert '<img src="https://x.com/i.png"' in article["html"]

    def test_svg_passthrough(self):
        svg = '<svg viewBox="0 0 10 10"></svg>'
        mbdoc = MBDoc(
            id="test-1",
            meta=MBDocMeta(title="Test"),
            blocks=[SvgBlock(id="b1", source=svg)],
        )
        article = mbdoc_to_article(mbdoc)
        assert svg in article["html"]

    def test_roundtrip_preserves_content(self):
        html = "<h1>Title</h1><p>Content</p>"
        mbdoc = article_to_mbdoc("test-1", "Test", html)
        article = mbdoc_to_article(mbdoc)
        assert "Title" in article["html"]
        assert "Content" in article["html"]

    def test_metadata_roundtrip(self):
        mbdoc = article_to_mbdoc(
            "test-1", "T", "<p>X</p>",
            author="A", digest="D", cover="c.jpg",
        )
        article = mbdoc_to_article(mbdoc)
        assert article["author"] == "A"
        assert article["digest"] == "D"
        assert article["cover"] == "c.jpg"
