"""``/api/v1/articles`` API 测试。

响应信封照既有惯例(success/fail dict,AppError -> HTTP 200 + code 字段)。
"""
from fastapi.testclient import TestClient

from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    return TestClient(app)


def _payload(**over):
    body = {
        "title": "标题",
        "mode": "html",
        "html": "<p>正文</p>",
        "css": "",
        "js": "",
        "markdown": "",
        "author": "作者",
        "digest": "摘要",
        "cover": "",
        "created_at": "2026-07-01T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z",
        "base_updated_at": None,
    }
    body.update(over)
    return body


def test_put_creates_then_get(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.put("/api/v1/articles/a1", json=_payload()).json()
    assert body["code"] == 0
    assert body["data"]["article"]["id"] == "a1"
    assert body["data"]["conflict_rev_id"] is None

    got = c.get("/api/v1/articles/a1").json()
    assert got["code"] == 0
    assert got["data"]["article"]["html"] == "<p>正文</p>"
    assert got["data"]["article"]["deleted_at"] is None


def test_get_missing_404(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.get("/api/v1/articles/nope").json()["code"] == 404


def test_list_excludes_deleted_and_large_fields(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/articles/a1", json=_payload())
    c.put("/api/v1/articles/a2", json=_payload(title="乙"))
    c.delete("/api/v1/articles/a2")

    body = c.get("/api/v1/articles").json()
    assert body["code"] == 0
    items = body["data"]["articles"]
    assert [i["id"] for i in items] == ["a1"]
    assert "html" not in items[0]

    everything = c.get("/api/v1/articles", params={"include_deleted": "true"}).json()
    assert {i["id"] for i in everything["data"]["articles"]} == {"a1", "a2"}


def test_soft_delete_then_restore(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/articles/a1", json=_payload())
    body = c.delete("/api/v1/articles/a1").json()
    assert body["code"] == 0
    assert body["data"]["article"]["deleted_at"]

    body = c.post("/api/v1/articles/a1/restore").json()
    assert body["code"] == 0
    assert body["data"]["article"]["deleted_at"] is None
    assert c.get("/api/v1/articles/a1").json()["data"]["article"]["deleted_at"] is None


def test_delete_and_restore_missing_404(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.delete("/api/v1/articles/nope").json()["code"] == 404
    assert c.post("/api/v1/articles/nope/restore").json()["code"] == 404
    assert c.delete("/api/v1/articles/nope", params={"purge": "true"}).json()["code"] == 404


def test_purge_removes_article_and_revisions(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/articles/a1", json=_payload())
    c.post("/api/v1/revisions/a1", json={"html": "<p>旧</p>", "reason": "chat_turn"})
    assert (tmp_path / "revisions_a1.json").exists()

    body = c.delete("/api/v1/articles/a1", params={"purge": "true"}).json()
    assert body["code"] == 0
    assert not (tmp_path / "articles" / "a1.json").exists()
    assert not (tmp_path / "revisions_a1.json").exists()
    assert c.get("/api/v1/articles/a1").json()["code"] == 404


def test_put_conflict_returns_rev_id_visible_in_revisions(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/articles/a1", json=_payload(
        html="<p>服务端版</p>", updated_at="2026-07-05T02:00:00.000Z"))
    body = c.put("/api/v1/articles/a1", json=_payload(
        html="<p>客户端版</p>",
        updated_at="2026-07-05T03:00:00.000Z",
        base_updated_at="2026-07-05T01:00:00.000Z",
    )).json()
    assert body["code"] == 0
    rev_id = body["data"]["conflict_rev_id"]
    assert rev_id

    metas = c.get("/api/v1/revisions/a1").json()["data"]["revisions"]
    assert metas[0]["rev_id"] == rev_id
    assert metas[0]["reason"] == "conflict"
    got = c.get(f"/api/v1/revisions/a1/{rev_id}").json()
    assert got["data"]["html"] == "<p>服务端版</p>"
    assert c.get("/api/v1/articles/a1").json()["data"]["article"]["html"] == "<p>客户端版</p>"


def test_invalid_article_id_400(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.put("/api/v1/articles/bad.id", json=_payload()).json()["code"] == 400
    assert c.get("/api/v1/articles/bad.id").json()["code"] == 400


def test_put_ignores_unknown_fields(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.put("/api/v1/articles/a1", json=_payload(future_field="x")).json()
    assert body["code"] == 0
    assert "future_field" not in body["data"]["article"]
