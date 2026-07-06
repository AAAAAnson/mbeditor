#!/usr/bin/env python3
"""Static CLI for WeChat SVG / HTML compatibility checks.

Usage:
    python scripts/validate_wechat_svg.py path/to/article.html

Exit code:
    0 = no issues
    1 = issues found

Warnings never fail the run (they are human-review items).

Backed by the same pure functions that power ``/api/v1/wechat/validate``
and the editor pre-publish dialog. Update one, update all.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Windows default consoles are GBK; force utf-8 so emoji / 中文 render cleanly.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass


def _import_validator():
    here = Path(__file__).resolve().parent
    backend_root = here.parent / "backend"
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    from app.services.svg_validator import validate_html  # noqa: WPS433
    return validate_html


def _print_report(filename: str, report: dict) -> None:
    stats = report["stats"]
    issues = report["issues"]
    warnings = report["warnings"]

    print(f"=== 微信 SVG 规范校验: {filename} ===\n")
    print("统计:")
    print(f"  SVG 元素: {stats['svg_count']}")
    print(f"  animate: {stats['animate_count']}")
    print(f"  animateTransform: {stats['animate_transform_count']}")
    print(f"  set: {stats['set_count']}")
    print(f"  链接 <a>: {stats['anchor_count']}")
    print()

    if issues:
        print(f"❌ 违规项（{len(issues)} 处 · 必须修复）:")
        for i in issues:
            print(f"  • 行 {i['line']}: {i['message']}")
            print(f"    → {i['suggestion']}")
        print()
    else:
        print("✅ 无违规项\n")

    if warnings:
        print(f"⚠️  警告项（{len(warnings)} 处 · 请人工确认）:")
        for w in warnings:
            print(f"  • 行 {w['line']}: {w['message']}")
            print(f"    → {w['suggestion']}")
        print()
    else:
        print("✅ 无警告项\n")


def main() -> int:
    if len(sys.argv) != 2:
        print("用法: python scripts/validate_wechat_svg.py <path-to-html-file>")
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: 文件不存在 {path}")
        return 2

    try:
        content = path.read_text(encoding="utf-8")
    except Exception as exc:
        print(f"ERROR: 无法读取文件 {path}: {exc}")
        return 2

    validate_html = _import_validator()
    report = validate_html(content)
    _print_report(path.name, report)
    return 1 if report["issues"] else 0


if __name__ == "__main__":
    sys.exit(main())
