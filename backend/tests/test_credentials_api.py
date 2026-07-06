"""Tests for ``/api/v1/settings/credentials`` GET/PUT.

The whole point is that secrets never come back out, so the redaction assertions
scan the raw response text for the secret value.
"""
from fastapi.testclient import TestClient

from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    return TestClient(app)


def test_get_empty(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.get("/api/v1/settings/credentials").json()
    assert body["code"] == 0
    assert body["data"] == {"configured": []}


def test_put_then_get_redacts_secret(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": "SECRETX"})
    assert r.json()["code"] == 0
    got = c.get("/api/v1/settings/credentials")
    assert "SECRETX" not in got.text
    assert got.json()["data"]["configured"] == ["wxAAA"]


def test_put_empty_clears(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": "s"})
    c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": ""})
    assert c.get("/api/v1/settings/credentials").json()["data"]["configured"] == []


def test_put_null_keeps(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": "s"})
    c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": None})
    from app.services import credentials as cred
    assert cred.get_secret("wxAAA") == "s"


def test_put_missing_appid_400(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put("/api/v1/settings/credentials", json={"appid": "", "appsecret": "s"})
    assert r.status_code == 400 or r.json()["code"] != 0


def test_put_busts_token_cache(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    from app.services import wechat_service
    wechat_service._token_cache["wxAAA"] = {"access_token": "stale", "expires_at": 9_999_999_999}
    c.put("/api/v1/settings/credentials", json={"appid": "wxAAA", "appsecret": "s"})
    assert "wxAAA" not in wechat_service._token_cache
