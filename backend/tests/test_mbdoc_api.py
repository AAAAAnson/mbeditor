"""End-to-end tests for /api/v1/mbdoc endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _isolate_storage(tmp_path, monkeypatch):
    """Redirect MBDocStorage to a per-test temp directory so tests don't
    share state and don't pollute /app/data."""
    from app.core import config as config_mod
    monkeypatch.setattr(
        config_mod.settings, "MBDOCS_DIR", str(tmp_path / "mbdocs")
    )
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _sample_payload() -> dict:
    return {
        "id": "doc-test-1",
        "version": "1",
        "meta": {"title": "Test Doc", "author": "Anson"},
        "blocks": [
            {"id": "h1", "type": "heading", "level": 1, "text": "Hello"},
            {"id": "p1", "type": "paragraph", "text": "World"},
        ],
    }


def test_create_mbdoc(client: TestClient):
    resp = client.post("/api/v1/mbdoc", json=_sample_payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["id"] == "doc-test-1"


def test_get_mbdoc(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())
    resp = client.get("/api/v1/mbdoc/doc-test-1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["meta"]["title"] == "Test Doc"
    assert len(body["data"]["blocks"]) == 2


def test_get_missing_mbdoc_returns_404(client: TestClient):
    resp = client.get("/api/v1/mbdoc/nonexistent")
    assert resp.status_code == 404


def test_update_mbdoc(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())
    updated = _sample_payload()
    updated["meta"]["title"] = "Updated Title"
    resp = client.put("/api/v1/mbdoc/doc-test-1", json=updated)
    assert resp.status_code == 200

    resp = client.get("/api/v1/mbdoc/doc-test-1")
    assert resp.json()["data"]["meta"]["title"] == "Updated Title"


def test_update_mbdoc_id_mismatch_returns_400(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())
    bad = _sample_payload()
    bad["id"] = "different-id"
    resp = client.put("/api/v1/mbdoc/doc-test-1", json=bad)
    assert resp.status_code == 400


def test_delete_mbdoc(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())
    resp = client.delete("/api/v1/mbdoc/doc-test-1")
    assert resp.status_code == 200

    resp = client.get("/api/v1/mbdoc/doc-test-1")
    assert resp.status_code == 404


def test_delete_missing_returns_404(client: TestClient):
    resp = client.delete("/api/v1/mbdoc/nonexistent")
    assert resp.status_code == 404


def test_list_mbdocs(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())

    p2 = _sample_payload()
    p2["id"] = "doc-test-2"
    client.post("/api/v1/mbdoc", json=p2)

    resp = client.get("/api/v1/mbdoc")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["data"]}
    assert "doc-test-1" in ids
    assert "doc-test-2" in ids


def test_list_mbdocs_empty(client: TestClient):
    resp = client.get("/api/v1/mbdoc")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_render_mbdoc_preview_mode(client: TestClient):
    client.post("/api/v1/mbdoc", json=_sample_payload())
    resp = client.post(
        "/api/v1/mbdoc/doc-test-1/render?upload_images=false"
    )
    assert resp.status_code == 200
    html = resp.json()["data"]["html"]
    assert "<h1" in html
    assert "Hello" in html
    assert "World" in html
    assert "<p" in html


def test_render_mbdoc_preview_and_upload_equal_for_text_only(client: TestClient):
    """WYSIWYG invariant: text-only docs yield identical HTML in both modes."""
    client.post("/api/v1/mbdoc", json=_sample_payload())
    a = client.post(
        "/api/v1/mbdoc/doc-test-1/render?upload_images=false"
    ).json()["data"]["html"]
    b = client.post(
        "/api/v1/mbdoc/doc-test-1/render?upload_images=true"
    ).json()["data"]["html"]
    assert a == b


def test_render_missing_mbdoc_returns_404(client: TestClient):
    resp = client.post(
        "/api/v1/mbdoc/nonexistent/render?upload_images=false"
    )
    assert resp.status_code == 404


def test_create_mbdoc_validation_error(client: TestClient):
    """Invalid payload returns 422."""
    bad = {"id": "x", "blocks": [{"id": "b", "type": "heading", "level": 99}]}
    resp = client.post("/api/v1/mbdoc", json=bad)
    assert resp.status_code == 422


def test_create_mbdoc_rejects_unsafe_id(client: TestClient):
    """Path-traversal id is rejected at schema level (422)."""
    bad = _sample_payload()
    bad["id"] = "../etc/passwd"
    resp = client.post("/api/v1/mbdoc", json=bad)
    assert resp.status_code == 422


def test_legacy_articles_endpoint_still_responds(client: TestClient):
    """Stage 1 must not break legacy /articles route."""
    resp = client.get("/api/v1/articles")
    # Must NOT be 404 (which would indicate the route was unregistered).
    assert resp.status_code != 404
