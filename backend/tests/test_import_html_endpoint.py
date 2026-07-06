"""Tests for POST /publish/import-html and reverse-import security."""
from pathlib import Path

import pytest

from app.services.article_to_mbdoc import article_to_mbdoc

_FIXDIR = Path(__file__).parent / "fixtures" / "import"


def _fixture(name: str) -> str:
    return (_FIXDIR / name).read_text(encoding="utf-8")


def _all_sources(doc) -> str:
    """Concatenate every text-bearing field across all blocks."""
    parts = []
    for b in doc.blocks:
        for attr in ("source", "text", "src", "alt", "html"):
            v = getattr(b, attr, None)
            if isinstance(v, str):
                parts.append(v)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Reverse-import round-trip (offline, fixture-driven)
# ---------------------------------------------------------------------------

class TestReverseImportRoundTrip:
    def test_list_to_html_block(self):
        doc = article_to_mbdoc("imp-1", "List", _fixture("article_with_list.html"))
        types = [type(b).__name__ for b in doc.blocks]
        assert "HtmlBlock" in types
        # the ul block carries both li texts
        ul_block = next(
            b for b in doc.blocks
            if type(b).__name__ == "HtmlBlock" and "<ul" in getattr(b, "source", "")
        )
        assert "Apples" in ul_block.source
        assert "Bananas" in ul_block.source

    def test_nested_ordered_list_preserved(self):
        doc = article_to_mbdoc("imp-1", "List", _fixture("article_with_list.html"))
        ol_block = next(
            b for b in doc.blocks
            if type(b).__name__ == "HtmlBlock" and "<ol" in getattr(b, "source", "")
        )
        assert "nested-a" in ol_block.source
        assert "nested-b" in ol_block.source
        assert "<ul" in ol_block.source  # nested list survives

    def test_pre_block_imports_and_renders_code_box(self):
        doc = article_to_mbdoc("imp-1", "Code", _fixture("article_with_pre.html"))
        pre_block = next(
            b for b in doc.blocks
            if type(b).__name__ == "HtmlBlock" and "<pre" in getattr(b, "source", "")
        )
        assert "hello" in pre_block.source
        # Rendering yields the styled section/code box.
        from app.services.legacy_render_pipeline import process_for_wechat
        rendered = process_for_wechat(pre_block.source)
        assert "<section" in rendered and "<code" in rendered

    def test_figure_emits_image_then_caption(self):
        doc = article_to_mbdoc("imp-1", "Figure", _fixture("article_with_figure.html"))
        types = [type(b).__name__ for b in doc.blocks]
        assert types == ["ImageBlock", "ParagraphBlock"]
        img = doc.blocks[0]
        assert img.src == "https://example.com/photo.png"
        assert img.width == 640
        assert img.height == 480
        assert doc.blocks[1].text == "Sunset over the bay"

    def test_interactive_svg_fidelity(self):
        """THE fidelity test — camelCase attrs + <animate> survive verbatim."""
        doc = article_to_mbdoc(
            "imp-1", "SVG", _fixture("article_with_interactive_svg.html")
        )
        svg_block = next(b for b in doc.blocks if type(b).__name__ == "SvgBlock")
        src = svg_block.source
        assert "attributeName=" in src  # camelCase preserved
        assert "cx=" in src
        assert "viewBox=" in src
        assert "<animate" in src
        # Click-triggered interactivity must survive verbatim — this is the
        # headline fidelity case (not just any time-based begin value).
        assert 'begin="click"' in src
        assert 'fill="url(#g1)"' in src  # id reference preserved
        # heading before + paragraph after also captured
        types = [type(b).__name__ for b in doc.blocks]
        assert "HeadingBlock" in types
        assert "ParagraphBlock" in types

    def test_standalone_anchor_href_preserved(self):
        doc = article_to_mbdoc("imp-1", "Link", '<a href="https://x.com/page">Read</a>')
        block = doc.blocks[0]
        assert type(block).__name__ == "HtmlBlock"
        assert 'href="https://x.com/page"' in block.source

    def test_img_width_height(self):
        doc = article_to_mbdoc(
            "imp-1", "Img", '<img src="https://x.com/a.png" width="100" height="50">'
        )
        img = doc.blocks[0]
        assert img.width == 100
        assert img.height == 50

    def test_nested_div_section_paragraph_not_dropped(self):
        doc = article_to_mbdoc(
            "imp-1", "Nested", '<div class="c"><section><p>Complex</p></section></div>'
        )
        para = [b for b in doc.blocks if type(b).__name__ == "ParagraphBlock"]
        assert len(para) == 1
        assert para[0].text == "Complex"

    def test_empty_html_single_empty_paragraph(self):
        doc = article_to_mbdoc("imp-1", "Empty", "")
        assert len(doc.blocks) == 1
        assert type(doc.blocks[0]).__name__ == "ParagraphBlock"
        assert doc.blocks[0].text == ""

    def test_blockquote_preserved(self):
        doc = article_to_mbdoc("imp-1", "Quote", "<blockquote>wisdom</blockquote>")
        block = doc.blocks[0]
        assert type(block).__name__ == "HtmlBlock"
        assert "<blockquote" in block.source
        assert "wisdom" in block.source

    def test_table_preserved(self):
        doc = article_to_mbdoc(
            "imp-1", "Table", "<table><tr><td>cell</td></tr></table>"
        )
        block = next(
            b for b in doc.blocks
            if type(b).__name__ == "HtmlBlock" and "<table" in getattr(b, "source", "")
        )
        assert "cell" in block.source


