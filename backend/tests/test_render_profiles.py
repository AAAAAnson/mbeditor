"""Tests for render profiles: behavior-diff + WeChat-equivalence regression."""
import pytest

from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.render_profiles import (
    GENERIC_PROFILE,
    WECHAT_PROFILE,
    get_profile,
    strip_dangerous,
)
from app.services.wechat_sanitize import sanitize_for_wechat, sanitize_with_profile
from app.services.block_registry import RenderContext


# ---------------------------------------------------------------------------
# A. Profile registry / selection
# ---------------------------------------------------------------------------

class TestProfileSelection:
    def test_default_is_wechat(self):
        assert get_profile().name == "wechat"
        assert get_profile("wechat") is WECHAT_PROFILE

    def test_generic_and_web_alias(self):
        assert get_profile("generic") is GENERIC_PROFILE
        assert get_profile("web") is GENERIC_PROFILE

    def test_unknown_falls_back_to_wechat(self):
        assert get_profile("bogus") is WECHAT_PROFILE
        assert get_profile("") is WECHAT_PROFILE
        assert get_profile(None) is WECHAT_PROFILE

    def test_case_insensitive(self):
        assert get_profile("WeChat") is WECHAT_PROFILE
        assert get_profile("GENERIC") is GENERIC_PROFILE


# ---------------------------------------------------------------------------
# B. Behavior diff between profiles
# ---------------------------------------------------------------------------

class TestProfileBehaviorDiff:
    def test_modern_layout_css_diff(self):
        src = '<div style="display:flex;position:absolute;transform:rotate(5deg)">x</div>'
        w = process_for_wechat(src, profile="wechat")
        g = process_for_wechat(src, profile="generic")

        # WeChat profile strips flex/absolute/transform.
        assert "flex" not in w
        assert "absolute" not in w
        assert "transform" not in w

        # Generic retains all three.
        assert "flex" in g
        assert "absolute" in g
        assert "transform" in g

    def test_div_and_semantic_tags_diff(self):
        src = '<div>a</div><article>b</article>'
        w = process_for_wechat(src, profile="wechat")
        g = process_for_wechat(src, profile="generic")

        # WeChat renames div/article to section.
        assert "<section" in w
        assert "<div" not in w
        assert "<article" not in w

        # Generic keeps div + article structure (the load-bearing diff).
        assert "<div" in g
        assert "<article" in g

    def test_class_id_retained_in_sanitizer_generic(self):
        """The sanitizer layer keeps class/id under generic.

        (Note: the full process_for_wechat pipeline removes classes upstream in
        premailer's CSS-inline step regardless of profile; this asserts the
        sanitizer narrowing seam specifically.)
        """
        from app.services.wechat_sanitize import sanitize_with_profile

        src = '<div class="x" id="y">a</div>'
        w = sanitize_with_profile(src, WECHAT_PROFILE)
        g = sanitize_with_profile(src, GENERIC_PROFILE)
        assert "class=" not in w and "id=" not in w
        assert 'class="x"' in g and 'id="y"' in g

    def test_pre_block_diff(self):
        src = "<pre><code>x = 1</code></pre>"
        w = process_for_wechat(src, profile="wechat")
        g = process_for_wechat(src, profile="generic")

        # WeChat converts <pre> to a styled section/code box.
        assert "<section" in w and "<code" in w
        # Generic keeps the raw <pre>.
        assert "<pre" in g

    def test_grid_and_gap_generic_only(self):
        src = '<div style="display:grid;gap:8px">x</div>'
        w = process_for_wechat(src, profile="wechat")
        g = process_for_wechat(src, profile="generic")
        assert "grid" not in w and "gap" not in w
        assert "grid" in g and "gap" in g

    def test_security_floor_both_profiles(self):
        src = '<p>ok</p><script>alert(1)</script>'
        for prof in ("wechat", "generic"):
            out = process_for_wechat(src, profile=prof)
            assert "<script" not in out
            assert "alert(1)" not in out

    def test_generic_strips_on_handlers(self):
        src = '<div onclick="evil()" style="display:flex">x</div>'
        g = process_for_wechat(src, profile="generic")
        assert "onclick" not in g
        # but flex survives
        assert "flex" in g


# ---------------------------------------------------------------------------
# C. WeChat-equivalence regression (the 500-test protection)
# ---------------------------------------------------------------------------

