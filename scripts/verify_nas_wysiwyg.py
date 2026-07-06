"""End-to-end check: drive the NAS MBEditor V5 frontend and prove the
preview canvas accepts free-form edits that sync back to stored HTML.

Run with: python scripts/verify_nas_wysiwyg.py
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


API = os.getenv("MBEDITOR_API", "http://localhost:7072/api/v1")
FRONTEND = os.getenv("MBEDITOR_FRONTEND", "http://localhost:7073")
OUT_DIR = Path("docs/screenshots")


def _api(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    version = _api("GET", "/version")["data"]
    print(f"[pre] API version: {version['version']}")

    seed_html = (
        '<section><h2 id="nas-check">NAS WYSIWYG · 原始标题</h2>'
        '<p>第一段：用于验证预览框自由编辑。</p>'
        '<p>第二段：500ms 防抖之后应同步到源码。</p></section>'
    )
    created = _api("POST", "/articles", {"title": "WYSIWYG NAS 冒烟 V5", "mode": "html"})
    aid = created["data"]["id"]
    print(f"[arrange] created article {aid}")
    try:
        _api("PUT", f"/articles/{aid}", {"html": seed_html})

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            page.goto(f"{FRONTEND}/", wait_until="networkidle")
            page.wait_for_timeout(1500)

            # Click into the article by id so we do not rely on ordering.
            clicked = page.evaluate(
                """(hint) => {
                    const suffix = hint.slice(-3).toUpperCase();
                    const row = Array.from(document.querySelectorAll('div, section'))
                        .find(el => {
                            const t = el.textContent || '';
                            return t.includes(suffix) && /^\\d{3}/.test(t.trim()) && t.length < 300;
                        });
                    row?.click();
                    return !!row;
                }""",
                aid,
            )
            print(f"[act] opened article row: {clicked}")
            page.wait_for_timeout(1200)

            page.evaluate(
                """() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    btns.find(b => b.textContent?.trim() === '预览')?.click();
                }"""
            )
            page.wait_for_timeout(1500)

            page.screenshot(path=str(OUT_DIR / "nas-wysiwyg-before.png"))

            # Mutate the heading text and the first paragraph via contenteditable.
            mutated = page.evaluate(
                """() => {
                    const editable = document.querySelector('[data-testid="preview-editable-content"]');
                    if (!editable) return { error: 'no editable', attrs: null };
                    const attrs = editable.getAttribute('contenteditable');

                    const heading = editable.querySelector('h2');
                    if (heading) heading.textContent = 'NAS WYSIWYG · 已被预览改过';

                    const ps = editable.querySelectorAll('p');
                    if (ps.length >= 1) ps[0].textContent = '第一段已在预览里改写 ✔';

                    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    return { attrs, heading: heading?.textContent, p0: ps[0]?.textContent };
                }"""
            )
            print(f"[act] contenteditable={mutated.get('attrs')}, heading={mutated.get('heading')!r}")

            # Wait past the 500ms debounce, plus autosave.
            page.wait_for_timeout(2500)
            page.screenshot(path=str(OUT_DIR / "nas-wysiwyg-after.png"))

            ctx.close()
            browser.close()

        fresh = _api("GET", f"/articles/{aid}")["data"]
        html = fresh["html"]
        success = (
            "NAS WYSIWYG · 已被预览改过" in html
            and "第一段已在预览里改写" in html
            and "NAS WYSIWYG · 原始标题" not in html
        )
        print("[assert] html persisted to backend? ", success)
        print("[assert] body snippet:", html[:240])
        if not success:
            raise SystemExit(1)
    finally:
        _api("DELETE", f"/articles/{aid}")
        print(f"[cleanup] removed {aid}")


if __name__ == "__main__":
    main()
