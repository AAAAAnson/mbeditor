"""Verify that the article-list delete button on NAS V5 deletes a row after a
native confirm and keeps the rest intact.

Run with: python scripts/verify_nas_delete_button.py
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


API = "http://localhost:7072/api/v1"
FRONTEND = "http://localhost:7073"
OUT = Path("docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)


def api(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def main():
    created = api("POST", "/articles", {"title": "删除按钮冒烟 · 待删", "mode": "html"})
    aid = created["data"]["id"]
    api("PUT", f"/articles/{aid}", {"html": "<section>将被删除的内容</section>"})
    print(f"[arrange] created throwaway {aid}")

    snapshot = api("GET", "/articles")["data"]
    before_count = len(snapshot)
    print(f"[pre] list shows {before_count} articles")
    assert aid in [a["id"] for a in snapshot], "throwaway missing from list"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # Auto-accept the window.confirm prompt.
        page.on("dialog", lambda d: d.accept())

        page.goto(f"{FRONTEND}/", wait_until="networkidle")
        page.wait_for_timeout(1500)

        page.screenshot(path=str(OUT / "delete-btn-before.png"))

        # Click the row's delete button.
        clicked = page.evaluate(
            """(aid) => {
                const btn = document.querySelector(`[data-testid="delete-article-${aid}"]`);
                if (!btn) return false;
                btn.click();
                return true;
            }""",
            aid,
        )
        print(f"[act] delete button clicked: {clicked}")
        page.wait_for_timeout(1500)

        # The list should re-render without the deleted row.
        still_there = page.evaluate(
            """(aid) => document.querySelector(`[data-testid="delete-article-${aid}"]`) !== null""",
            aid,
        )
        print(f"[assert] list still contains throwaway row? {still_there}")

        page.screenshot(path=str(OUT / "delete-btn-after.png"))
        ctx.close()
        browser.close()

    after = api("GET", "/articles")["data"]
    survived = any(a["id"] == aid for a in after)
    print(f"[assert] backend still has throwaway? {survived}")
    print(f"[post] list shows {len(after)} articles")

    ok = (not survived) and (len(after) == before_count - 1)
    print(f"[verdict] DELETE_BUTTON_WORKS={ok}")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
