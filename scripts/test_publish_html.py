"""End-to-end smoke test for the WeChat publish pipeline.

Loads a complex external HTML article (printmaster_wechat_animated.html),
saves it as an MBEditor article, exercises BOTH publish paths:

  1. /publish/preview     — what the "复制" button would inline & sanitize
  2. /publish/draft       — actually push to the WeChat draft box

Then opens the resulting draft in the WeChat MP backend (using the existing
parity-test auth state) and screenshots it for visual inspection.

Usage:
    python scripts/test_publish_html.py [path/to/html]
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path
from urllib.error import HTTPError

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

DEFAULT_HTML_PATH = Path(
    r"D:\Work\罗安生\公众号\20260412\printmaster_wechat_animated.html"
)
API_BASE = "http://localhost:8001/api/v1"
OUT_DIR = REPO_ROOT / "backend" / "tests" / "visual" / "_artifacts" / "publish_test"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def _api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {method} {path}: {body_text}") from e


def main() -> int:
    html_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HTML_PATH
    if not html_path.exists():
        print(f"ERROR: HTML file not found: {html_path}", file=sys.stderr)
        return 2

    raw_html = html_path.read_text(encoding="utf-8")
    title = html_path.stem
    print(f"[1/6] Loaded {html_path.name} ({len(raw_html)} chars), title={title!r}")

    print("[2/6] Creating MBEditor article ...")
    resp = _api("POST", "/articles", {"title": title, "mode": "html"})
    article_id = resp["data"]["id"]
    print(f"      article_id = {article_id}")

    print("[3/6] Uploading HTML body to article ...")
    _api("PUT", f"/articles/{article_id}", {"html": raw_html, "css": ""})
    print("      saved")

    print("[4/6] POST /publish/preview (inline CSS + sanitize) ...")
    preview = _api("POST", "/publish/preview", {"html": raw_html, "css": ""})
    processed_html = preview["data"]["html"]
    preview_path = OUT_DIR / f"{article_id}_preview.html"
    preview_path.write_text(processed_html, encoding="utf-8")
    print(f"      preview HTML: {len(processed_html)} chars → {preview_path}")

    print("[5/6] POST /publish/draft (push to WeChat) ...")
    try:
        draft_resp = _api(
            "POST", "/publish/draft",
            {"article_id": article_id, "author": "MBEditor 测试", "digest": ""},
        )
        draft_data = draft_resp["data"]
        media_id = draft_data.get("media_id", "")
        print(f"      draft pushed, media_id = {media_id!r}")
        print(f"      full response: {draft_data}")
    except RuntimeError as exc:
        print(f"      ERROR pushing draft: {exc}")
        media_id = ""

    if media_id:
        print("[6/6] Screenshotting WeChat draft via persisted login ...")
        try:
            from tests.visual.infrastructure import screenshot_wechat_draft  # noqa: E402
            shot = screenshot_wechat_draft(
                media_id, out_dir=OUT_DIR, title_hint=title
            )
            print(f"      screenshot: {shot}")
        except Exception as exc:
            print(f"      WARN: screenshot failed: {exc}")
    else:
        print("[6/6] skipped (no media_id)")

    print()
    print("=" * 60)
    print(f"article_id  = {article_id}")
    print(f"preview     = {preview_path}")
    print(f"media_id    = {media_id}")
    print(f"artifacts   = {OUT_DIR}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
