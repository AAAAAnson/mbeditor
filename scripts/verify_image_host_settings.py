"""Plan B E2E: verify the 图床 settings tab persists GitHub config, the
测试上传 button dispatches through the active engine, and a file dropped on
the editor preview goes through the same engine.

Runs against http://localhost:5173 (Vite dev server).
"""
from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from playwright.async_api import async_playwright, Route


SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "screenshots" / "plan-b"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

GH_RESPONSE = {
    "content": {
        "download_url": "https://raw.githubusercontent.com/me/img/main/2026/04/e2e.png",
        "path": "2026/04/e2e.png",
    }
}


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        async def handle_github(route: Route) -> None:
            await route.fulfill(
                status=201,
                content_type="application/json",
                body=json.dumps(GH_RESPONSE),
            )

        await context.route("https://api.github.com/**", handle_github)

        await page.goto("http://localhost:5173")

        # Nav → Settings surface via SideRail (button has title="设置")
        await page.get_by_role("button", name="设置").click()

        # Click 图床 nav entry in SettingsSurface
        await page.get_by_role("button", name="图床").click()

        # Pick GitHub engine
        await page.get_by_role("radio", name="GitHub").check()

        # Fill config
        repo = page.get_by_label("仓库")
        await repo.fill("me/img")
        await repo.blur()

        branch = page.get_by_label("分支")
        await branch.fill("main")
        await branch.blur()

        token = page.get_by_label("Access Token")
        await token.fill("test-token")
        await token.blur()

        await page.get_by_role("button", name="测试上传").click()

        result = page.get_by_test_id("imagehost-test-result")
        await result.wait_for(state="visible", timeout=5000)
        text = await result.text_content()
        assert text and "raw.githubusercontent.com/me/img" in text, f"unexpected result: {text}"

        storage = await page.evaluate("window.localStorage.getItem('mbeditor.imagehost')")
        assert storage and "me/img" in storage, "non-sensitive config not persisted"
        assert "test-token" not in storage, "sensitive token was persisted"

        await page.screenshot(path=str(SHOT_DIR / "imagehost-github-success.png"))

        # ── Task 32: editor drop routes through active engine ──
        # Navigate to article list via TopBar (text label visible) and create a fresh article.
        await page.get_by_role("button", name="文章").first.click()
        await page.get_by_role("button", name="新建文章").click()

        # Wait for the editor's preview-editable-content div to mount.
        await page.wait_for_selector(
            '[data-testid="preview-editable-content"]', timeout=10000
        )

        # Build an in-browser File from bytes, then dispatch dragover+drop on the preview.
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
        )
        data_handle = await page.evaluate_handle(
            "(bytes) => new File([new Uint8Array(bytes)], 'drop.png', {type:'image/png'})",
            list(png),
        )
        await page.evaluate(
            """async (file) => {
                const dt = new DataTransfer();
                dt.items.add(file);
                const el = document.querySelector('[data-testid="preview-editable-content"]');
                if (!el) throw new Error('editor root not found');
                el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
                el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
            }""",
            data_handle,
        )

        img = page.locator("img[src*='raw.githubusercontent.com/me/img']")
        await img.first.wait_for(state="attached", timeout=5000)
        await page.screenshot(path=str(SHOT_DIR / "imagehost-editor-drop.png"))

        await browser.close()
        print("OK")


if __name__ == "__main__":
    asyncio.run(main())
