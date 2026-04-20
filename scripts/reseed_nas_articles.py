"""Wipe all articles on the NAS MBEditor instance and reseed the five V5 showcase
templates via the public REST API.

Run with: python scripts/reseed_nas_articles.py [--yes]
Point MBEDITOR_API at the target instance (default http://localhost:7072/api/v1).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path


API = os.getenv("MBEDITOR_API", "http://localhost:7072/api/v1")
TEMPLATES = [
    "docs/cli/examples/templates/tpl_biz_minimal.json",
    "docs/cli/examples/templates/tpl_tech_neon.json",
    "docs/cli/examples/templates/tpl_vibrant.json",
    "docs/cli/examples/templates/tpl_literary.json",
    "docs/cli/examples/templates/tpl_magazine.json",
]


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
    existing = api("GET", "/articles")["data"]
    print(f"[pre] {len(existing)} articles on {API}")

    if "--yes" not in sys.argv:
        confirm = input(f"Delete all {len(existing)} articles and reseed 5 templates? [y/N] ")
        if confirm.strip().lower() not in ("y", "yes"):
            print("aborted")
            return

    for row in existing:
        api("DELETE", f"/articles/{row['id']}")
        print(f"[delete] {row['id']} {row['title']}")

    for src in TEMPLATES:
        raw = json.loads(Path(src).read_text(encoding="utf-8"))
        created = api("POST", "/articles", {"title": raw["title"], "mode": raw.get("mode", "html")})
        aid = created["data"]["id"]
        payload = {
            "mode": raw.get("mode", "html"),
            "html": raw.get("html", ""),
            "css": raw.get("css", ""),
            "js": raw.get("js", ""),
            "markdown": raw.get("markdown", ""),
            "cover": raw.get("cover", ""),
            "author": raw.get("author", ""),
            "digest": raw.get("digest", ""),
        }
        api("PUT", f"/articles/{aid}", payload)
        print(f"[seed] {aid} {raw['title']}")

    final = api("GET", "/articles")["data"]
    print(f"[post] {len(final)} articles:")
    for a in final:
        print(f"  - {a['id']}  {a['title']}")


if __name__ == "__main__":
    main()
