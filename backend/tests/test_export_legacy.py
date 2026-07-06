# backend/tests/test_export_legacy.py
import json
import subprocess
import sys
from pathlib import Path


def test_export_legacy_writes_bundle(tmp_path):
    articles_dir = tmp_path / "articles"
    mbdocs_dir = tmp_path / "mbdocs"
    articles_dir.mkdir()
    mbdocs_dir.mkdir()

    (articles_dir / "a1.json").write_text(
        json.dumps({
            "id": "a1", "title": "T", "mode": "html", "html": "<p>x</p>",
            "css": "", "js": "", "markdown": "", "cover": "", "author": "", "digest": "",
            "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-02T00:00:00Z",
        }),
        encoding="utf-8",
    )
    (mbdocs_dir / "d1.json").write_text(
        json.dumps({"id": "d1", "meta": {"title": "Doc"}, "blocks": []}),
        encoding="utf-8",
    )

    script = Path(__file__).resolve().parents[2] / "scripts" / "export_legacy_data.py"
    output = tmp_path / "bundle.json"

    result = subprocess.run(
        [sys.executable, str(script), "--articles-dir", str(articles_dir),
         "--mbdocs-dir", str(mbdocs_dir), "--output", str(output)],
        capture_output=True, text=True, check=True,
    )

    assert output.exists(), result.stderr
    bundle = json.loads(output.read_text(encoding="utf-8"))
    assert bundle["version"] == 1
    assert len(bundle["articles"]) == 1
    assert bundle["articles"][0]["id"] == "a1"
    assert len(bundle["mbdocs"]) == 1
    assert bundle["mbdocs"][0]["id"] == "d1"
    assert bundle["mbdocs"][0]["title"] == "Doc"
