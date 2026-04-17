"""
Baseline tests for _sanitize_for_wechat.

Contract (post 2026-04-17 refactor - drift-prevention allowlist):
  The sanitizer strips both unsafe tags AND CSS properties that WeChat's
  paste-handler and draft-API server-filter treat inconsistently. Flex,
  grid, absolute positioning, animations, transforms, and friends all get
  dropped so that "copy to WeChat backend" and "push via /draft/add"
  produce the same rendered output.
"""
import pytest

from app.api.v1.publish import _sanitize_for_wechat


def test_strips_script_tag():
    html = '<section>hi</section><script>alert(1)</script>'
    result = _sanitize_for_wechat(html)
    assert "<script" not in result
    assert "hi" in result


def test_strips_style_tag():
    html = '<style>.x{color:red}</style><section>hi</section>'
    result = _sanitize_for_wechat(html)
    assert "<style" not in result
    assert "hi" in result


def test_strips_class_attribute():
    html = '<section class="foo">hi</section>'
    result = _sanitize_for_wechat(html)
    assert 'class="foo"' not in result
    assert "hi" in result


def test_strips_data_attributes():
    html = '<section data-id="x" data-foo="bar">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "data-id" not in result
    assert "data-foo" not in result


def test_strips_input_and_label():
    html = '<input type="checkbox" /><label for="x">click</label>'
    result = _sanitize_for_wechat(html)
    assert "<input" not in result
    assert "<label" not in result


def test_converts_div_to_section():
    html = '<div>hi</div>'
    result = _sanitize_for_wechat(html)
    assert "<section" in result
    assert "<div" not in result


def test_strips_display_grid():
    """Allowlist rule: display:grid is dropped - values are constrained to block/inline/inline-block/none/table-*."""
    html = '<section style="display:grid;color:red;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "display:grid" not in result
    # The color survives; the grid declaration is dropped entirely.
    assert "color:red" in result


def test_strips_position_absolute_and_hides_element():
    """Allowlist rule: position:absolute is hidden via display:none to avoid
    overlap with flow content when WeChat strips it server-side."""
    html = '<section style="position:absolute;top:0;left:0;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "position:absolute" not in result
    # top/left are also stripped because they depend on positioning
    assert "top:0" not in result
    assert "left:0" not in result
    assert "display:none" in result


def test_strips_animation():
    """Allowlist rule: animation is dropped - neither WeChat surface honors it."""
    html = '<section style="animation:fadeIn 1s;color:red;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "animation" not in result
    assert "color:red" in result
