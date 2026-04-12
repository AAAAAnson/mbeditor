"""Bypass the running (stale) backend and publish using the on-disk code.

The backend process running on :8001 was started 2026-04-08 and predates
recent changes to publish.py — its in-memory module misses grid handling.
This script imports the current publish.py + wechat_service directly,
processes the HTML, and pushes the WeChat draft, then re-screenshots.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))
os.environ.setdefault("CONFIG_FILE", str(REPO_ROOT / "data" / "config.json"))

from app.api.v1.publish import _process_for_wechat  # noqa: E402
from app.services import wechat_service  # noqa: E402

OUT = REPO_ROOT / "backend" / "tests" / "visual" / "_artifacts" / "publish_test"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: test_publish_direct.py <html_path>")
        return 2

    src = Path(sys.argv[1])
    raw = src.read_text(encoding="utf-8")
    title = src.stem
    print(f"[1/4] Loaded {src.name} ({len(raw)} chars)")

    print("[2/4] _process_for_wechat (latest on-disk code) ...")
    processed = _process_for_wechat(raw, "")
    out_html = OUT / f"{src.stem}_direct_processed.html"
    out_html.write_text(processed, encoding="utf-8")
    print(f"      length: {len(processed)} chars → {out_html}")
    print(f"      display:grid count: {processed.count('display:grid')}")
    print(f"      grid-template count: {processed.count('grid-template')}")
    print(f"      display:flex count: {processed.count('display:flex')}")
    print(f"      opacity:0 count:    {processed.count('opacity:0')}")
    print(f"      translatey count:   {processed.count('translatey')}")

    print("[3/4] Pushing WeChat draft ...")
    result = wechat_service.create_draft(
        title=f"{title} [direct]",
        html=processed,
        author="MBE",
    )
    media_id = result["media_id"]
    print(f"      media_id = {media_id}")

    print("[4/4] Screenshotting WeChat draft ...")
    from tests.visual.infrastructure import screenshot_wechat_draft
    shot = screenshot_wechat_draft(
        media_id, out_dir=OUT, title_hint=f"{title} [direct]"
    )
    print(f"      screenshot: {shot}")

    print()
    print(f"media_id = {media_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