_CORPUS = [
    "",
    "<p>Hello world</p>",
    "<h1>Title</h1><p>Body</p>",
    '<div style="display:flex;position:absolute;transform:rotate(5deg)">x</div>',
    '<div class="a" id="b" data-x="1" style="color:red">styled</div>',
    "<pre><code>print('hi')</code></pre>",
    '<a href="https://x.com" style="background-color:#07C160;padding:10px;'
    'border-radius:8px;display:inline-block">Button</a>',
    '<table><tr><td style="width:30px">01</td></tr></table>',
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4">'
    '<animate attributeName="opacity" from="0" to="1" dur="1s"/></circle></svg>',
    '<article style="background:#fff;padding:20px"><section><p>Nested</p></section></article>',
    '<div style="opacity:0">hidden trick</div>',
    '<section style="position:fixed">overlay</section>',
    '<p style="font-family:&quot;PingFang SC&quot;,sans-serif">font</p>',
    '<input type="text"><label>Name</label>',
    '<iframe src="https://x"></iframe><p>after</p>',
    # on* handlers in all three forms — verifies sanitize_for_wechat and
    # sanitize_with_profile(WECHAT_PROFILE) agree on the (newer) unquoted +
    # whitespace-around-= strips, which the original corpus never exercised.
    '<div onclick="evil()">dq</div>',
    "<div onmouseover='evil()'>sq</div>",
    "<div onclick=evil>unquoted</div>",
    '<div onclick = "evil()">spaced</div>',
    # CSS url() script-scheme smuggling — exercises the style-value floor.
    '<div style="background:url(javascript:alert(1))">bad</div>',
]


class TestWechatEquivalence:
    @pytest.mark.parametrize("html", _CORPUS)
    def test_byte_for_byte_equal(self, html):
        """sanitize_for_wechat(x) == sanitize_with_profile(x, WECHAT_PROFILE)."""
        assert sanitize_for_wechat(html) == sanitize_with_profile(html, WECHAT_PROFILE)

    @pytest.mark.parametrize("html", _CORPUS)
    def test_process_for_wechat_default_matches_explicit(self, html):
        assert process_for_wechat(html) == process_for_wechat(html, profile="wechat")

    def test_preview_html_default_profile(self):
        html = "<p>x</p>"
        assert preview_html(html) == preview_html(html, profile="wechat")

    def test_default_render_context_profile_is_wechat(self):
        assert RenderContext().profile == "wechat"
        assert RenderContext(upload_images=True).profile == "wechat"


# ---------------------------------------------------------------------------
# D. strip_dangerous security floor helper
# ---------------------------------------------------------------------------

class TestStripDangerous:
    def test_removes_script(self):
        assert "<script" not in strip_dangerous("<p>x</p><script>alert(1)</script>")

    def test_removes_style(self):
        assert "<style" not in strip_dangerous("<style>p{color:red}</style><p>x</p>")

    def test_removes_on_handlers(self):
        out = strip_dangerous('<div onclick="x()" onmouseover=\'y()\'>z</div>')
        assert "onclick" not in out and "onmouseover" not in out

    def test_removes_unquoted_on_handler(self):
        out = strip_dangerous('<div onclick=evil>z</div>')
        assert "onclick" not in out

    def test_neutralizes_javascript_url(self):
        out = strip_dangerous('<a href="javascript:evil()">x</a>')
        assert "javascript:" not in out

    def test_neutralizes_data_url_src(self):
        out = strip_dangerous('<img src="data:text/html,<script>x</script>">')
        assert "data:text/html" not in out

    def test_removes_iframe(self):
        assert "<iframe" not in strip_dangerous('<iframe src="x"></iframe>')

    def test_keeps_class_and_layout(self):
        """strip_dangerous must NOT strip class/id/layout — that's render-time."""
        src = '<div class="x" id="y" style="display:flex">z</div>'
        out = strip_dangerous(src)
        assert 'class="x"' in out
        assert 'id="y"' in out
        assert "display:flex" in out

    def test_empty_input(self):
        assert strip_dangerous("") == ""


# ---------------------------------------------------------------------------
# E. sanitize_with_profile security floor — must be as strong as strip_dangerous
# ---------------------------------------------------------------------------

class TestProfileSecurityFloor:
    @pytest.mark.parametrize("profile", [WECHAT_PROFILE, GENERIC_PROFILE])
    def test_css_url_javascript_scheme_stripped(self, profile):
        out = sanitize_with_profile(
            '<div style="background:url(javascript:alert(1))">x</div>', profile
        )
        assert "javascript:" not in out

    @pytest.mark.parametrize("profile", [WECHAT_PROFILE, GENERIC_PROFILE])
    def test_css_url_data_scheme_stripped(self, profile):
        out = sanitize_with_profile(
            "<div style=\"background:url('data:text/html,x')\">x</div>", profile
        )
        assert "data:text/html" not in out

    @pytest.mark.parametrize("profile", [WECHAT_PROFILE, GENERIC_PROFILE])
    def test_legit_css_url_preserved(self, profile):
        out = sanitize_with_profile(
            '<div style="background:url(https://x.com/a.png)">x</div>', profile
        )
        assert "https://x.com/a.png" in out

    @pytest.mark.parametrize("profile", [WECHAT_PROFILE, GENERIC_PROFILE])
    def test_unquoted_on_handler_stripped(self, profile):
        out = sanitize_with_profile("<div onclick=evil>x</div>", profile)
        assert "onclick" not in out

    @pytest.mark.parametrize("profile", [WECHAT_PROFILE, GENERIC_PROFILE])
    def test_on_handler_with_spaces_around_equals_stripped(self, profile):
        out = sanitize_with_profile('<div onclick = "evil()">x</div>', profile)
        assert "onclick" not in out
