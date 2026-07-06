"""Regression tests for the copy pipeline on full HTML documents.

Reproduces the field bug report: an AI-authored推文 delivered as a complete
document (DOCTYPE + <head> + <style> + <body bgcolor> + <article style>)
lost its page-level background after MBEditor → WeChat paste, because

* WeChat unwraps HTML5 semantic tags (<article>/<main>/<header>/...) —
  children survive, the tag AND its style attribute are dropped; and
* feeding a full document into premailer's nested wrapper either raised
  (DOCTYPE) or leaked <head> metadata into the article body.

The pipeline under test is exactly what /publish/process-for-copy runs:
``sanitize_for_wechat(inline_css(html))``.
"""
from __future__ import annotations

from app.services.css_inline import inline_css
from app.services.wechat_sanitize import sanitize_for_wechat


FULL_DOCUMENT = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LEAKED-TITLE-TEXT</title>
<link rel="stylesheet" href="https://example.com/x.css">
<style>
body { color: #333333; }
@media (max-width: 600px) {
  .hero { display: none; }
  @supports (display: grid) { .hero { color: red; } }
}
p, p:hover { letter-spacing: 1px; }
</style>
</head>
<body style="margin:0" bgcolor="#F5F5F5">
<article xmlns="http://www.w3.org/1999/xhtml" style="background:linear-gradient(180deg,#D5E3FB 0%,#E6EFFC 30%,#EDF3FC 100%);background-color:#E9F0FC;padding:0 14px 36px 14px">
  <header style="background-color:#23262F"><p>head</p></header>
  <main><p class="hero">正文段落</p></main>
  <footer><p>尾部</p></footer>
</article>
</body>
</html>"""


def _process(html: str) -> str:
    return sanitize_for_wechat(inline_css(html))


def test_page_background_survives_semantic_wrapper_unwrap():
    out = _process(FULL_DOCUMENT)
    # <article>/<header>/<main>/<footer> must be renamed to <section> so
    # WeChat's unwrap pass never sees them — backgrounds ride along.
    for tag in ("<article", "<main", "<header", "<footer"):
        assert tag not in out
    assert "linear-gradient(180deg" in out
    assert "#E9F0FC" in out
    assert "#23262F" in out


def test_body_bgcolor_is_promoted_to_background_color():
    out = _process(FULL_DOCUMENT)
    assert "#F5F5F5" in out


def test_head_metadata_does_not_leak_into_output():
    out = _process(FULL_DOCUMENT)
    assert "LEAKED-TITLE-TEXT" not in out
    for fragment in ("<meta", "<link", "<title", "<head", "<html", "<body", "<!DOCTYPE"):
        assert fragment.lower() not in out.lower()


def test_css_is_actually_inlined_despite_doctype():
    out = _process(FULL_DOCUMENT)
    # `p, p:hover { letter-spacing }` — the plain `p` selector must survive
    # pseudo stripping and be inlined onto paragraphs.
    assert "letter-spacing" in out


def test_nested_media_query_rules_do_not_leak_as_global():
    out = _process(FULL_DOCUMENT)
    # The mobile-only `display:none` inside @media (with a nested @supports)
    # must not escape onto the .hero paragraph.
    assert "display:none" not in out.replace(" ", "")
    assert "正文段落" in out


def test_xmlns_attribute_is_removed():
    out = _process(FULL_DOCUMENT)
    assert "xmlns" not in out


def test_single_quoted_style_with_inner_double_quotes_not_truncated():
    html = (
        "<section style='color:#111;font-family:\"PingFang SC\",sans-serif;"
        "background-color:#E9F0FC'><p>x</p></section>"
    )
    out = sanitize_for_wechat(html)
    # Before the fix the inner double quote terminated the converted
    # attribute, truncating everything after font-family.
    assert "#E9F0FC" in out


def test_fragment_without_body_still_processes():
    out = _process('<section style="background-color:#ABCDEF"><p>hi</p></section>')
    assert "#ABCDEF" in out
    assert "hi" in out
