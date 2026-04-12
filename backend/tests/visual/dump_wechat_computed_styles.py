"""Calibration helper — dump WeChat MP backend computed CSS for h1-h6 and p.

Reuses the same navigation flow as ``screenshot_wechat_draft`` but, instead
of screenshotting ``.rich_media_content``, calls ``page.evaluate`` to dump
``getComputedStyle`` for every heading and paragraph inside it. The output
is the authoritative reference for calibrating
``backend/app/services/renderers/heading_paragraph.py``.

Usage (from ``backend/`` with auth state present)::

    python tests/visual/dump_wechat_computed_styles.py

Side effects:
  1. Pushes the Task-11 baseline MBDoc to WeChat as a draft (idempotent —
     creates a new draft on each run; old drafts are left untouched).
  2. Navigates to that draft's edit page via the persisted login session.
  3. Prints a JSON dict of computed styles per selector to stdout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure repo-root imports work when invoked as a script
_THIS_DIR = Path(__file__).parent
_BACKEND_DIR = _THIS_DIR.parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from tests.visual.test_baseline import _make_baseline_doc  # noqa: E402
from tests.visual.infrastructure import push_mbdoc_to_wechat_draft  # noqa: E402

_AUTH_STATE_PATH = _THIS_DIR / ".auth" / "state.json"

# Properties we care about for renderer calibration
_PROPS = [
    "fontSize",
    "fontWeight",
    "lineHeight",
    "color",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontFamily",
    "textAlign",
    "transform",
    "zoom",
    "letterSpacing",
    "wordSpacing",
    "boxSizing",
    "textJustify",
    "wordBreak",
    "overflowWrap",
    "hyphens",
    "textRendering",
    "webkitFontSmoothing",
    "fontFeatureSettings",
    "fontVariantNumeric",
    "fontKerning",
    "whiteSpace",
    "tabSize",
    "writingMode",
    "textAlignLast",
    "textIndent",
    "textJustifyTrim",
    "textOrientation",
    "fontStretch",
    "fontVariant",
    "fontOpticalSizing",
    "textSizeAdjust",
    "minWidth",
    "maxWidth",
    "boxDecorationBreak",
]


def _dump_computed_styles(popup) -> dict:
    js = """
    (props) => {
        const content = document.querySelector('.rich_media_content');
        if (!content) return {error: 'no .rich_media_content'};
        const result = {};
        // Also grab the container itself for context
        const containerStyle = getComputedStyle(content);
        result['.rich_media_content'] = Object.fromEntries(
            props.map(p => [p, containerStyle[p]])
        );
        const rect = content.getBoundingClientRect();
        result['.rich_media_content']._bbox = {
            width: rect.width, height: rect.height,
            offsetWidth: content.offsetWidth,
            clientWidth: content.clientWidth,
        };
        // Walk up parents to find any forced width/padding
        let p = content.parentElement;
        const ancestors = [];
        while (p && ancestors.length < 8) {
            const cs = getComputedStyle(p);
            ancestors.push({
                tag: p.tagName.toLowerCase(),
                cls: p.className,
                width: cs.width,
                paddingLeft: cs.paddingLeft,
                paddingRight: cs.paddingRight,
                marginLeft: cs.marginLeft,
                marginRight: cs.marginRight,
                fontFamily: cs.fontFamily,
                fontSize: cs.fontSize,
                textAlign: cs.textAlign,
                transform: cs.transform,
                zoom: cs.zoom,
                boxSizing: cs.boxSizing,
            });
            p = p.parentElement;
        }
        result['.rich_media_content']._ancestors = ancestors;
        // Also measure the actual H1's bbox to see real rendered height
        const h1 = content.querySelector('h1');
        if (h1) {
            const h1rect = h1.getBoundingClientRect();
            result['.rich_media_content']._h1_bbox = {
                width: h1rect.width, height: h1rect.height,
                top: h1rect.top, left: h1rect.left,
            };
            const h1parent = h1.parentElement;
            if (h1parent) {
                const pcs = getComputedStyle(h1parent);
                const pr = h1parent.getBoundingClientRect();
                result['.rich_media_content']._h1_parent = {
                    tag: h1parent.tagName.toLowerCase(),
                    cls: h1parent.className,
                    width: pcs.width,
                    paddingLeft: pcs.paddingLeft,
                    paddingRight: pcs.paddingRight,
                    paddingTop: pcs.paddingTop,
                    paddingBottom: pcs.paddingBottom,
                    marginTop: pcs.marginTop,
                    marginBottom: pcs.marginBottom,
                    borderTop: pcs.borderTopWidth,
                    borderBottom: pcs.borderBottomWidth,
                    minHeight: pcs.minHeight,
                    display: pcs.display,
                    bbox_width: pr.width,
                    bbox_top: pr.top,
                    bbox_height: pr.height,
                    boxSizing: pcs.boxSizing,
                    letterSpacing: pcs.letterSpacing,
                };
                // h1 actual offsetTop within parent
                result['.rich_media_content']._h1_offsetTop = h1.offsetTop;
            }
            // Also check h1 itself for letterSpacing/padding
            const hcs = getComputedStyle(h1);
            result['.rich_media_content']._h1_extra = {
                letterSpacing: hcs.letterSpacing,
                paddingLeft: hcs.paddingLeft,
                paddingRight: hcs.paddingRight,
                boxSizing: hcs.boxSizing,
            };
        }
        // Also rich_media_content direct bbox.left for offset comparison
        result['.rich_media_content']._self_left = rect.left;
        const firstP = content.querySelector('p');
        if (firstP) {
            const pr = firstP.getBoundingClientRect();
            result['.rich_media_content']._p_bbox = {
                width: pr.width, height: pr.height,
                top: pr.top, left: pr.left,
                offsetWidth: firstP.offsetWidth,
            };
        }
        // Container display/overflow to detect BFC
        const ccs = getComputedStyle(content);
        result['.rich_media_content']._bfc = {
            display: ccs.display,
            overflow: ccs.overflow,
        };
        // h1 top relative to .rich_media_content top
        if (h1) {
            result['.rich_media_content']._h1_relTop = h1.getBoundingClientRect().top - rect.top;
        }
        // last p bottom relative to .rich_media_content bottom
        const allPs = content.querySelectorAll('p');
        if (allPs.length) {
            const last = allPs[allPs.length - 1];
            const lr = last.getBoundingClientRect();
            result['.rich_media_content']._lastP_relBottom = (rect.top + rect.height) - (lr.top + lr.height);
        }
        const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];
        for (const sel of selectors) {
            const els = content.querySelectorAll(sel);
            if (els.length === 0) continue;
            // Dump per-index (there may be multiple p's)
            result[sel] = [];
            els.forEach((el, i) => {
                const s = getComputedStyle(el);
                const entry = {index: i, text: (el.textContent || '').slice(0, 30)};
                for (const p of props) entry[p] = s[p];
                // Also capture the inline style attribute so we can see
                // what WeChat's sanitizer left on the element.
                entry._inline = el.getAttribute('style') || '';
                result[sel].push(entry);
            });
        }
        return result;
    }
    """
    return popup.evaluate(js, _PROPS)


def main() -> int:
    from playwright.sync_api import sync_playwright

    if not _AUTH_STATE_PATH.exists():
        print(
            "ERROR: .auth/state.json missing. Run auth_login.py first.",
            file=sys.stderr,
        )
        return 2

    doc = _make_baseline_doc()
    print(f"[1/3] Pushing baseline doc to WeChat (title={doc.meta.title!r}) ...")
    media_id = push_mbdoc_to_wechat_draft(doc)
    print(f"      media_id = {media_id}")

    print("[2/3] Opening draft edit page via persisted session ...")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(_AUTH_STATE_PATH),
            viewport={"width": 1440, "height": 900},
        )
        page = context.new_page()
        try:
            page.goto("https://mp.weixin.qq.com/", wait_until="networkidle", timeout=30_000)
            if "/cgi-bin/" not in page.url or "token=" not in page.url:
                raise RuntimeError(f"WeChat session expired: {page.url}")
            token = page.url.split("token=")[1].split("&")[0]

            drafts_url = (
                f"https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=77"
                f"&action=list_card&token={token}&lang=zh_CN"
            )
            page.goto(drafts_url, wait_until="networkidle", timeout=30_000)

            card = page.locator(".weui-desktop-card", has_text=doc.meta.title).first
            if card.count() == 0:
                raise RuntimeError(f"Draft card not found for title={doc.meta.title!r}")
            card.hover()

            edit_icon = card.locator("a.weui-desktop-icon20.weui-desktop-icon-btn").nth(1)
            with context.expect_page(timeout=15_000) as popup_info:
                edit_icon.click()
            popup = popup_info.value
            popup.wait_for_load_state("networkidle", timeout=30_000)
            popup.locator(".rich_media_content").first.wait_for(
                state="visible", timeout=20_000
            )

            print("[3/3] Dumping getComputedStyle ...")
            dump = _dump_computed_styles(popup)
        finally:
            browser.close()

    print("\n========== WECHAT COMPUTED STYLES ==========")
    print(json.dumps(dump, indent=2, ensure_ascii=False))
    print("============================================\n")

    out_file = _THIS_DIR / "_artifacts" / "wechat_computed_styles.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(dump, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Written to: {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
