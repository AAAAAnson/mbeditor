"""Visual parity infrastructure for MBEditor ↔ WeChat draft comparison.

This module provides 5 helper functions used by Task 10/11 visual tests:

    render_mbdoc_to_screenshot  — render MBDoc in headless Chromium → PNG
    push_mbdoc_to_wechat_draft  — push doc to WeChat draft, return media_id
    screenshot_wechat_draft     — screenshot a WeChat draft via logged-in session
    diff_images                 — pixel-level image diff via PIL
    diff_dom                    — structural HTML diff ignoring noisy attrs

Design contract:
  - All 5 functions are pure/independent; each can be called without the others.
  - render_mbdoc_to_screenshot and diff_images/diff_dom do NOT touch WeChat APIs.
  - screenshot_wechat_draft requires a prior auth_login.py run (storage_state).
"""

import difflib
import io
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional

from app.models.mbdoc import MBDoc
from app.services.block_registry import BlockRegistry, RenderContext
from app.services.render_for_wechat import render_for_wechat

# ---------------------------------------------------------------------------
# Default directories
# ---------------------------------------------------------------------------

_THIS_DIR = Path(__file__).parent
_ARTIFACTS_DIR = _THIS_DIR / "_artifacts"
_AUTH_STATE_PATH = _THIS_DIR / ".auth" / "state.json"

# ---------------------------------------------------------------------------
# (a) render_mbdoc_to_screenshot
# ---------------------------------------------------------------------------

_BODY_STYLE_PADDED = (
    "margin:0;"
    "padding:20px 16px;"
    "font-family:-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;"
    "font-size:16px;"
    "line-height:1.8;"
    "color:#333;"
    "background:#fff;"
)
# Match the WeChat MP backend draft edit page chrome (dumped 2026-04-11,
# see docs/research/RESEARCH_CORRECTIONS.md). The draft edit page wraps
# .rich_media_content in a <div class="ProseMirror"> contenteditable host
# that injects two non-obvious properties inherited by every block:
#   - padding:0 4px + box-sizing:border-box  → 8px horizontal inset on
#     a 586px-wide column, so the actual text column is 578px
#   - letter-spacing:0.578px                  → measurably widens every
#     CJK glyph and shifts paragraph line wraps to the left of the editor
# Replicating both is required for pixel parity in flush/parity mode. The
# font-family stack and font-size 17 / line-height 1.6 mirror the
# .rich_media_content container's computed style so that any element that
# does not set its own typography (e.g. inline <span> for marks added in
# later stages) inherits exactly what WeChat does.
_BODY_STYLE_FLUSH = (
    "margin:0;"
    "padding:0 4px;"
    "box-sizing:border-box;"
    # display:flow-root + 1px transparent top border together establish a
    # BFC that contains BOTH the first child's marginTop (h1: 24px) and
    # the last child's marginBottom (lastP: 12px) without adding any
    # padding. The 1px border matches the ~1px residual extent that
    # WeChat's .rich_media_content shows below its last paragraph.
    "display:flow-root;"
    "border-top:1px solid transparent;"
    "font-family:mp-quote,'PingFang SC',system-ui,-apple-system,BlinkMacSystemFont,"
    "'Helvetica Neue','Hiragino Sans GB','Microsoft YaHei UI','Microsoft YaHei',Arial,sans-serif;"
    "font-size:17px;"
    "line-height:1.6;"
    "letter-spacing:0.578px;"
    "color:rgba(0,0,0,0.9);"
    "text-align:justify;"
    # ProseMirror contenteditable injects these (dumped 2026-04-11):
    # word-break:break-word + overflow-wrap:break-word affect how
    # text-align:justify distributes space around Latin words like
    # "margin-bottom" — without them the editor places ~17 rows of
    # sub-pixel character offsets that don't match the WeChat draft.
    # white-space is kept default (NOT break-spaces) because the latter
    # turns inter-tag whitespace in render_for_wechat into visible lines.
    "word-break:break-word;"
    "overflow-wrap:break-word;"
    "hyphens:auto;"
    "font-feature-settings:'liga' 0;"
    "background:#fff;"
)


