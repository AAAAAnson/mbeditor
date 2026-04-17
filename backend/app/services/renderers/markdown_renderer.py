"""Renderer for Markdown blocks."""
from __future__ import annotations

import re
from html import escape
from typing import TYPE_CHECKING

from app.models.mbdoc import Block, BlockType, MarkdownBlock
from app.services.legacy_render_pipeline import process_for_wechat
from app.services.renderers.base import BlockRenderer

if TYPE_CHECKING:
    from app.services.block_registry import RenderContext


def _render_inline(text: str) -> str:
    escaped = escape(text)
    escaped = re.sub(
        r'!\[([^\]]*)\]\(([^)]+)\)',
        lambda m: f'<img src="{escape(m.group(2), quote=True)}" alt="{escape(m.group(1), quote=True)}" />',
        escaped,
    )
    escaped = re.sub(
        r'\[([^\]]+)\]\(([^)]+)\)',
        lambda m: f'<a href="{escape(m.group(2), quote=True)}">{m.group(1)}</a>',
        escaped,
    )
    escaped = re.sub(r'`([^`]+)`', r"<code>\1</code>", escaped)
    escaped = re.sub(r'\*\*([^*]+)\*\*', r"<strong>\1</strong>", escaped)
    escaped = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r"<em>\1</em>", escaped)
    return escaped


def _simple_markdown_to_html(source: str) -> str:
    lines = source.splitlines()
    parts: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            parts.append(f"<pre><code>{escape(chr(10).join(code_lines))}</code></pre>")
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            parts.append(f"<h{level}>{_render_inline(heading_match.group(2))}</h{level}>")
            i += 1
            continue

        if stripped.startswith(">"):
            quote_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].lstrip())
                i += 1
            parts.append(f"<blockquote><p>{'<br>'.join(_render_inline(q) for q in quote_lines)}</p></blockquote>")
            continue

        if re.match(r"^[-*]\s+", stripped):
            items: list[str] = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i].strip()):
                item = re.sub(r"^[-*]\s+", "", lines[i].strip())
                items.append(f"<li>{_render_inline(item)}</li>")
                i += 1
            parts.append(f"<ul>{''.join(items)}</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                item = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                items.append(f"<li>{_render_inline(item)}</li>")
                i += 1
            parts.append(f"<ol>{''.join(items)}</ol>")
            continue

        if stripped.startswith("<") and stripped.endswith(">"):
            raw_lines: list[str] = []
            while i < len(lines) and lines[i].strip():
                raw_lines.append(lines[i])
                i += 1
            parts.append("\n".join(raw_lines))
            continue

        paragraph_lines: list[str] = []
        while i < len(lines):
            candidate = lines[i].strip()
            if not candidate:
                break
            if candidate.startswith("```") or re.match(r"^(#{1,6})\s+", candidate):
                break
            if candidate.startswith(">") or re.match(r"^[-*]\s+", candidate) or re.match(r"^\d+\.\s+", candidate):
                break
            paragraph_lines.append(candidate)
            i += 1
        parts.append(f"<p>{' '.join(_render_inline(p) for p in paragraph_lines)}</p>")

    return "\n".join(parts)


def render_markdown_source(source: str) -> str:
    try:
        from markdown_it import MarkdownIt  # type: ignore

        return MarkdownIt("commonmark", {"html": True}).render(source)
    except Exception:
        return _simple_markdown_to_html(source)


class MarkdownRenderer(BlockRenderer):
    block_type = BlockType.MARKDOWN

    def render(self, block: Block, ctx: "RenderContext") -> str:
        assert isinstance(block, MarkdownBlock)
        html = render_markdown_source(block.source)
        return process_for_wechat(html, "")
