"""Reproduce the "预览一改格式全失效" bug on NAS.

Strategy: seed an article that mirrors a real template (inline styles, nested
<section>, SVG decorations). Edit one paragraph via the preview contenteditable
canvas. After the debounce, pull the stored HTML back and diff the style /
section / svg footprint.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


API = os.getenv("MBEDITOR_API", "http://localhost:7072/api/v1")
FRONTEND = os.getenv("MBEDITOR_FRONTEND", "http://localhost:7073")
OUT_DIR = Path("docs/screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def api(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


SEED_HTML = """<section style="padding:0;background:#FAF6EB;">
  <section style="background-color:#0f172a;padding:52px 28px 44px;text-align:center;">
    <section style="display:inline-block;padding:5px 20px;border:1px solid rgba(255,255,255,0.2);border-radius:2px;color:#94a3b8;font-size:11px;letter-spacing:6px;font-weight:bold;margin-bottom:18px;">INDUSTRY INSIGHT</section>
    <section style="font-size:28px;font-weight:bold;color:#ffffff;line-height:1.4;margin-bottom:10px;">2026 年第一季度<br/>行业趋势观察报告</section>
    <section style="font-size:13px;color:#64748b;line-height:1.7;">MBEditor Labs · 2026.04 · 深度研究</section>
  </section>
  <section style="padding:28px 22px;">
    <section style="font-size:13px;color:#64748b;letter-spacing:3px;font-weight:bold;margin-bottom:6px;">导读</section>
    <section style="width:40px;height:2px;background-color:#0f172a;margin-bottom:16px;"></section>
    <section style="font-size:15px;line-height:2;color:#334155;">2026 年开局，全球科技行业同时在三条主线上发力。本文从三个维度展开分析。</section>
  </section>
  <svg width="100%" height="40" viewBox="0 0 400 40"><line x1="0" y1="20" x2="400" y2="20" stroke="#3b82f6" stroke-width="2"/></svg>
</section>"""


def footprint(label, html):
    style_attrs = len(re.findall(r'style="[^"]*"', html))
    section_tags = len(re.findall(r"<section[\s>]", html))
    svg_tags = len(re.findall(r"<svg[\s>]", html))
    class_attrs = len(re.findall(r'class="[^"]*"', html))
    print(
        f"[{label}] len={len(html)}  style-attrs={style_attrs}  "
        f"<section>={section_tags}  <svg>={svg_tags}  class-attrs={class_attrs}"
    )
    return {
        "len": len(html),
        "style": style_attrs,
        "section": section_tags,
        "svg": svg_tags,
        "class": class_attrs,
    }


def main():
    ver = api("GET", "/version")["data"]["version"]
    print(f"[pre] API version {ver}")

    created = api("POST", "/articles", {"title": "预览编辑格式回归 · V5", "mode": "html"})
    aid = created["data"]["id"]
    api("PUT", f"/articles/{aid}", {"html": SEED_HTML})
    before = api("GET", f"/articles/{aid}")["data"]["html"]
    print(f"[arrange] seeded article {aid}")
    foot_before = footprint("before", before)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            page.goto(f"{FRONTEND}/", wait_until="networkidle")
            page.wait_for_timeout(1800)

            opened = page.evaluate(
                """(hint) => {
                    const tail = hint.slice(-3).toUpperCase();
                    const row = Array.from(document.querySelectorAll('div, section'))
                        .find(el => {
                            const t = el.textContent || '';
                            return t.includes(tail) && /^\\d{3}/.test(t.trim()) && t.length < 300;
                        });
                    row?.click();
                    return !!row;
                }""",
                aid,
            )
            print(f"[act] opened list row: {opened}")
            page.wait_for_timeout(1500)
            page.evaluate(
                "() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '预览')?.click();"
            )
            page.wait_for_timeout(1800)
            page.screenshot(path=str(OUT_DIR / "nas-styled-before.png"))

            # Edit only the 导读 heading — a tiny one-word swap, no structural change.
            result = page.evaluate(
                """() => {
                    const editable = document.querySelector('[data-testid="preview-editable-content"]');
                    if (!editable) return { error: 'no editable' };
                    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
                    let target = null;
                    while (walker.nextNode()) {
                      if (walker.currentNode.textContent?.trim() === '导读') {
                        target = walker.currentNode;
                        break;
                      }
                    }
                    if (!target) return { error: 'no 导读 node' };
                    target.textContent = '导读 · 回归';
                    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    return { updated: target.textContent };
                }"""
            )
            print(f"[act] mutation: {result}")
            page.wait_for_timeout(2500)
            page.screenshot(path=str(OUT_DIR / "nas-styled-after.png"))
            ctx.close()
            browser.close()

        after = api("GET", f"/articles/{aid}")["data"]["html"]
        foot_after = footprint("after ", after)

        lost_style = foot_before["style"] - foot_after["style"]
        lost_svg = foot_before["svg"] - foot_after["svg"]
        lost_section = foot_before["section"] - foot_after["section"]
        print(f"[delta] lost style attrs = {lost_style}")
        print(f"[delta] lost svg tags   = {lost_svg}")
        print(f"[delta] lost section    = {lost_section}")

        lead = after.find("导读")
        if lead >= 0:
            print(f"[sample] 导读 surround: {after[max(0, lead - 80):lead + 80]!r}")

        bug = lost_style > 0 or lost_svg > 0
        print(f"[verdict] BUG_REPRODUCED={bug}")

        # Save artifact for post-mortem.
        (OUT_DIR / "nas-styled-before.html").write_text(before, encoding="utf-8")
        (OUT_DIR / "nas-styled-after.html").write_text(after, encoding="utf-8")
    finally:
        api("DELETE", f"/articles/{aid}")
        print(f"[cleanup] removed {aid}")


if __name__ == "__main__":
    main()