def render_mbdoc_to_screenshot(
    doc: MBDoc,
    out_dir: Optional[Path] = None,
    *,
    width: int = 375,
    flush: bool = False,
) -> Path:
    """Render an MBDoc to a PNG screenshot via headless Chromium.

    Simulates the MBEditor preview iframe chrome:
      - viewport width defaults to 375px (iPhone SE / mp.weixin mobile preview)
      - body padding 20x16 by default (matches MBEditor iframe chrome)
      - inline styles are the ONLY style source (no CSS reset injected)

    For visual parity diffing against the WeChat MP backend edit page
    ``.rich_media_content`` element, set ``width=586, flush=True`` to
    match WeChat's desktop preview geometry (wider viewport, zero body
    padding).

    Args:
        doc: source document to render.
        out_dir: directory to write the PNG to. Defaults to
            ``backend/tests/visual/_artifacts/``.
        width: viewport width in pixels. Defaults to 375 (mobile).
        flush: if True, strip the 20x16 body padding (use for parity
            diffing). Defaults to False.

    Returns:
        Path to the written PNG file.
    """
    from playwright.sync_api import sync_playwright

    out_dir = out_dir or _ARTIFACTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    ctx = RenderContext(upload_images=False)
    fragment = render_for_wechat(doc, ctx)

    if flush:
        # render_for_wechat joins blocks with "\n". WeChat's MP backend
        # strips those inter-block newlines when ingesting the draft, but
        # white-space:break-spaces on the editor body would render them as
        # extra blank lines. Strip them here so the parity wrapper matches
        # WeChat's visible content exactly.
        fragment = fragment.replace("\n", "")

    body_style = _BODY_STYLE_FLUSH if flush else _BODY_STYLE_PADDED
    body_attrs = (
        f'style="{body_style}" contenteditable="true"' if flush
        else f'style="{body_style}"'
    )
    wrapper_html = (
        "<!DOCTYPE html>"
        "<html>"
        f'<body {body_attrs}>'
        f"{fragment}"
        "</body>"
        "</html>"
    )

    out_path = out_dir / f"{doc.id}_editor.png"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        if flush:
            # Parity mode: use the same desktop viewport as
            # screenshot_wechat_draft (1440×900) so that Chromium's
            # sub-pixel font hinting matches the WeChat draft screenshot.
            # Body width is constrained to ``width`` via inline CSS so the
            # text column matches the WeChat .rich_media_content geometry.
            page.set_viewport_size({"width": 1440, "height": 900})
        else:
            page.set_viewport_size({"width": width, "height": 800})
        # In flush/parity mode constrain the body to the parity column
        # width (586px). The body still has padding 1px 4px 0 from
        # _BODY_STYLE_FLUSH which together with box-sizing:border-box
        # leaves a 578px text column matching ProseMirror's inset.
        if flush:
            wrapper_html_eff = wrapper_html.replace(
                f'style="{body_style}"',
                f'style="{body_style}width:{width}px;"',
            )
            assert "width:" in wrapper_html_eff, "body width injection failed"
        else:
            wrapper_html_eff = wrapper_html
        page.set_content(wrapper_html_eff, wait_until="networkidle")
        if flush:
            page.locator("body").screenshot(path=str(out_path))
        else:
            page.screenshot(path=str(out_path), full_page=True)
        browser.close()

    return out_path


# ---------------------------------------------------------------------------
# (b) push_mbdoc_to_wechat_draft
# ---------------------------------------------------------------------------


