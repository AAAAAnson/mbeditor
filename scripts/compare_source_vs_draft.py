"""Side-by-side visual comparison: source HTML vs WeChat draft.

Renders the user's original HTML file in headless Chromium AND opens the
corresponding pushed draft in the WeChat MP backend, then writes both
screenshots + a row-aligned composite + a per-row diff chart so the
human can see exactly where the rendering deviates.

Usage:
    python scripts/compare_source_vs_draft.py <source.html> <media_id>
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from playwright.sync_api import sync_playwright  # noqa: E402
from PIL import Image  # noqa: E402

OUT = REPO_ROOT / "backend" / "tests" / "visual" / "_artifacts" / "publish_test"
OUT.mkdir(parents=True, exist_ok=True)


def render_source_html(html_path: Path, width: int = 586) -> Path:
    """Render source HTML to PNG at given column width (matching WeChat)."""
    out = OUT / f"{html_path.stem}_source.png"
    raw = html_path.read_text(encoding="utf-8")
    # Constrain body to width so layout matches WeChat's column
    constrained = raw.replace(
        "<body>",
        f'<body style="margin:0;padding:0;width:{width}px;background:#fff;">',
    )
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        page = b.new_page()
        page.set_viewport_size({"width": width, "height": 900})
        page.set_content(constrained, wait_until="networkidle")
        # Find the .aw container (the article wrapper) and screenshot it
        try:
            aw = page.locator(".aw").first
            aw.screenshot(path=str(out))
        except Exception:
            page.screenshot(path=str(out), full_page=True)
        b.close()
    return out


def fetch_draft_screenshot(media_id: str, title_hint: str) -> Path:
    from tests.visual.infrastructure import screenshot_wechat_draft
    return screenshot_wechat_draft(media_id, out_dir=OUT, title_hint=title_hint)


def composite_side_by_side(a: Path, b: Path, label_a: str, label_b: str) -> Path:
    img_a = Image.open(a).convert("RGB")
    img_b = Image.open(b).convert("RGB")
    H = max(img_a.size[1], img_b.size[1])
    W = img_a.size[0] + img_b.size[0] + 30
    canvas = Image.new("RGB", (W, H + 30), (240, 240, 240))
    canvas.paste(img_a, (0, 30))
    canvas.paste(img_b, (img_a.size[0] + 30, 30))
    out = OUT / "_compare_side_by_side.png"
    canvas.save(out)
    print(f"  side-by-side: {out}  (a={img_a.size} b={img_b.size})")
    return out


def per_section_diff(a: Path, b: Path) -> dict:
    img_a = Image.open(a).convert("RGB")
    img_b = Image.open(b).convert("RGB")
    return {
        "source_size": img_a.size,
        "draft_size": img_b.size,
        "source_height": img_a.size[1],
        "draft_height": img_b.size[1],
        "height_delta_pct": abs(img_a.size[1] - img_b.size[1]) / max(img_a.size[1], 1) * 100,
    }


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: compare_source_vs_draft.py <source.html> <media_id>")
        return 2

    src = Path(sys.argv[1])
    media_id = sys.argv[2]

    print(f"[1/3] Rendering source HTML: {src.name}")
    src_png = render_source_html(src)
    print(f"      {src_png}")

    print(f"[2/3] Fetching WeChat draft screenshot for media_id={media_id[:24]}...")
    draft_png = fetch_draft_screenshot(media_id, title_hint=src.stem)
    print(f"      {draft_png}")

    print("[3/3] Comparing dimensions ...")
    info = per_section_diff(src_png, draft_png)
    print(f"  source dimensions = {info['source_size']}")
    print(f"  draft  dimensions = {info['draft_size']}")
    print(f"  height delta      = {info['height_delta_pct']:.2f}%")

    composite_side_by_side(src_png, draft_png, "SOURCE", "DRAFT")
    print()
    print("Files in:", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
