#!/usr/bin/env python3
"""Export the legacy data/ directory into a single JSON bundle.

This script is run once during the Plan A migration. The resulting bundle
can be imported back into MBEditor through Settings → "Import legacy data"
which writes to localStorage.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def load_articles(articles_dir: Path) -> list[dict]:
    out: list[dict] = []
    if not articles_dir.exists():
        return out
    for f in sorted(articles_dir.glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return out


def load_mbdocs(mbdocs_dir: Path) -> list[dict]:
    out: list[dict] = []
    if not mbdocs_dir.exists():
        return out
    for f in sorted(mbdocs_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        title = ""
        if isinstance(data.get("meta"), dict):
            title = data["meta"].get("title", "")
        out.append({"id": data.get("id", f.stem), "title": title, "data": data})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--articles-dir", default="data/articles")
    parser.add_argument("--mbdocs-dir", default="data/mbdocs")
    parser.add_argument("--output", default=None,
                        help="Output file path. Default: data/legacy-export-<ts>.json")
    args = parser.parse_args()

    articles = load_articles(Path(args.articles_dir))
    mbdocs = load_mbdocs(Path(args.mbdocs_dir))

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = Path(args.output) if args.output else Path("data") / f"legacy-export-{ts}.json"
    output.parent.mkdir(parents=True, exist_ok=True)

    bundle = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "articles": articles,
        "mbdocs": mbdocs,
    }
    output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(articles)} articles and {len(mbdocs)} mbdocs to {output}")


if __name__ == "__main__":
    main()
