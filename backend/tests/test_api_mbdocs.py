"""Tests for MBDoc CRUD API."""
import pytest


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    """隔离到 tmp:mbdoc_store 现读 APP_DATA_DIR(惰性),不再写真实 CWD。"""
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def test_list_mbdocs_empty(client):
    """Test listing when no documents exist."""
    response = client.get("/api/v1/mbdocs")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert isinstance(data["data"], list)


def test_create_mbdoc(client):
    """Test creating a new document."""
    response = client.post("/api/v1/mbdocs", json={
        "title": "Test Document",
        "author": "Test Author",
        "blocks": [
            {"type": "heading", "id": "b1", "level": 1, "text": "Hello"},
            {"type": "paragraph", "id": "b2", "text": "World"},
        ]
    })
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert data["data"]["meta"]["title"] == "Test Document"
    assert len(data["data"]["blocks"]) == 2


def test_get_mbdoc(client):
    """Test getting a document by ID."""
    create_resp = client.post("/api/v1/mbdocs", json={"title": "Get Test"})
    doc_id = create_resp.json()["data"]["id"]

    response = client.get(f"/api/v1/mbdocs/{doc_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["id"] == doc_id


def test_get_mbdoc_not_found(client):
    """Test getting a non-existent document."""
    response = client.get("/api/v1/mbdocs/nonexistent")
    assert response.status_code == 404


def test_update_mbdoc(client):
    """Test updating a document."""
    create_resp = client.post("/api/v1/mbdocs", json={"title": "Original"})
    doc_id = create_resp.json()["data"]["id"]

    response = client.put(f"/api/v1/mbdocs/{doc_id}", json={
        "title": "Updated",
        "blocks": [{"type": "paragraph", "id": "new", "text": "New content"}]
    })
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["meta"]["title"] == "Updated"
    assert len(data["data"]["blocks"]) == 1


def test_delete_mbdoc(client):
    """Test deleting a document."""
    create_resp = client.post("/api/v1/mbdocs", json={"title": "Delete Test"})
    doc_id = create_resp.json()["data"]["id"]

    response = client.delete(f"/api/v1/mbdocs/{doc_id}")
    assert response.status_code == 200
    assert response.json()["data"]["deleted"] is True

    get_resp = client.get(f"/api/v1/mbdocs/{doc_id}")
    assert get_resp.status_code == 404


def test_delete_mbdoc_not_found(client):
    """Test deleting a non-existent document."""
    response = client.delete("/api/v1/mbdocs/nonexistent")
    assert response.status_code == 404


def test_list_mbdocs_after_create(client):
    """Test listing documents after creating some."""
    client.post("/api/v1/mbdocs", json={"title": "Doc 1"})
    client.post("/api/v1/mbdocs", json={"title": "Doc 2"})

    response = client.get("/api/v1/mbdocs")
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 2
