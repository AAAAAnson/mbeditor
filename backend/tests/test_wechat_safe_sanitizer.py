"""Tests for the WeChat-safe sanitizer allowlist refactor.

The allowlist gate is the load-bearing invariant: every style= attribute
surviving ``sanitize_for_wechat`` must contain ONLY properties from
``ALLOWED_STYLE_PROPERTIES``, with ``display`` and ``position`` further
constrained. This guarantees that WeChat's paste-handler and draft-API
server-filter both see the same declarations, eliminating the drift
observed when layout uses flex/grid/absolute.
"""
from __future__ import annotations

import re

import pytest

from app.services.wechat_sanitize import (
    ALLOWED_STYLE_PROPERTIES,
    _filter_style_declarations,
    _normalize_style_declarations,
    sanitize_for_wechat,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _style_props(html: str) -> set[str]:
    props: set[str] = set()
    for style in re.findall(r'style="([^"]*)"', html):
        for decl in style.split(';'):
            decl = decl.strip()
            if ':' not in decl:
                continue
            props.add(decl.split(':', 1)[0].strip().lower())
    return props


def _prop_values(html: str, prop: str) -> list[str]:
    vals: list[str] = []
    for style in re.findall(r'style="([^"]*)"', html):
        for decl in style.split(';'):
            decl = decl.strip()
            if ':' not in decl:
                continue
            p, v = decl.split(':', 1)
            if p.strip().lower() == prop:
                vals.append(v.strip())
    return vals


# ---------------------------------------------------------------------------
# allowlist invariant
# ---------------------------------------------------------------------------


def test_output_contains_only_allowlisted_properties():
    dangerous = (
        '<section style="display:flex; gap:10px; justify-content:space-between; '
        'align-items:center; order:2; flex-wrap:wrap; grid-template-columns:1fr 1fr; '
        'float:left; cursor:pointer; user-select:none; pointer-events:none; '
        'will-change:transform; transform:translateY(-2px); transition:all .3s; '
        'animation:fadeIn .4s; backdrop-filter:blur(8px); '
        'color:#222; font-size:16px; padding:12px;">hi</section>'
    )
    out = sanitize_for_wechat(dangerous)
    surviving = _style_props(out)
    forbidden = surviving - ALLOWED_STYLE_PROPERTIES
    assert not forbidden, f"Forbidden properties leaked: {forbidden}"


def test_flex_display_is_demoted():
    html = '<section style="display:flex; color:#000;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'display:flex' not in out
    assert 'display' not in _style_props(out), "flex display should be dropped entirely"
    assert 'color:#000' in out


def test_grid_display_is_demoted():
    html = '<section style="display:grid; grid-template-columns:1fr 2fr; color:#111;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'display' not in _style_props(out)
    assert 'grid-template-columns' not in out
    assert 'color:#111' in out


def test_inline_flex_is_dropped():
    html = '<section style="display:inline-flex; padding:4px;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'display' not in _style_props(out)
    assert 'padding:4px' in out


def test_important_is_stripped():
    html = '<img style="max-width:100% !important; width:200px !important; height:100px;" src="x"/>'
    out = sanitize_for_wechat(html)
    assert '!important' not in out
    # values still present, just without the !important tag
    assert 'max-width:100%' in out
    assert 'width:200px' in out
    assert 'height:100px' in out


def test_position_absolute_is_hidden():
    html = '<section style="position:absolute; top:10px; color:red;">overlay</section>'
    out = sanitize_for_wechat(html)
    assert 'position:absolute' not in out
    assert 'display:none' in out


def test_position_fixed_is_hidden():
    html = '<section style="position:fixed; color:red;">overlay</section>'
    out = sanitize_for_wechat(html)
    assert 'position:fixed' not in out
    assert 'display:none' in out


def test_position_relative_is_preserved():
    html = '<section style="position:relative; color:#222;">body</section>'
    out = sanitize_for_wechat(html)
    assert 'position:relative' in out


def test_linear_gradient_is_preserved():
    html = (
        '<section style="background: linear-gradient(135deg, #E63946 0%, #C1272D 100%);'
        ' padding: 24px;">hero</section>'
    )
    out = sanitize_for_wechat(html)
    assert 'linear-gradient' in out
    assert 'background' in _style_props(out)


def test_inline_block_and_vertical_align_preserved():
    """The script's core 'fake flex' pattern: inline-block + vertical-align."""
    html = (
        '<section style="display:inline-block; vertical-align:middle; width:44px;">'
        '01'
        '</section>'
    )
    out = sanitize_for_wechat(html)
    assert 'display:inline-block' in out
    assert 'vertical-align:middle' in out
    assert 'width:44px' in out


def test_box_shadow_preserved():
    html = '<section style="box-shadow:0 2px 6px rgba(0,0,0,0.1); padding:12px;">card</section>'
    out = sanitize_for_wechat(html)
    assert 'box-shadow' in out


def test_letter_spacing_preserved():
    html = '<section style="letter-spacing:4px; font-weight:bold;">TAG</section>'
    out = sanitize_for_wechat(html)
    assert 'letter-spacing:4px' in out


def test_class_id_data_attrs_removed():
    html = (
        '<section class="foo bar" id="x" data-meta="y" onclick="hi()" '
        'style="color:#111;">text</section>'
    )
    out = sanitize_for_wechat(html)
    assert 'class=' not in out
    assert 'id=' not in out
    assert 'data-' not in out
    assert 'onclick' not in out
    assert 'color:#111' in out


def test_style_and_script_blocks_removed():
    html = (
        '<style>.a{color:red;}</style>'
        '<script>alert(1)</script>'
        '<section style="color:#111;">hi</section>'
    )
    out = sanitize_for_wechat(html)
    assert '<style' not in out
    assert '<script' not in out
    assert 'color:#111' in out


def test_background_solid_color_normalized():
    html = '<section style="background: #abc; padding:4px;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'background-color:#abc' in out or 'background-color: #abc' in out
    assert 'background:#abc' not in out.replace(' ', '')


def test_float_and_clear_stripped():
    html = '<section style="float:left; clear:both; color:#222;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'float' not in out
    assert 'clear' not in out
    assert 'color:#222' in out


def test_div_rewritten_to_section():
    html = '<div style="color:#111;">x</div>'
    out = sanitize_for_wechat(html)
    assert '<div' not in out
    assert '<section' in out


def test_empty_style_attribute_removed():
    html = '<section style="transform:scale(1.1); animation:x 1s;">x</section>'
    out = sanitize_for_wechat(html)
    # All three properties are forbidden; the resulting style="" should be dropped
    assert 'style=""' not in out
    assert 'style=' not in out or ('style=' in out and re.search(r'style="[^"]+"', out))


def test_linear_gradient_preserves_background_property_not_background_color():
    """background:linear-gradient(...) must stay as `background:...` (not converted)."""
    html = '<section style="background:linear-gradient(135deg,#fff,#000); padding:4px;">hero</section>'
    out = sanitize_for_wechat(html)
    assert 'background:linear-gradient' in out or 'background: linear-gradient' in out
    # Should NOT have been normalized away
    assert 'linear-gradient' in out


# ---------------------------------------------------------------------------
# direct unit tests for _filter_style_declarations
# ---------------------------------------------------------------------------


def test_filter_declarations_drops_unknown_properties():
    out = _filter_style_declarations('color:red; foo-bar:baz; padding:4px')
    assert 'foo-bar' not in out
    assert 'color:red' in out
    assert 'padding:4px' in out


def test_filter_declarations_value_constraint_on_display():
    assert _filter_style_declarations('display:block') == 'display:block'
    assert _filter_style_declarations('display:inline-block') == 'display:inline-block'
    assert _filter_style_declarations('display:flex') == ''
    assert _filter_style_declarations('display:grid') == ''


def test_filter_declarations_value_constraint_on_position():
    assert _filter_style_declarations('position:relative') == 'position:relative'
    assert _filter_style_declarations('position:static') == 'position:static'
    assert _filter_style_declarations('position:absolute') == ''


def test_normalize_sets_hide_flag_for_absolute():
    _, hide = _normalize_style_declarations('position:absolute; top:0')
    assert hide is True


def test_normalize_no_hide_flag_for_relative():
    _, hide = _normalize_style_declarations('position:relative; top:0')
    assert hide is False


# ---------------------------------------------------------------------------
# button-anchor legacy behavior preserved
# ---------------------------------------------------------------------------


def test_button_anchor_still_wrapped_in_table():
    html = (
        '<a href="https://example.com" '
        'style="display:inline-block; background-color:#fff; color:#000; '
        'padding:12px 32px; border-radius:24px;">Click</a>'
    )
    out = sanitize_for_wechat(html)
    assert '<table' in out
    assert '<td' in out
    assert 'href="https://example.com"' in out


def test_button_anchor_gradient_falls_back_to_solid_hex():
    # `<a>` styled-as-button with `background:linear-gradient(...)` — WeChat
    # ignores `background-color: linear-gradient(...)` (invalid CSS) and won't
    # honor a `background:` shorthand on a `<td>` either, so the sanitizer
    # has to derive a solid hex fallback from the first color stop.
    html = (
        '<a href="https://example.com" '
        'style="display:inline-block; padding:10px 22px; '
        'background:linear-gradient(135deg,#ff5b67 0%,#ff3645 100%); '
        'color:#ffffff; border-radius:22px; text-decoration:none;">Free</a>'
    )
    out = sanitize_for_wechat(html)
    assert 'bgcolor="#ff5b67"' in out, out
    # background-color must be a hex, never a gradient string
    assert 'background-color:linear-gradient' not in out
    assert 'background-color:#ff5b67' in out
    # gradient survives in `background` for renderers that support it
    assert 'background:linear-gradient' in out
    assert 'href="https://example.com"' in out


# ---------------------------------------------------------------------------
# realistic WeChat-safe fragment passes through clean
# ---------------------------------------------------------------------------


def test_wechat_safe_fragment_survives_roundtrip():
    """Section+inline-block layout like the script's reference article."""
    html = (
        '<section style="padding:20px; background-color:#FFF8F2;">'
        '<section style="background:linear-gradient(135deg,#E63946,#C1272D); '
        'padding:40px 24px; border-radius:0 0 24px 24px; text-align:center;">'
        '<section style="font-size:30px; font-weight:bold; color:#fff; '
        'line-height:1.3; margin-bottom:6px;">Title</section>'
        '<section style="font-size:14px; color:#fff; line-height:1.7; '
        'padding:0 12px; margin-bottom:24px; opacity:0.95;">Subtitle</section>'
        '</section>'
        '<section style="padding:24px 18px;">'
        '<section style="display:inline-block; vertical-align:middle; '
        'width:44px; height:44px; line-height:44px; text-align:center; '
        'background-color:#C1272D; color:#fff; font-size:18px; '
        'font-weight:bold; border-radius:8px; '
        'box-shadow:0 4px 10px rgba(230,57,70,0.3);">01</section>'
        '<section style="display:inline-block; vertical-align:middle; '
        'margin-left:12px;">'
        '<section style="font-size:18px; font-weight:bold; color:#1A1A1A; '
        'line-height:1.3;">Heading</section>'
        '<section style="font-size:11px; color:#999; letter-spacing:1.5px; '
        'font-weight:bold; margin-top:2px;">SUBHEAD</section>'
        '</section>'
        '</section>'
        '</section>'
    )
    out = sanitize_for_wechat(html)
    props = _style_props(out)
    forbidden = props - ALLOWED_STYLE_PROPERTIES
    assert not forbidden, f"Leaked properties: {forbidden}"
    assert 'linear-gradient' in out
    assert 'display:inline-block' in out
    assert 'vertical-align:middle' in out
    assert 'box-shadow' in out
    assert 'letter-spacing' in out
    assert 'opacity' in out


# ---------------------------------------------------------------------------
# table-layout: fixed injection
# ---------------------------------------------------------------------------


def test_table_layout_fixed_injected_on_step_list_pattern() -> None:
    """The numbered-step list pattern (width:100% table + width:30px digit
    cell) gets table-layout:fixed so the digit column actually stays at
    30px in WeChat's preview instead of collapsing to single-char width."""
    html = (
        '<table cellpadding="0" cellspacing="0" border="0" '
        'style="width:100%;border-collapse:collapse;">'
        '<tr>'
        '<td style="width:30px;padding:0 0 14px 0;vertical-align:top;">'
        '<span style="font-size:12px;font-weight:700;">01</span>'
        '</td>'
        '<td style="padding:0 0 14px 0;vertical-align:top;">'
        '<span>step body</span>'
        '</td>'
        '</tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m, f"table tag missing in output: {out}"
    assert 'table-layout:fixed' in table_m.group(0), f"Expected fixed in {table_m.group(0)}"


def test_table_layout_not_injected_when_no_explicit_td_width() -> None:
    """Tables without any pixel-width td are designed to flow; leave them
    alone. Forcing fixed would distribute columns evenly and break the
    author's intended natural sizing."""
    html = (
        '<table style="width:100%;border-collapse:collapse;">'
        '<tr><td>cell a</td><td>cell b</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m
    assert 'table-layout' not in table_m.group(0)


def test_table_layout_inner_table_gets_width_100_and_fixed() -> None:
    """The TOC pattern (an outer width:100% table containing per-row inner
    tables that themselves have no width but DO have a 30px digit cell)
    must get both width:100% AND table-layout:fixed injected — per HTML5
    spec, fixed-layout on a width-less table falls back to auto, so just
    adding fixed isn't enough."""
    html = (
        '<table style="border-collapse:collapse;">'
        '<tr><td style="width:30px;padding:0;vertical-align:middle;">01</td>'
        '<td style="padding:0 0 0 4px;">国内平台一览</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m, f"table tag missing: {out}"
    assert 'width:100%' in table_m.group(0), f"width:100% should be injected: {table_m.group(0)}"
    assert 'table-layout:fixed' in table_m.group(0), f"fixed should be injected: {table_m.group(0)}"


def test_table_layout_respects_existing_width_attribute() -> None:
    """If author set width via HTML attribute, don't override with 100%."""
    html = (
        '<table width="320" style="border-collapse:collapse;">'
        '<tr><td style="width:30px;">01</td><td>x</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m
    assert 'table-layout:fixed' in table_m.group(0)
    # width:100% NOT auto-added because the author already pinned a width.
    assert 'width:100%' not in table_m.group(0)


def test_table_layout_respects_existing_max_width() -> None:
    """A max-width hint in style counts as 'author already set a width'."""
    html = (
        '<table style="max-width:500px;">'
        '<tr><td style="width:30px;">01</td><td>x</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m
    assert 'table-layout:fixed' in table_m.group(0)
    assert 'width:100%' not in table_m.group(0)


def test_table_layout_author_value_is_respected() -> None:
    """If the author already set `table-layout: auto` (or anything else),
    we don't override their choice."""
    html = (
        '<table style="width:100%;table-layout:auto;">'
        '<tr><td style="width:30px;">a</td><td>b</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m
    assert 'table-layout:auto' in table_m.group(0)
    assert 'table-layout:fixed' not in table_m.group(0)


def test_table_layout_bogus_value_is_dropped_by_allowlist() -> None:
    """`table-layout: scrollable` is not a real value — the allowlist gate
    drops it. Since the author "set" some value, the injection step
    leaves the table alone (no fixed injection)."""
    html = (
        '<table style="width:100%;table-layout:scrollable;">'
        '<tr><td style="width:30px;">a</td><td>b</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    table_m = re.search(r'<table[^>]*>', out)
    assert table_m
    assert 'table-layout:scrollable' not in table_m.group(0)
    # Allowlist drops the invalid value entirely; injection step doesn't
    # know the original had it, but the regex check on the post-allowlist
    # style has no table-layout, so injection WILL fire. Either result is
    # acceptable; the key invariant is no bogus value survives.
    # We assert the surviving result has at most fixed (no scrollable).
    table_layout_vals = re.findall(r'table-layout:([^;"\s]+)', table_m.group(0))
    for v in table_layout_vals:
        assert v in {'fixed', 'auto'}, f"unexpected table-layout value: {v}"


def test_nested_table_only_inner_gets_layout_fixed_from_inner_td() -> None:
    """A <td> inside a nested inner table shouldn't make the OUTER table
    get table-layout:fixed — only direct child <td>s of the outer count."""
    html = (
        '<table style="width:100%;">'
        '<tr><td>'
        '<table style="width:100%;">'
        '<tr><td style="width:30px;">01</td><td>body</td></tr>'
        '</table>'
        '</td></tr>'
        '</table>'
    )
    out = sanitize_for_wechat(html)
    # The inner table got table-layout:fixed.
    all_tables = re.findall(r'<table[^>]*>', out)
    assert len(all_tables) == 2, f"expected 2 tables, got {len(all_tables)}: {all_tables}"
    # Heuristic: the inner table is the second <table> tag in the string.
    outer_tag, inner_tag = all_tables
    assert 'table-layout:fixed' in inner_tag, f"inner should have fixed: {inner_tag}"
    assert 'table-layout' not in outer_tag, f"outer should be untouched: {outer_tag}"


# ---------------------------------------------------------------------------
# SVG subtree protection (P0-1 / P0-3 / P0-4)
#
# New sanitize contract: inside an <svg>...</svg> subtree we PRESERVE `id`
# attributes, PRESERVE SVG-only style properties (fill/stroke/stroke-width/
# stop-color/transform/pointer-events/cursor), and do NOT rewrite
# `opacity:0 -> opacity:1`. Outside the SVG subtree, all existing HTML
# cleaning behavior is unchanged. SVG-aware tracks (validator, frontend
# gate) align to this contract.
# ---------------------------------------------------------------------------


# --- P0-1: id preservation inside SVG, stripping outside ---


def test_svg_id_is_preserved():
    html = '<svg viewBox="0 0 10 10"><rect id="g1" fill="#000"/></svg>'
    out = sanitize_for_wechat(html)
    assert 'id="g1"' in out, f"SVG id should survive: {out}"


def test_html_id_outside_svg_still_stripped():
    """Regression: ids on ordinary HTML elements must still be removed."""
    html = '<section id="section1" style="color:#111;">body</section>'
    out = sanitize_for_wechat(html)
    assert 'id="section1"' not in out
    assert 'id=' not in out
    assert 'color:#111' in out


def test_svg_id_kept_while_sibling_html_id_stripped():
    html = (
        '<section id="outer">'
        '<svg><rect id="r1"/></svg>'
        '</section>'
    )
    out = sanitize_for_wechat(html)
    assert 'id="r1"' in out, "SVG id must survive"
    assert 'id="outer"' not in out, "HTML id must be stripped"


def test_linear_gradient_id_reference_chain_survives():
    """`<linearGradient id="g1">` + `fill="url(#g1)"` must stay linked: if the
    id were stripped, the fill reference would dangle and the gradient would
    render as black."""
    html = (
        '<svg viewBox="0 0 100 50">'
        '<defs><linearGradient id="g1">'
        '<stop offset="0%" stop-color="#E63946"/>'
        '<stop offset="100%" stop-color="#C1272D"/>'
        '</linearGradient></defs>'
        '<rect width="100" height="50" fill="url(#g1)"/>'
        '</svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'id="g1"' in out, "gradient id must survive"
    assert 'fill="url(#g1)"' in out, "fill reference must survive"


def test_begin_id_click_reference_survives():
    """SMIL cross-element trigger `begin="hero.click"` references an element by
    id; both the referenced id and the begin attr must survive intact."""
    html = (
        '<svg viewBox="0 0 10 10">'
        '<rect id="hero" width="10" height="10"/>'
        '<animate attributeName="opacity" from="0" to="1" '
        'begin="hero.click" dur="0.3s"/>'
        '</svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'id="hero"' in out
    assert 'begin="hero.click"' in out


def test_multiple_svgs_all_keep_ids_html_between_stripped():
    html = (
        '<svg><rect id="a"/></svg>'
        '<section id="mid">x</section>'
        '<svg><circle id="b"/></svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'id="a"' in out
    assert 'id="b"' in out
    assert 'id="mid"' not in out


def test_nested_svg_inner_and_outer_ids_survive():
    html = '<svg id="outer"><svg id="inner"><rect id="r"/></svg></svg>'
    out = sanitize_for_wechat(html)
    assert 'id="outer"' in out
    assert 'id="inner"' in out
    assert 'id="r"' in out


# --- P0-3: SVG-only style properties exempted from the allowlist ---


def test_svg_fill_attribute_preserved():
    html = '<svg><rect fill="#ff0" stroke="blue"/></svg>'
    out = sanitize_for_wechat(html)
    assert 'fill="#ff0"' in out
    assert 'stroke="blue"' in out


def test_svg_style_fill_stroke_preserved():
    html = (
        '<svg><rect style="fill:#ff0;stroke:blue;stroke-width:2;'
        'pointer-events:all;cursor:pointer;"/></svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'fill:#ff0' in out
    assert 'stroke:blue' in out
    assert 'stroke-width:2' in out
    assert 'pointer-events:all' in out
    assert 'cursor:pointer' in out


def test_svg_stop_color_and_transform_preserved():
    html = (
        '<svg><g style="transform:translate(2,2);">'
        '<stop style="stop-color:#ff0;"/></g></svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'transform:translate(2,2)' in out
    assert 'stop-color:#ff0' in out


def test_html_fill_stroke_outside_svg_still_dropped():
    """`fill`/`stroke`/`pointer-events` are NOT in the HTML allowlist; outside
    an SVG subtree they must still be dropped by the style gate (no contract
    change for plain HTML)."""
    html = '<section style="fill:#ff0;stroke:blue;pointer-events:all;color:#111;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'fill:#ff0' not in out
    assert 'stroke:blue' not in out
    assert 'pointer-events' not in out
    assert 'color:#111' in out


# --- P0-4: opacity:0 -> opacity:1 rewrite skipped inside SVG ---


def test_svg_opacity_zero_in_style_preserved():
    """Entering-animation initial state: opacity:0 in an SVG style must NOT be
    rewritten to opacity:1 (that would make the element visible before its
    animation runs)."""
    html = '<svg><rect style="opacity:0;fill:#000;"/></svg>'
    out = sanitize_for_wechat(html)
    assert 'opacity:0' in out
    assert 'opacity:1' not in out


def test_svg_opacity_attribute_zero_preserved():
    """The presentation attribute form `opacity="0"` must also be untouched."""
    html = '<svg><rect opacity="0" fill="#000"/></svg>'
    out = sanitize_for_wechat(html)
    assert 'opacity="0"' in out


def test_html_opacity_zero_outside_svg_still_rewritten():
    """Regression: opacity:0 on plain HTML is still bumped to opacity:1."""
    html = '<section style="opacity:0;color:#111;">x</section>'
    out = sanitize_for_wechat(html)
    assert 'opacity:1' in out
    assert 'opacity:0;' not in out and 'opacity:0"' not in out


# --- end-to-end acceptance: full reference chain intact ---


def test_full_svg_template_reference_chain_intact():
    """Acceptance self-check from the task: a template carrying
    `linearGradient id=g1` + `fill=url(#g1)` + `begin="hero.click"` plus an
    `opacity:0` entering state must come out with EVERY reference and the
    animation initial state intact, while the surrounding HTML id is stripped."""
    html = (
        '<section id="card" style="padding:20px;">'
        '<svg viewBox="0 0 200 100">'
        '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#E63946"/>'
        '<stop offset="100%" stop-color="#C1272D"/>'
        '</linearGradient></defs>'
        '<rect id="hero" width="200" height="100" fill="url(#g1)" '
        'stroke="#fff" stroke-width="2" '
        'style="pointer-events:all;cursor:pointer;opacity:0;"/>'
        '<animate xlink:href="#hero" attributeName="opacity" '
        'from="0" to="1" begin="hero.click" dur="0.4s" fill="freeze"/>'
        '</svg>'
        '</section>'
    )
    out = sanitize_for_wechat(html)
    # id reference chain
    assert 'id="g1"' in out
    assert 'fill="url(#g1)"' in out
    assert 'id="hero"' in out
    assert 'begin="hero.click"' in out
    # SVG-only style props survive
    assert 'pointer-events:all' in out
    assert 'cursor:pointer' in out
    assert 'stroke-width="2"' in out
    assert 'stop-color="#E63946"' in out
    # animation initial state not clobbered
    assert 'opacity:0' in out
    assert 'opacity:1' not in out
    # surrounding HTML id still stripped; HTML cleaning unaffected
    assert 'id="card"' not in out
    # no placeholder token leaks into output
    assert 'PLACEHOLDER' not in out


# ---------------------------------------------------------------------------
# Security hardening of the SVG-subtree protection (review findings F1-F4)
# ---------------------------------------------------------------------------


# --- F1: on* handlers / <script> inside an SVG subtree must NOT survive ---


def test_svg_event_handler_is_stripped():
    """on* handlers inside an SVG subtree must be removed even though the
    subtree is protected from the HTML id/style cleaning passes. Protecting
    SVG presentation must never become an XSS bypass."""
    html = '<svg><rect onclick="alert(1)" id="r1" fill="#000"/></svg>'
    out = sanitize_for_wechat(html)
    assert 'onclick' not in out, f"on* handler leaked through SVG: {out}"
    # legitimate presentation survives
    assert 'id="r1"' in out
    assert 'fill="#000"' in out


def test_svg_event_handlers_all_forms_stripped():
    html = (
        '<svg><rect onload="x()" onmouseover="y()" '
        'onerror="z()" id="r" fill="#fff"/></svg>'
    )
    out = sanitize_for_wechat(html)
    assert 'onload' not in out
    assert 'onmouseover' not in out
    assert 'onerror' not in out
    assert 'id="r"' in out


def test_svg_script_tag_is_stripped():
    html = '<svg><script>alert(document.cookie)</script><rect id="r"/></svg>'
    out = sanitize_for_wechat(html)
    assert '<script' not in out.lower()
    assert 'document.cookie' not in out
    assert 'id="r"' in out


def test_svg_single_quoted_event_handler_stripped():
    html = "<svg><rect onclick='evil()' id='r'/></svg>"
    out = sanitize_for_wechat(html)
    assert 'onclick' not in out


# --- F2: user-injected placeholder comment must not duplicate SVG content ---


def test_injected_placeholder_comment_does_not_duplicate_svg():
    """A user typing the magic placeholder comment must not be able to clone an
    SVG subtree (including any payload) into an arbitrary position."""
    html = (
        '<svg><rect onclick="evil()" id="r"/></svg>'
        '<!--SVG_SANITIZE_PLACEHOLDER_0-->'
    )
    out = sanitize_for_wechat(html)
    # SVG markup must appear at most once (the real one, sanitized).
    assert out.count('<rect') <= 1, f"SVG was duplicated via injected comment: {out}"
    assert 'onclick' not in out


def test_injected_placeholder_comment_without_real_svg_is_inert():
    """No real SVG present: the injected magic comment must not resurrect any
    fragment (no IndexError, no stray <rect>)."""
    html = '<section>before<!--SVG_SANITIZE_PLACEHOLDER_0-->after</section>'
    out = sanitize_for_wechat(html)
    assert '<rect' not in out
    assert '<svg' not in out


# --- F3: `</svg>` appearing inside an attribute value must not truncate ---


def test_svg_with_closing_tag_in_attribute_value_not_truncated():
    """A literal `</svg>` inside an attribute value (e.g. a desc/title string)
    must not prematurely end the SVG subtree and spill the remainder into the
    HTML pipeline (which would strip ids off the tail)."""
    html = (
        '<svg><rect id="safeId" data-x="val</svg>continue"/>'
        '<circle id="alsoSafe"/></svg>'
    )
    out = sanitize_for_wechat(html)
    # Both ids belong to the same SVG subtree; both must survive.
    assert 'id="safeId"' in out, f"truncation dropped first id: {out}"
    assert 'id="alsoSafe"' in out, f"truncation dropped trailing id: {out}"


# --- F4: single-quoted id on a plain HTML element must still be stripped ---


def test_html_single_quoted_id_outside_svg_stripped():
    html = "<section id='survives_strip' style=\"color:#111\">text</section>"
    out = sanitize_for_wechat(html)
    assert 'survives_strip' not in out, f"single-quoted HTML id leaked: {out}"
    assert 'color:#111' in out


# --- F5: many unclosed <svg> tags must not blow up (no O(k*n) hang) ---


def test_many_unclosed_svg_tags_extract_quickly():
    """The extraction stage must stay linear on a pathological run of unclosed
    <svg> tags (review finding F5) — the old O(k*n) scan reached seconds."""
    import time
    from app.services.wechat_sanitize import _extract_svg_subtrees
    doc = '<svg>' * 2000 + '<p>end</p>' * 10
    t0 = time.perf_counter()
    out, frags = _extract_svg_subtrees(doc, 'NONCE')
    elapsed = time.perf_counter() - t0
    assert elapsed < 0.5, f"extract too slow on unclosed-svg input: {elapsed:.3f}s"
    # Nothing balanced, so no fragment extracted and trailing content survives.
    assert frags == []
    assert '<p>end</p>' in out


def test_balanced_svgs_after_normal_content_all_protected():
    """Several balanced top-level <svg> subtrees interleaved with normal HTML
    are each protected independently (single-pass correctness)."""
    doc = (
        '<p>intro</p>'
        '<svg id="a"><rect id="ra"/></svg>'
        '<section>mid</section>'
        '<svg id="b"><circle id="rb"/></svg>'
    )
    out = sanitize_for_wechat(doc)
    assert 'id="a"' in out and 'id="ra"' in out
    assert 'id="b"' in out and 'id="rb"' in out


def test_unclosed_svg_soup_degrades_safely():
    """Pathological leading run of unclosed <svg> tags: must NOT hang and must
    NOT leak an unsanitized payload. Over-stripping (treating the soup as plain
    HTML) is the safe degradation."""
    doc = '<svg>' * 50 + '<rect onclick="evil()" id="r"/></svg>'
    out = sanitize_for_wechat(doc)
    # No script execution vector survives regardless of how the soup parses.
    assert 'onclick' not in out
