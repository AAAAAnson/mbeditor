"""Convert legacy Article format to MBDoc block-based format.

Reverse-import walks an HTML document into MBDoc blocks using BeautifulSoup
(lxml parser, falling back to the stdlib ``html.parser`` if lxml is
unavailable). The walker preserves structure the old ``html.parser`` block
parser dropped: lists, code blocks, figures, standalone links, blockquotes,
tables, and — the headline fidelity fix — full SVG subtrees (including
``<animate>``/``<defs>``/child attributes/``viewBox``) via node serialization
rather than hand-reconstructed open tags.

Any HTML that lands inside an ``HtmlBlock.source`` is passed through
``render_profiles.strip_dangerous`` first, so an inline ``<script>`` or
``on*`` handler can never survive import.
"""
import re
import secrets
import uuid
from typing import Dict, List, Optional

from app.models.mbdoc import (
    MBDoc,
    MBDocMeta,
    Block,
    HeadingBlock,
    ParagraphBlock,
    MarkdownBlock,
    HtmlBlock,
    ImageBlock,
    SvgBlock,
)
from app.services.render_profiles import strip_dangerous
from app.services.wechat_sanitize import _extract_svg_subtrees


def _generate_block_id() -> str:
    """Generate a unique block ID."""
    return uuid.uuid4().hex[:8]


# Placeholder comment marker the SVG pre-extraction leaves in the HTML before
# bs4 parsing. bs4 keeps comments intact, so the walker can map each comment
# back to its verbatim (case-preserving) SVG source. Reusing
# wechat_sanitize._extract_svg_subtrees guarantees identical nesting-aware,
# attribute-aware subtree boundaries as the render path.
_SVG_PLACEHOLDER_RE = re.compile(r'SVG_SANITIZE_PLACEHOLDER_([0-9a-f]+)_(\d+)')


def _make_soup(html: str):
    """Parse ``html`` with bs4, preferring lxml and falling back to stdlib."""
    from bs4 import BeautifulSoup

    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")


# Tags handled directly by the walker; anything else with structure is wrapped
# as an HtmlBlock or recursed into.
_HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
_GENERIC_CONTAINERS = {"div", "section", "article", "main", "header", "footer",
                       "aside", "nav", "hgroup", "body", "html", "[document]"}
_INLINE_PASSTHROUGH_HTML = {"ul", "ol", "blockquote", "table", "pre"}


def _node_html(node) -> str:
    """Serialize a bs4 element back to an HTML string (outerHTML)."""
    return str(node)


