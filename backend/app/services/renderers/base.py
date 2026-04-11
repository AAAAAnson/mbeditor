"""BlockRenderer abstract base class."""
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from app.models.mbdoc import BlockType

if TYPE_CHECKING:
    from app.models.mbdoc import Block
    from app.services.block_registry import RenderContext


class BlockRenderer(ABC):
    """Base class for all block renderers.

    Subclasses must:
    - Set class attribute ``block_type`` to the BlockType they handle
    - Implement ``render(block, ctx) -> str`` returning the final HTML
      fragment for that block

    The returned HTML is inserted directly into the concatenated document
    output by ``render_for_wechat``. It MUST already be inline-styled and
    WeChat-compatible — no class attributes, no ``<style>`` tags, no
    ``<script>``.
    """

    block_type: BlockType

    @abstractmethod
    def render(self, block: "Block", ctx: "RenderContext") -> str:
        raise NotImplementedError
