"""``/api/v1/revisions`` API 测试。

响应信封照既有惯例(success/fail dict,AppError -> HTTP 200 + code 字段)。
"""
from fastapi.testclient import TestClient

from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    return TestClient(app)


def test_list_empty(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.get("/api/v1/revisions/a1").json()
    assert body["code"] == 0
    assert body["data"] == {"revisions": []}


def test_post_then_list_then_get(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.post("/api/v1/revisions/a1", json={"html": "<p>甲</p>", "reason": "chat_turn"})
    body = r.json()
    assert body["code"] == 0
    assert body["data"]["rev_id"] == "rev_1"

    lst = c.get("/api/v1/revisions/a1").json()
    assert lst["code"] == 0
    metas = lst["data"]["revisions"]
    assert len(metas) == 1
    assert metas[0]["rev_id"] == "rev_1"
    assert metas[0]["reason"] == "chat_turn"
    assert "html" not in metas[0]  # 列表只回元数据

    got = c.get("/api/v1/revisions/a1/rev_1").json()
    assert got["code"] == 0
    assert got["data"]["html"] == "<p>甲</p>"
    assert got["data"]["reason"] == "chat_turn"
    assert isinstance(got["data"]["ts"], float)


def test_get_missing_revision_404(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.get("/api/v1/revisions/a1/rev_404").json()
    assert body["code"] == 404


def test_invalid_article_id_400(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.post("/api/v1/revisions/bad.id", json={"html": "<p>x</p>", "reason": "chat_turn"}).json()
    assert body["code"] == 400
    body = c.get("/api/v1/revisions/bad.id").json()
    assert body["code"] == 400


def test_post_multiple_sequential_ids(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r1 = c.post("/api/v1/revisions/a1", json={"html": "<p>1</p>", "reason": "chat_turn"}).json()
    r2 = c.post("/api/v1/revisions/a1", json={"html": "<p>2</p>", "reason": "ai_adopt"}).json()
    assert r1["data"]["rev_id"] == "rev_1"
    assert r2["data"]["rev_id"] == "rev_2"
    metas = c.get("/api/v1/revisions/a1").json()["data"]["revisions"]
    assert [m["rev_id"] for m in metas] == ["rev_2", "rev_1"]  # 新的在前