def _int_attr(value) -> Optional[int]:
    """Parse an integer-valued width/height attribute, or None."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if value is None:
        return None
    s = str(value).strip().lower().replace("px", "").strip()
    try:
        n = int(float(s))
    except (ValueError, TypeError):
        return None
    return n if n > 0 else None


def _emit_image(node, blocks: List[Block]) -> None:
    """Emit an ImageBlock for an <img>, dropping unsafe src instead of 500."""
    src = node.get("src", "") or ""
    if not src:
        return
    alt = node.get("alt", "") or ""
    width = _int_attr(node.get("width"))
    height = _int_attr(node.get("height"))
    try:
        blocks.append(ImageBlock(
            id=_generate_block_id(),
            src=src,
            alt=alt,
            width=width,
            height=height,
        ))
    except ValueError:
        # javascript:/data: src rejected by validator — drop the node.
        return


def _emit_svg_source(source: str, blocks: List[Block]) -> None:
    """Emit an SvgBlock carrying the FULL verbatim svg subtree.

    This is the headline fidelity fix: the entire subtree (defs/animate/child
    attrs/viewBox, including camelCase attribute names like ``attributeName``)
    is preserved verbatim because the SVG is sliced from the ORIGINAL source
    string before bs4 (which lowercases SVG attribute names) ever sees it.
    SVG source is NOT run through strip_dangerous here — interactivity
    (animate begin=click, id refs) must survive; the WeChat render path
    validates SVG later via SvgRenderer/svg_validator. (The pre-extraction in
    ``_extract_svg_subtrees`` already strips <script>/on* from the subtree.)
    """
    if "<svg" not in source.lower():
        return
    try:
        blocks.append(SvgBlock(id=_generate_block_id(), source=source))
    except ValueError:
        return


def _restore_svg_placeholders(html: str, svg_fragments: Dict[int, str]) -> str:
    """Splice verbatim SVG markup back into any placeholder comments."""
    if not svg_fragments or "SVG_SANITIZE_PLACEHOLDER" not in html:
        return html

    # Match the full placeholder comment (bs4 keeps it as a comment node).
    # The regex has exactly one capture group (the fragment index), so the
    # lambda reads group(1).
    return re.sub(
        r'<!--\s*SVG_SANITIZE_PLACEHOLDER_[0-9a-f]+_(\d+)\s*-->',
        lambda m: svg_fragments.get(int(m.group(1)), ""),
        html,
    )


def _emit_html(node, blocks: List[Block], svg_fragments: Dict[int, str]) -> None:
    """Emit a sanitized HtmlBlock carrying a node's serialized markup.

    Any nested SVG placeholder comment is restored to its verbatim markup
    first, then the dangerous-subset strip runs (which preserves SVG).
    """
    source = _restore_svg_placeholders(_node_html(node), svg_fragments)
    source = strip_dangerous(source)
    if not source.strip():
        return
    blocks.append(HtmlBlock(id=_generate_block_id(), source=source))


def _emit_html_str(html: str, blocks: List[Block]) -> None:
    source = strip_dangerous(html)
    if not source.strip():
        return
    blocks.append(HtmlBlock(id=_generate_block_id(), source=source))


def _emit_figure(node, blocks: List[Block]) -> None:
    """<figure>: emit inner <img> as ImageBlock then <figcaption> as paragraph."""
    img = node.find("img")
    if img is not None:
        _emit_image(img, blocks)
    cap = node.find("figcaption")
    if cap is not None:
        text = cap.get_text(strip=True)
        if text:
            blocks.append(ParagraphBlock(id=_generate_block_id(), text=text))


def _is_standalone_anchor(node) -> bool:
    """True if <a href> is block-level (its only meaningful content is text/img)."""
    if node.name != "a" or not node.get("href"):
        return False
    return True


def _svg_for_comment(text: str, svg_fragments: Dict[int, str]) -> Optional[str]:
    """If a comment is an SVG placeholder, return its verbatim SVG source."""
    m = _SVG_PLACEHOLDER_RE.search(text)
    if not m:
        return None
    idx = int(m.group(2))
    return svg_fragments.get(idx)


def _walk(node, blocks: List[Block], svg_fragments: Dict[int, str]) -> None:
    """Recursively walk a node's direct children into blocks (document order)."""
    from bs4 import NavigableString, Tag, Comment

    for child in node.children:
        if isinstance(child, Comment):
            svg_src = _svg_for_comment(str(child), svg_fragments)
            if svg_src is not None:
                _emit_svg_source(svg_src, blocks)
            continue
        if isinstance(child, NavigableString):
            text = str(child).strip()
            if text:
                blocks.append(ParagraphBlock(id=_generate_block_id(), text=text))
            continue
        if not isinstance(child, Tag):
            continue

        name = (child.name or "").lower()

        if name in _HEADINGS:
            text = child.get_text(strip=True)
            if text:
                blocks.append(HeadingBlock(
                    id=_generate_block_id(),
                    level=int(name[1]),
                    text=text,
                ))
        elif name == "p":
            text = child.get_text(strip=True)
            if text:
                blocks.append(ParagraphBlock(id=_generate_block_id(), text=text))
        elif name == "img":
            _emit_image(child, blocks)
        elif name == "svg":
            # Fallback for an <svg> bs4 saw directly (no placeholder) — serialize
            # it (attribute case may be lowercased, but content survives).
            _emit_svg_source(_node_html(child), blocks)
        elif name == "figure":
            _emit_figure(child, blocks)
        elif name in _INLINE_PASSTHROUGH_HTML:
            # ul/ol/blockquote/table/pre — preserve as sanitized HtmlBlock.
            _emit_html(child, blocks, svg_fragments)
        elif name == "a" and _is_standalone_anchor(child):
            # Standalone link: preserve href via an HtmlBlock.
            _emit_html(child, blocks, svg_fragments)
        elif name in _GENERIC_CONTAINERS:
            # Recurse — do not drop, do not emit a stray paragraph.
            _walk(child, blocks, svg_fragments)
        elif name in ("script", "style"):
            continue
        else:
            # Unrecognized element with markup we don't model: if it has only
            # text, treat as a paragraph; otherwise carry its outerHTML as a
            # sanitized HtmlBlock rather than silently dropping it.
            if not _has_markup(child):
                text = child.get_text(strip=True)
                if text:
                    blocks.append(ParagraphBlock(id=_generate_block_id(), text=text))
            else:
                _emit_html(child, blocks, svg_fragments)


def _has_markup(node) -> bool:
    """True if the node contains any child element tags (not just text)."""
    from bs4 import Tag

    return any(isinstance(c, Tag) for c in node.children)


def _find_root(soup):
    """Return the node whose children we should walk (body, or the soup)."""
    body = soup.find("body")
    if body is not None:
        return body
    return soup