def push_mbdoc_to_wechat_draft(doc: MBDoc) -> str:
    """Push an MBDoc to WeChat as a draft article.

    Renders the document with ``upload_images=True`` (the "push" path) and
    calls ``wechat_service.create_draft``. Requires a valid ``data/config.json``
    with appid/appsecret configured for the MB科技 test account.

    Args:
        doc: document to push.

    Returns:
        The ``media_id`` string returned by the WeChat draft API.
    """
    from app.services import wechat_service

    # Stage 1 has no image blocks; upload_images=True still walks the real
    # push code-path even if no images are actually uploaded.
    ctx = RenderContext(upload_images=True, image_uploader=None)
    html = render_for_wechat(doc, ctx)

    title = doc.meta.title or doc.id
    result = wechat_service.create_draft(title=title, html=html)
    return result["media_id"]


# ---------------------------------------------------------------------------
# (c) screenshot_wechat_draft
# ---------------------------------------------------------------------------


def screenshot_wechat_draft(
    media_id: str,
    out_dir: Optional[Path] = None,
    *,
    title_hint: Optional[str] = None,
) -> Path:
    """Screenshot a WeChat draft's rendered content in the MP backend edit page.

    Requires a prior successful run of ``auth_login.py`` which saves
    ``backend/tests/visual/.auth/state.json``.

    Navigation flow (confirmed against MB科技 test account on 2026-04-11):

    1. Navigate to ``https://mp.weixin.qq.com/`` — server redirects to
       ``/cgi-bin/home?...&token=<TOKEN>``. Extract the token.
    2. Navigate to the drafts list
       ``/cgi-bin/appmsg?begin=0&count=10&type=77&action=list_card&token=<TOKEN>&lang=zh_CN``
    3. Locate the ``.weui-desktop-card`` whose ``.weui-desktop-publish__cover__title``
       text matches ``title_hint`` (falls back to the first non-"新的创作" card).
    4. Click the second ``a.weui-desktop-icon20.weui-desktop-icon-btn`` inside
       that card (the edit icon — the first is trash, the third/last is 发表).
       Clicking edit opens a new popup tab at
       ``/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&appmsgid=<ID>&...``.
    5. Wait for ``.rich_media_content`` to appear in the popup and screenshot
       just that element (not the full page) — that div contains the
       article body rendered exactly as WeChat will display it in-app.

    Notes:
        * ``media_id`` is the API-level media_id returned by create_draft;
          it is NOT the same as the backend ``appmsgid``. We cannot navigate
          directly to the edit page by ``media_id``, so we find the draft
          by its title instead. Pass ``title_hint`` (typically ``doc.meta.title``)
          for robust matching.
        * The screenshot is the bounding box of ``.rich_media_content`` at
          the default desktop viewport, not a mobile-chrome 375px frame.
          ``diff_images`` will resize as needed for comparison.

    Args:
        media_id: media_id returned by push_mbdoc_to_wechat_draft. Used
            only for the output filename; see ``title_hint`` for card
            lookup.
        out_dir: directory to write the PNG to. Defaults to _artifacts/.
        title_hint: draft title to match against card titles. Highly
            recommended; if omitted, uses the first non-"新的创作" card.

    Returns:
        Path to the written PNG (cropped to the article body).

    Raises:
        RuntimeError: if .auth/state.json does not exist (not yet logged in),
            if the WeChat session has expired, or if the draft card cannot
            be located.
    """
    from playwright.sync_api import sync_playwright

    state_path = _AUTH_STATE_PATH
    if not state_path.exists():
        raise RuntimeError(
            "WeChat login state not found. "
            "Run: python -m backend.tests.visual.auth_login first to scan QR."
        )

    out_dir = out_dir or _ARTIFACTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # Sanitize media_id for filename (WeChat media_ids contain '/' sometimes)
    safe_mid = media_id.replace("/", "_").replace("\\", "_")[:40]
    out_path = out_dir / f"{safe_mid}_draft.png"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(state_path),
            viewport={"width": 1440, "height": 900},
        )
        page = context.new_page()
        try:
            # Step 1: land on home to pick up token
            page.goto("https://mp.weixin.qq.com/", wait_until="networkidle", timeout=30_000)
            if "/cgi-bin/" not in page.url or "token=" not in page.url:
                raise RuntimeError(
                    f"WeChat session expired or not logged in (landed on {page.url}). "
                    "Re-run auth_login."
                )
            token = page.url.split("token=")[1].split("&")[0]

            # Step 2: drafts list
            drafts_url = (
                f"https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=77"
                f"&action=list_card&token={token}&lang=zh_CN"
            )
            page.goto(drafts_url, wait_until="networkidle", timeout=30_000)

            # Step 3: find the card matching title_hint
            if title_hint:
                card = page.locator(".weui-desktop-card", has_text=title_hint).first
            else:
                # First non-"新的创作" card
                cards = page.locator(".weui-desktop-card:not(.weui-desktop-card_new)")
                card = cards.first
            if card.count() == 0:
                raise RuntimeError(
                    f"Could not find draft card (title_hint={title_hint!r}) in list"
                )
            card.hover()

            # Step 4: click the edit icon (second icon20 button) and expect popup
            edit_icon = card.locator("a.weui-desktop-icon20.weui-desktop-icon-btn").nth(1)
            with context.expect_page(timeout=15_000) as popup_info:
                edit_icon.click()
            popup = popup_info.value
            popup.wait_for_load_state("networkidle", timeout=30_000)

            # Step 5: wait for .rich_media_content and screenshot that element
            content = popup.locator(".rich_media_content").first
            content.wait_for(state="visible", timeout=20_000)
            content.screenshot(path=str(out_path))
        except Exception as exc:
            browser.close()
            raise RuntimeError(
                f"screenshot_wechat_draft failed: {exc}"
            ) from exc
        browser.close()

    return out_path


