"""Guard: the shipped demo article renders with only allowlisted properties.

This fixture is the canary for MBEditor's WeChat-safe authoring contract.
If someone changes the demo (or the sanitizer) in a way that leaks a
forbidden CSS property into any style= attribute, this test fails.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.models.mbdoc import MBDoc
from app.services.block_registry import RenderContext
from app.services.render_for_wechat import render_for_wechat
from app.services.wechat_sanitize import (
    ALLOWED_STYLE_PROPERTIES,
    sanitize_for_wechat,
)


DEMO_PATH = (
    Path(__file__).parent.parent.parent
    / "docs"
    / "cli"
    / "examples"
    / "demo_article.json"
)


@pytest.fixture(scope="module")
def demo_html() -> str:
    doc = MBDoc.model_validate_json(DEMO_PATH.read_text(encoding="utf-8"))
    # Run each HtmlBlock.source through the sanitizer so we test what the
    # publish / copy path actually ships. render_for_wechat already pipes
    # HtmlBlock output through the HtmlRenderer; we additionally pass the
    # final fragment through sanitize_for_wechat to match the legacy copy
    # path used by ActionPanel.
    fragment = render_for_wechat(doc, RenderContext(upload_images=False))
    return sanitize_for_wechat(fragment)


def _style_props(html: str) -> set[str]:
    props: set[str] = set()
    for style in re.findall(r'style="([^"]*)"', html):
        for decl in style.split(";"):
            decl = decl.strip()
            if ":" not in decl:
                continue
            props.add(decl.split(":", 1)[0].strip().lower())
    return props


def _count_in_styles(html: str, token: str) -> int:
    total = 0
    for style in re.findall(r'style="([^"]*)"', html):
        total += style.count(token)
    return total


def _count_declarations_in_styles(html: str, prop: str) -> int:
    """Count occurrences of `<prop>:` as a standalone CSS property name
    (word-bounded to avoid false positives like `border:` matching `order:`)."""
    pattern = re.compile(r'(?:^|;|\s)\s*' + re.escape(prop) + r'\s*:')
    total = 0
    for style in re.findall(r'style="([^"]*)"', html):
        total += len(pattern.findall(style))
    return total


def test_demo_article_file_exists():
    assert DEMO_PATH.exists(), f"demo article missing at {DEMO_PATH}"


def test_demo_article_is_valid_mbdoc():
    doc = MBDoc.model_validate_json(DEMO_PATH.read_text(encoding="utf-8"))
    assert doc.id == "demo_wechat_safe"
    assert len(doc.blocks) >= 5
    assert doc.meta.title


def test_demo_article_uses_only_allowlisted_properties(demo_html: str):
    surviving = _style_props(demo_html)
    forbidden = surviving - ALLOWED_STYLE_PROPERTIES
    assert not forbidden, (
        f"Demo article leaked forbidden style properties: {forbidden}\n"
        f"HTML (first 500 chars): {demo_html[:500]}"
    )


def test_demo_article_has_no_banned_style_tokens(demo_html: str):
    # Literal substrings (safe to count as-is; no false-positive tokens here).
    banned_literals = [
        "display:flex",
        "display:grid",
        "display:inline-flex",
        "display:inline-grid",
        "position:absolute",
        "position:fixed",
        "!important",
    ]
    # Property names checked with word boundaries so e.g. `order:` does
    # not match `border:`.
    banned_properties = [
        "gap",
        "justify-content",
        "justify-items",
        "align-items",
        "align-content",
        "align-self",
        "flex",
        "flex-direction",
        "flex-wrap",
        "flex-grow",
        "flex-shrink",
        "flex-basis",
        "order",
        "grid-template",
        "grid-template-columns",
        "grid-template-rows",
        "animation",
        "transform",
        "transition",
        "backdrop-filter",
        "cursor",
        "user-select",
        "pointer-events",
        "will-change",
        "float",
        "clear",
    ]
    leaks_literal = [t for t in banned_literals if _count_in_styles(demo_html, t) > 0]
    leaks_props = [
        p for p in banned_properties if _count_declarations_in_styles(demo_html, p) > 0
    ]
    assert not leaks_literal and not leaks_props, (
        f"Demo article leaked banned tokens in style attrs: "
        f"literals={leaks_literal}  properties={leaks_props}"
    )


def test_demo_article_preserves_key_visual_features(demo_html: str):
    """These features are in the allowlist and must survive intact."""
    assert "linear-gradient" in demo_html, "hero gradient disappeared"
    assert _count_in_styles(demo_html, "display:inline-block") >= 4, (
        "inline-block layout count dropped below baseline"
    )
    assert _count_in_styles(demo_html, "vertical-align:middle") >= 3
    assert _count_in_styles(demo_html, "box-shadow") >= 3
    assert _count_in_styles(demo_html, "letter-spacing") >= 3
    # Button <a> should be auto-wrapped in a <table> by the sanitizer.
    assert demo_html.count("<table") >= 2


def test_demo_article_has_no_unsafe_markup(demo_html: str):
    assert "<style" not in demo_html
    assert "<script" not in demo_html
    assert "<link" not in demo_html
    assert "class=" not in demo_html
    assert "data-" not in demo_html
    assert "onclick" not in demo_html


def test_demo_article_preview_and_publish_parity(monkeypatch):
    """The copy-vs-publish invariant: only <img src> may differ."""
    doc = MBDoc.model_validate_json(DEMO_PATH.read_text(encoding="utf-8"))

    preview = sanitize_for_wechat(
        render_for_wechat(doc, RenderContext(upload_images=False))
    )
    publish = sanitize_for_wechat(
        render_for_wechat(
            doc,
            RenderContext(
                upload_images=True,
                image_uploader=lambda data, name: f"https://mmbiz.qpic.cn/{name}",
            ),
        )
    )
    # Demo article has no ImageBlock, so they must be byte-identical.
    assert preview == publish, (
        "Preview and publish diverge on a no-image demo article - this is "
        "a regression in the sanitizer or block renderer determinism."
    )