# ---------------------------------------------------------------------------
# Security: malicious HTML reverse-import produces NO executable script
# ---------------------------------------------------------------------------

class TestReverseImportSecurity:
    def test_malicious_fixture_stripped(self):
        doc = article_to_mbdoc(
            "imp-1", "Malicious", _fixture("article_malicious.html")
        )
        blob = _all_sources(doc).lower()
        assert "<script" not in blob
        assert "onerror" not in blob
        assert "onclick" not in blob
        assert "javascript:" not in blob
        assert "data:text/html" not in blob

    def test_svg_script_stripped_but_svg_kept(self):
        doc = article_to_mbdoc(
            "imp-1", "SVG", '<svg><script>alert(1)</script><circle cx="5"/></svg>'
        )
        svg = next(b for b in doc.blocks if type(b).__name__ == "SvgBlock")
        assert "<script" not in svg.source
        assert "<circle" in svg.source

    def test_javascript_anchor_href_dropped(self):
        doc = article_to_mbdoc(
            "imp-1", "JS", '<a href="javascript:evil()">x</a>'
        )
        blob = _all_sources(doc)
        assert "javascript:" not in blob

    def test_data_uri_image_dropped_not_500(self):
        # ImageBlock validator rejects data: — node is dropped, no exception.
        doc = article_to_mbdoc(
            "imp-1", "Data", '<img src="data:text/html,<script>x</script>" alt="d">'
        )
        # No ImageBlock with the data uri survives.
        for b in doc.blocks:
            assert "data:text/html" not in getattr(b, "src", "")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

class TestImportHtmlEndpoint:
    def test_import_returns_mbdoc(self, client):
        resp = client.post("/api/v1/publish/import-html", json={
            "article_id": "ep-1",
            "title": "Imported",
            "html": "<h1>Hi</h1><p>Body</p>",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == 0
        doc = data["data"]
        assert doc["id"] == "ep-1"
        assert doc["meta"]["title"] == "Imported"
        assert len(doc["blocks"]) == 2

    def test_import_malicious_returns_200_no_script(self, client):
        resp = client.post("/api/v1/publish/import-html", json={
            "article_id": "ep-2",
            "title": "Mal",
            "html": _fixture("article_malicious.html"),
        })
        assert resp.status_code == 200
        blob = str(resp.json()).lower()
        assert "<script" not in blob
        assert "onerror" not in blob
        assert "javascript:" not in blob

    def test_import_generic_profile_still_strips_script(self, client):
        resp = client.post("/api/v1/publish/import-html", json={
            "article_id": "ep-3",
            "title": "Gen",
            "html": "<div style='display:flex'><script>alert(1)</script>x</div>",
            "profile": "generic",
        })
        assert resp.status_code == 200
        blob = str(resp.json())
        assert "<script" not in blob
        assert "alert(1)" not in blob

    def test_import_bad_article_id_returns_400(self, client):
        resp = client.post("/api/v1/publish/import-html", json={
            "article_id": "../bad",
            "title": "Bad",
            "html": "<p>x</p>",
        })
        assert resp.status_code == 400

    def test_import_markdown_mode(self, client):
        resp = client.post("/api/v1/publish/import-html", json={
            "article_id": "ep-4",
            "title": "MD",
            "mode": "markdown",
            "markdown": "# Hello\n\nWorld",
        })
        assert resp.status_code == 200
        blocks = resp.json()["data"]["blocks"]
        assert blocks[0]["type"] == "markdown"
        assert blocks[0]["source"] == "# Hello\n\nWorld"