# ---------------------------------------------------------------------------
# (d) diff_images
# ---------------------------------------------------------------------------


def diff_images(
    a: Path,
    b: Path,
    tolerance: float = 0.005,
) -> dict:
    """Pixel-level diff between two PNG screenshots.

    Pixels are compared in RGB space; a pixel is considered "different" if
    any channel differs by more than 8 (out of 255).

    Args:
        a: reference image (e.g. editor screenshot).
        b: candidate image (e.g. WeChat draft screenshot). If its size
           differs from ``a``, it is resized to match using LANCZOS.
        tolerance: diff fraction above which a diff image is written. Also
            used by callers to assert visual parity. Default 0.005 (0.5%).

    Returns:
        dict with keys:
            diff_pct       — fraction of differing pixels (0.0–1.0)
            diff_pixels    — absolute count of differing pixels
            total_pixels   — total pixel count (after resize)
            diff_image_path — Path to written diff PNG, or None
    """
    from PIL import Image

    img_a = Image.open(a).convert("RGB")
    img_b = Image.open(b).convert("RGB")

    if img_b.size != img_a.size:
        img_b = img_b.resize(img_a.size, Image.Resampling.LANCZOS)

    width, height = img_a.size
    total = width * height

    # Compare raw bytes: each RGB pixel is 3 bytes; stride = width * 3
    raw_a = img_a.tobytes()
    raw_b = img_b.tobytes()

    diff_count = 0
    diff_mask: list[bool] = []
    stride = 3
    for i in range(total):
        off = i * stride
        is_diff = any(
            abs(int(raw_a[off + c]) - int(raw_b[off + c])) > 8
            for c in range(stride)
        )
        diff_mask.append(is_diff)
        if is_diff:
            diff_count += 1

    diff_pct = diff_count / total if total > 0 else 0.0

    diff_image_path: Optional[Path] = None
    write_diff = (
        diff_pct > tolerance
        or os.environ.get("MBEDITOR_VISUAL_WRITE_DIFF") == "1"
    )
    if write_diff and diff_count > 0:
        diff_pixels_raw = bytearray(total * stride)
        for i, is_diff in enumerate(diff_mask):
            off = i * stride
            if is_diff:
                diff_pixels_raw[off] = 255
                diff_pixels_raw[off + 1] = 0
                diff_pixels_raw[off + 2] = 0
            else:
                diff_pixels_raw[off : off + stride] = raw_a[off : off + stride]
        diff_img = Image.frombytes("RGB", (width, height), bytes(diff_pixels_raw))
        diff_image_path = a.parent / f"{a.stem}_VS_{b.stem}_diff.png"
        diff_img.save(str(diff_image_path))

    return {
        "diff_pct": diff_pct,
        "diff_pixels": diff_count,
        "total_pixels": total,
        "diff_image_path": diff_image_path,
    }


