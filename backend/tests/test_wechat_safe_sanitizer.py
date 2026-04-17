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
