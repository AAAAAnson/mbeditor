"""
MBDoc — MBEditor Document block-based model.

MBDoc is the canonical document format for MBEditor. It replaces the flat
`{html, css, js, markdown}` article model with a block-list structure that
can mix HTML, Markdown, SVG, and rasterized blocks.

Every block has a `type` discriminator and its own shape. Renderers in
`app/services/renderers/` operate on individual blocks; the top-level
`render_for_wechat` function composes them into final content HTML.
"""
import re
from enum import Enum
from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_SAFE_ID_RE = re.compile(r'^[A-Za-z0-9_-]+$')


def _validate_safe_id(v: str) -> str:
    if not _SAFE_ID_RE.match(v):
        raise ValueError(
            "id must contain only letters, digits, '-' and '_' "
            "(no path separators, no unicode)"
        )
    return v


class BlockType(str, Enum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    MARKDOWN = "markdown"
    HTML = "html"
    IMAGE = "image"
    SVG = "svg"
    RASTER = "raster"


class _BlockBase(BaseModel):
    """Base class for all blocks. Not instantiated directly."""
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)

    @field_validator("id")
    @classmethod
    def _id_safe(cls, v: str) -> str:
        return _validate_safe_id(v)


class HeadingBlock(_BlockBase):
    type: Literal[BlockType.HEADING] = BlockType.HEADING
    level: int = Field(..., ge=1, le=6)
    text: str = ""


class ParagraphBlock(_BlockBase):
    type: Literal[BlockType.PARAGRAPH] = BlockType.PARAGRAPH
    text: str = ""


class MarkdownBlock(_BlockBase):
    type: Literal[BlockType.MARKDOWN] = BlockType.MARKDOWN
    source: str = ""


class HtmlBlock(_BlockBase):
    type: Literal[BlockType.HTML] = BlockType.HTML
    source: str = ""
    css: str = ""  # optional per-block CSS that gets inlined into source


class ImageBlock(_BlockBase):
    type: Literal[BlockType.IMAGE] = BlockType.IMAGE
    src: str
    alt: str = ""
    width: Optional[int] = None
    height: Optional[int] = None

    @field_validator("src")
    @classmethod
    def _src_scheme_must_be_safe(cls, v: str) -> str:
        lowered = v.lower().lstrip()
        if lowered.startswith("javascript:") or lowered.startswith("data:"):
            raise ValueError(
                "ImageBlock src must not use javascript: or data: scheme"
            )
        return v


class SvgBlock(_BlockBase):
    type: Literal[BlockType.SVG] = BlockType.SVG
    source: str  # raw <svg>...</svg> string

    @field_validator("source")
    @classmethod
    def must_contain_svg_tag(cls, v: str) -> str:
        if "<svg" not in v.lower():
            raise ValueError("SVG block source must contain a <svg> element")
        return v


class RasterBlock(_BlockBase):
    """A block whose visual effect is delivered as a rasterized PNG.

    Use this for content that cannot be expressed in WeChat-compatible HTML
    or SVG: CSS Grid layouts, 3D transforms, animated backgrounds, etc.
    The Stage-5 rasterization worker will render (html + css) through
    headless Chromium into a PNG, upload it, and emit <img> in the final
    output.
    """
    type: Literal[BlockType.RASTER] = BlockType.RASTER
    html: str
    css: str = ""
    width: int = 750  # target viewport width for rasterization
    # Height is computed from the content by the renderer.


Block = Annotated[
    Union[
        HeadingBlock,
        ParagraphBlock,
        MarkdownBlock,
        HtmlBlock,
        ImageBlock,
        SvgBlock,
        RasterBlock,
    ],
    Field(discriminator="type"),
]


class MBDocMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""


class MBDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    version: Literal["1"] = "1"
    meta: MBDocMeta = Field(default_factory=MBDocMeta)
    blocks: List[Block] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _id_safe(cls, v: str) -> str:
        return _validate_safe_id(v)

    @model_validator(mode="after")
    def _block_ids_must_be_unique(self) -> "MBDoc":
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("MBDoc blocks must have unique ids")
        return self