def _parse_html_to_blocks(html: str) -> List[Block]:
    """Parse an HTML string into a list of blocks.

    SVG subtrees are sliced out of the RAW source first (preserving camelCase
    attribute names that bs4's HTML parser would otherwise lowercase), replaced
    with inert placeholder comments, then the placeholdered HTML is walked by
    bs4. Each placeholder maps back to its verbatim SVG markup.
    """
    if not html or not html.strip():
        return []

    nonce = secrets.token_hex(8)
    placeholdered, fragment_list = _extract_svg_subtrees(html, nonce)
    svg_fragments: Dict[int, str] = {i: f for i, f in enumerate(fragment_list)}

    try:
        soup = _make_soup(placeholdered)
        root = _find_root(soup)
        blocks: List[Block] = []
        _walk(root, blocks, svg_fragments)
        if not blocks:
            # Nothing structural matched — fall back to a sanitized whole-doc
            # HtmlBlock so content is never silently dropped (with SVGs restored).
            restored = _restore_svg_placeholders(placeholdered, svg_fragments)
            _emit_html_str(restored, blocks)
        return blocks
    except Exception:
        # Whole-doc fallback (sanitized — never store raw script).
        fallback: List[Block] = []
        _emit_html_str(html, fallback)
        return fallback


def _has_svg_content(html: str) -> bool:
    """Check if HTML contains SVG elements."""
    return "<svg" in html.lower()


def article_to_mbdoc(
    article_id: str,
    title: str,
    html: str,
    css: str = "",
    markdown: str = "",
    mode: str = "html",
    author: str = "",
    digest: str = "",
    cover: str = "",
) -> MBDoc:
    """Convert a legacy Article to MBDoc format.

    Args:
        article_id: The article's unique identifier
        title: Article title
        html: HTML content
        css: Optional CSS (inlined into a leading HtmlBlock when whole-doc
            fallback is used, or kept on the document for renderers)
        markdown: Markdown content (used if mode is "markdown")
        mode: "html" or "markdown"
        author: Author name
        digest: Article digest/summary
        cover: Cover image URL

    Returns:
        MBDoc with appropriate blocks
    """
    blocks: List[Block] = []

    if mode == "markdown" and markdown:
        blocks.append(MarkdownBlock(
            id=_generate_block_id(),
            source=markdown,
        ))
    elif html:
        blocks = _parse_html_to_blocks(html)
        # If css was supplied and the import collapsed to a single HtmlBlock
        # (whole-doc fallback), attach the css so it inlines at render time.
        if css and len(blocks) == 1 and isinstance(blocks[0], HtmlBlock):
            blocks[0] = HtmlBlock(
                id=blocks[0].id,
                source=blocks[0].source,
                css=css,
            )

    if not blocks:
        blocks.append(ParagraphBlock(
            id=_generate_block_id(),
            text="",
        ))

    return MBDoc(
        id=article_id,
        meta=MBDocMeta(
            title=title,
            author=author,
            digest=digest,
            cover=cover,
        ),
        blocks=blocks,
    )


def mbdoc_to_article(mbdoc: MBDoc) -> dict:
    """Convert MBDoc back to legacy Article format.

    This is a lossy conversion - block structure may be simplified.
    """
    html_parts: List[str] = []
    markdown_parts: List[str] = []

    for block in mbdoc.blocks:
        if isinstance(block, HeadingBlock):
            html_parts.append(f"<h{block.level}>{block.text}</h{block.level}>")
            markdown_parts.append(f"{'#' * block.level} {block.text}")
        elif isinstance(block, ParagraphBlock):
            html_parts.append(f"<p>{block.text}</p>")
            markdown_parts.append(block.text)
        elif isinstance(block, MarkdownBlock):
            markdown_parts.append(block.source)
            html_parts.append(f"<pre>{block.source}</pre>")
        elif isinstance(block, HtmlBlock):
            if block.css:
                html_parts.append(f"<style>{block.css}</style>")
            html_parts.append(block.source)
        elif isinstance(block, ImageBlock):
            html_parts.append(f'<img src="{block.src}" alt="{block.alt}">')
            markdown_parts.append(f"![{block.alt}]({block.src})")
        elif isinstance(block, SvgBlock):
            html_parts.append(block.source)

    return {
        "title": mbdoc.meta.title,
        "html": "\n".join(html_parts),
        "css": "",
        "js": "",
        "markdown": "\n\n".join(markdown_parts),
        "mode": "html",
        "author": mbdoc.meta.author,
        "digest": mbdoc.meta.digest,
        "cover": mbdoc.meta.cover,
    }
