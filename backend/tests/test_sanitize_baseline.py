"""
Baseline tests for _sanitize_for_wechat.

After Stage 0, this function should ONLY strip tags that WeChat's backend
renderer removes (script, style, link, input, label, class attr, data-* attr).
It should NOT rewrite CSS values, delete positioning, etc.
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


def test_preserves_inline_style_grid():
    """Stage-0 rule: sanitizer MUST NOT rewrite display:grid."""
    html = '<section style="display:grid;color:red;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "display:grid" in result
    assert "display:block" not in result


def test_preserves_position_absolute():
    """Stage-0 rule: sanitizer MUST NOT strip position:absolute.
    If the user writes it, we send it. Failing at runtime is WeChat's problem,
    not ours — we don't silently mutate authored intent."""
    html = '<section style="position:absolute;top:0;left:0;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "position:absolute" in result
    assert "top:0" in result
    assert "left:0" in result


def test_preserves_animation():
    """Stage-0 rule: sanitizer MUST NOT strip animation property."""
    html = '<section style="animation:fadeIn 1s;color:red;">hi</section>'
    result = _sanitize_for_wechat(html)
    assert "animation:fadeIn" in result