# ---------------------------------------------------------------------------
# (e) diff_dom
# ---------------------------------------------------------------------------


class _NormalizingParser(HTMLParser):
    """HTMLParser that normalises tags/attrs and collapses whitespace."""

    def __init__(self, ignore_attr_prefixes: tuple[str, ...] = ("data-",), ignore_attrs: tuple[str, ...] = ("id",)):
        super().__init__()
        self.ignore_attr_prefixes = ignore_attr_prefixes
        self.ignore_attrs = ignore_attrs
        self.lines: list[str] = []

    def _filter_attrs(self, attrs: list[tuple]) -> list[tuple]:
        result = []
        for name, value in attrs:
            if name in self.ignore_attrs:
                continue
            if any(name.startswith(pfx) for pfx in self.ignore_attr_prefixes):
                continue
            # Strip query string from src
            if name == "src" and value and "?" in value:
                value = value.split("?")[0]
            result.append((name, value))
        return result

    def handle_starttag(self, tag: str, attrs: list[tuple]) -> None:
        filtered = self._filter_attrs(attrs)
        attr_str = ""
        if filtered:
            parts = []
            for name, value in sorted(filtered):
                parts.append(f'{name}="{value}"' if value is not None else name)
            attr_str = " " + " ".join(parts)
        self.lines.append(f"<{tag}{attr_str}>")

    def handle_endtag(self, tag: str) -> None:
        self.lines.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        normalized = re.sub(r"\s+", " ", data).strip()
        if normalized:
            self.lines.append(normalized)


def _normalize_html(html: str, ignore_attr_prefixes: tuple[str, ...], ignore_attrs: tuple[str, ...]) -> list[str]:
    parser = _NormalizingParser(
        ignore_attr_prefixes=ignore_attr_prefixes,
        ignore_attrs=ignore_attrs,
    )
    parser.feed(html)
    return parser.lines


def diff_dom(
    html_a: str,
    html_b: str,
    ignore_attrs: tuple[str, ...] = ("data-", "id"),
) -> dict:
    """Structural HTML diff, ignoring noisy runtime attributes.

    Strips attributes whose names start with ``data-`` or equal ``id``,
    removes query strings from ``src`` values, and collapses whitespace
    before comparing. Uses ``difflib.unified_diff`` for the diff text.

    Args:
        html_a: reference HTML string.
        html_b: candidate HTML string.
        ignore_attrs: attribute names / prefixes to strip before comparison.
            Entries ending with ``-`` are treated as prefixes.

    Returns:
        dict with keys:
            equal — True if the normalised representations are identical
            diff  — unified diff text (empty string when equal)
    """
    # Split ignore_attrs into prefixes (end with "-") and exact names
    prefixes = tuple(a for a in ignore_attrs if a.endswith("-"))
    exact = tuple(a for a in ignore_attrs if not a.endswith("-"))

    lines_a = _normalize_html(html_a, ignore_attr_prefixes=prefixes, ignore_attrs=exact)
    lines_b = _normalize_html(html_b, ignore_attr_prefixes=prefixes, ignore_attrs=exact)

    if lines_a == lines_b:
        return {"equal": True, "diff": ""}

    diff_lines = list(
        difflib.unified_diff(
            lines_a,
            lines_b,
            fromfile="html_a",
            tofile="html_b",
            lineterm="",
        )
    )
    return {"equal": False, "diff": "\n".join(diff_lines)}
