"""One-time WeChat MP login script for visual parity tests.

Usage
-----
Run this script once before executing any test in ``tests/visual/`` that calls
``screenshot_wechat_draft``:

    python -m backend.tests.visual.auth_login
    # or from backend/:
    python tests/visual/auth_login.py

A headed Chromium window will open the WeChat MP login page. Scan the QR code
with your WeChat app (WeChat 测试账号 account). After the dashboard loads, press
Enter in this terminal to save the session and close the browser.

The session is persisted to:
    backend/tests/visual/.auth/state.json

This file is gitignored. If your session expires, re-run this script.
"""

from pathlib import Path


def main() -> None:
    from playwright.sync_api import sync_playwright

    auth_dir = Path(__file__).parent / ".auth"
    auth_dir.mkdir(parents=True, exist_ok=True)
    state_path = auth_dir / "state.json"

    print("=" * 60)
    print("MBEditor — WeChat MP 登录向导")
    print("=" * 60)
    print()
    print("正在打开微信公众号后台登录页面...")
    print("请用 WeChat 测试账号扫描二维码登录。")
    print()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        page.goto("https://mp.weixin.qq.com/", wait_until="networkidle")

        print("浏览器已打开。请完成以下步骤：")
        print("  1. 用微信 App 扫描屏幕上的二维码")
        print("  2. 在手机上确认登录")
        print("  3. 等待浏览器跳转到后台首页")
        print()
        input("完成登录后，按 Enter 保存会话并关闭浏览器... ")

        # Save storage state (cookies + localStorage)
        context.storage_state(path=str(state_path))
        browser.close()

    print()
    print(f"Login state saved to: {state_path}")
    print()
    print("Now you can run visual tests:")
    print("  cd backend && pytest tests/visual/ -q")
    print()
    print("If login expires later, re-run this script.")


if __name__ == "__main__":
    main()
