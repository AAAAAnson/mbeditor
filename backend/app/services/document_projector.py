"""Compatibility projection between legacy Article payloads and MBDoc."""
import re
from typing import Iterable

from lxml import etree, html

from app.models.mbdoc import (
    HeadingBlock,
    HtmlBlock,
    ImageBlock,
    MBDoc,
    MBDocMeta,
    MarkdownBlock,
    ParagraphBlock,
    SvgBlock,
    RasterBlock,
)


_IMG_ONLY_RE = re.compile(
    r'^\s*<(?:p|section)?[^>]*>\s*<img\b([^>]*)>\s*</(?:p|section)>\s*$',
    re.IGNORECASE | re.DOTALL,
)


def _parse_img_attrs(attr_text: str) -> dict[str, str]:
    attrs = dict(re.findall(r'(\w+)=["\']([^"\']+)["\']', attr_text))
    return attrs


def _project_simple_image_html(html: str) -> ImageBlock | None:
    match = _IMG_ONLY_RE.match(html.strip())
    if not match:
        return None
    attrs = _parse_img_attrs(match.group(1))
    src = attrs.get("src")
    if not src:
        return None
    width = int(attrs["width"]) if attrs.get("width", "").isdigit() else None
    height = int(attrs["height"]) if attrs.get("height", "").isdigit() else None
    return ImageBlock(
        id="content_image",
        src=src,
        alt=attrs.get("alt", ""),
        width=width,
        height=height,
    )


_RASTER_TRIGGER_RE = re.compile(
    r"display\s*:\s*(grid|flex)|position\s*:\s*absolute|transform\s*:|animation\s*:|filter\s*:|backdrop-filter\s*:|perspective\s*:|grid-template",
    re.IGNORECASE,
)


def _outer_html(node) -> str:
    if isinstance(node, str):
        return node
    return html.tostring(node, encoding="unicode")


def _plain_text_element(node) -> bool:
    if not hasattr(node, "iterchildren"):
        return False
    return len(list(node.iterchildren())) == 0


def _project_fragment(node, index: int):
    if isinstance(node, str):
        text = node.strip()
        if text:
            return ParagraphBlock(id=f"content_paragraph_{index}", text=text)
        return None

    tag = node.tag.lower() if isinstance(node.tag, str) else ""
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"} and _plain_text_element(node):
        return HeadingBlock(
            id=f"content_heading_{index}",
            level=int(tag[1]),
            text=node.text_content().strip(),
        )

    if tag == "p" and _plain_text_element(node):
        text = node.text_content().strip()
        if text:
            return ParagraphBlock(id=f"content_paragraph_{index}", text=text)

    img_block = _project_simple_image_html(_outer_html(node))
    if img_block is not None:
        img_block.id = f"content_image_{index}"
        return img_block

    if tag == "img":
        return ImageBlock(
            id=f"content_image_{index}",
            src=node.attrib.get("src", ""),
            alt=node.attrib.get("alt", ""),
            width=int(node.attrib["width"]) if node.attrib.get("width", "").isdigit() else None,
            height=int(node.attrib["height"]) if node.attrib.get("height", "").isdigit() else None,
        )

    if tag == "svg":
        return SvgBlock(id=f"content_svg_{index}", source=_outer_html(node))

    return HtmlBlock(id=f"content_html_{index}", source=_outer_html(node), css="")


def _project_html_fragments(html_source: str) -> list:
    try:
        fragments = html.fragments_fromstring(html_source)
    except etree.ParserError:
        return [HtmlBlock(id="content_html", source=html_source, css="")]

    blocks = []
    for index, fragment in enumerate(fragments, start=1):
        projected = _project_fragment(fragment, index)
        if projected is not None:
            blocks.append(projected)
    return blocks


def _should_project_as_raster(html_source: str, css: str) -> bool:
    combined = f"{html_source}\n{css}"
    return bool(_RASTER_TRIGGER_RE.search(combined))


def _reversible_block_ids(blocks: Iterable) -> list[str]:
    reversible_types = {"heading", "paragraph", "html", "image", "svg", "raster"}
    return [block.id for block in blocks if block.type.value in reversible_types]


def projection_metadata_for(doc: MBDoc) -> dict:
    if len(doc.blocks) == 1:
        block = doc.blocks[0]
        if block.type.value in {"markdown", "html", "image", "svg", "raster", "heading", "paragraph"}:
            return {
                "editability": "reversible",
                "reason": f"Single {block.type.value} block is reversible.",
                "editableBlockIds": [block.id],
            }

    block_types = {block.type.value for block in doc.blocks}
    if doc.blocks and "markdown" not in block_types:
        editable_block_ids = _reversible_block_ids(doc.blocks)
        if len(editable_block_ids) == len(doc.blocks):
            return {
                "editability": "reversible",
                "reason": "All projected blocks can be written back to legacy HTML.",
                "editableBlockIds": editable_block_ids,
            }

    return {
        "editability": "informational-only",
        "reason": "Projected blocks are informational only until a safe reverse mapping exists.",
        "editableBlockIds": [],
    }


def projected_article_snapshot(article: dict) -> dict:
    doc = article_to_mbdoc(article)
    payload = doc.model_dump()
    payload["projection"] = projection_metadata_for(doc)
    return payload


def article_to_mbdoc(article: dict) -> MBDoc:
    mode = article.get("mode", "html")
    blocks = []
    html_source = article.get("html", "")
    css = article.get("css", "")
    markdown_source = article.get("markdown", "")

    if mode == "markdown":
        if markdown_source.strip():
            blocks.append(MarkdownBlock(id="content_markdown", source=markdown_source))
        elif html_source.strip() or css.strip():
            image_block = _project_simple_image_html(html_source)
            if image_block and not css.strip():
                blocks.append(image_block)
            elif "<svg" in html_source.lower() and not css.strip():
                blocks.append(SvgBlock(id="content_svg", source=html_source))
            else:
                blocks.append(HtmlBlock(id="content_html", source=html_source, css=css))
    else:
        if html_source.strip():
            image_block = _project_simple_image_html(html_source)
            if image_block and not css.strip():
                blocks.append(image_block)
            elif "<svg" in html_source.lower() and not css.strip():
                blocks.append(SvgBlock(id="content_svg", source=html_source))
            elif _should_project_as_raster(html_source, css):
                blocks.append(RasterBlock(id="content_raster", html=html_source, css=css))
            elif not css.strip():
                blocks.extend(_project_html_fragments(html_source))
            else:
                blocks.append(HtmlBlock(id="content_html", source=html_source, css=css))
        elif markdown_source.strip():
            blocks.append(MarkdownBlock(id="content_markdown", source=markdown_source))

    return MBDoc(
        id=article["id"],
        meta=MBDocMeta(
            title=article.get("title", ""),
            author=article.get("author", ""),
            digest=article.get("digest", ""),
            cover=article.get("cover", ""),
        ),
        blocks=blocks,
    )
