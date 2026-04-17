from app.services.document_projector import article_to_mbdoc, projection_metadata_for


def test_article_to_mbdoc_projects_html_mode():
    article = {
        "id": "a1",
        "title": "Title",
        "mode": "html",
        "html": "<section><p>Hello</p></section>",
        "css": "p{color:red;}",
        "cover": "/images/x.png",
        "author": "Anson",
        "digest": "Digest",
    }

    doc = article_to_mbdoc(article)
    assert doc.id == "a1"
    assert doc.meta.title == "Title"
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "html"
    assert doc.blocks[0].source == article["html"]
    assert doc.blocks[0].css == article["css"]


def test_article_to_mbdoc_projects_markdown_mode():
    article = {
        "id": "a2",
        "title": "Title",
        "mode": "markdown",
        "markdown": "# Hello\n\nWorld",
    }

    doc = article_to_mbdoc(article)
    assert doc.id == "a2"
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "markdown"
    assert doc.blocks[0].source == article["markdown"]


def test_article_to_mbdoc_empty_content_yields_no_blocks():
    article = {
        "id": "a3",
        "title": "Empty",
        "mode": "html",
        "html": "",
        "css": "",
    }

    doc = article_to_mbdoc(article)
    assert doc.blocks == []


def test_article_to_mbdoc_falls_back_to_html_when_markdown_source_empty():
    article = {
        "id": "a4",
        "title": "Fallback",
        "mode": "markdown",
        "markdown": "   ",
        "html": "<p>Fallback HTML</p>",
        "css": "p{color:#333;}",
    }

    doc = article_to_mbdoc(article)
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "html"
    assert doc.blocks[0].source == article["html"]
    assert doc.blocks[0].css == article["css"]


def test_article_to_mbdoc_falls_back_to_markdown_when_html_source_empty():
    article = {
        "id": "a4b",
        "title": "Fallback markdown",
        "mode": "html",
        "html": "   ",
        "css": "   ",
        "markdown": "# Fallback Markdown",
    }

    doc = article_to_mbdoc(article)
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "markdown"
    assert doc.blocks[0].source == article["markdown"]


def test_article_to_mbdoc_projects_simple_image_html_to_image_block():
    article = {
        "id": "a5",
        "title": "Image only",
        "mode": "html",
        "html": '<p><img src="/images/hero.png" alt="Hero" width="640" height="480"></p>',
        "css": "",
    }

    doc = article_to_mbdoc(article)
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "image"
    assert doc.blocks[0].src == "/images/hero.png"
    assert doc.blocks[0].alt == "Hero"
    assert doc.blocks[0].width == 640
    assert doc.blocks[0].height == 480


def test_projection_metadata_marks_single_markdown_block_reversible():
    article = {
        "id": "a6",
        "title": "Markdown",
        "mode": "markdown",
        "markdown": "# Hello",
    }

    doc = article_to_mbdoc(article)
    metadata = projection_metadata_for(doc)
    assert metadata["editability"] == "reversible"
    assert metadata["editableBlockIds"] == ["content_markdown"]


def test_projection_metadata_marks_single_html_block_reversible():
    article = {
        "id": "a7",
        "title": "HTML",
        "mode": "html",
        "html": "<p>Hello</p>",
        "css": "",
    }

    doc = article_to_mbdoc(article)
    metadata = projection_metadata_for(doc)
    assert metadata["editability"] == "reversible"
    assert metadata["editableBlockIds"] == ["content_paragraph_1"]


def test_projection_metadata_marks_non_reversible_projection_informational():
    metadata = projection_metadata_for(
        article_to_mbdoc(
            {
                "id": "a8",
                "title": "Empty",
                "mode": "html",
                "html": "",
                "css": "",
            }
        )
    )
    assert metadata["editability"] == "informational-only"
    assert metadata["editableBlockIds"] == []


def test_article_to_mbdoc_projects_simple_multi_block_html():
    article = {
        "id": "a9",
        "title": "Multi",
        "mode": "html",
        "html": "<h2>Heading</h2><p>Body</p><p><img src='/images/x.png' alt='X'></p>",
        "css": "",
    }

    doc = article_to_mbdoc(article)
    assert [block.type.value for block in doc.blocks] == ["heading", "paragraph", "image"]


def test_projection_metadata_marks_simple_multi_block_html_reversible():
    article = {
        "id": "a10",
        "title": "Multi",
        "mode": "html",
        "html": "<h2>Heading</h2><p>Body</p>",
        "css": "",
    }

    doc = article_to_mbdoc(article)
    metadata = projection_metadata_for(doc)
    assert metadata["editability"] == "reversible"
    assert metadata["editableBlockIds"] == ["content_heading_1", "content_paragraph_2"]


def test_article_to_mbdoc_projects_svg_html_to_svg_block():
    article = {
        "id": "a11",
        "title": "SVG",
        "mode": "html",
        "html": "<svg viewBox='0 0 10 10'><circle cx='5' cy='5' r='5' /></svg>",
        "css": "",
    }

    doc = article_to_mbdoc(article)
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "svg"


def test_article_to_mbdoc_projects_raster_trigger_html_to_raster_block():
    article = {
        "id": "a12",
        "title": "Raster",
        "mode": "html",
        "html": "<div>Card</div>",
        "css": "div{display:grid;grid-template-columns:1fr 1fr;}",
    }

    doc = article_to_mbdoc(article)
    assert len(doc.blocks) == 1
    assert doc.blocks[0].type.value == "raster"
