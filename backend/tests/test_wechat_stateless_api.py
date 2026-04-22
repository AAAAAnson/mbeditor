# backend/tests/test_wechat_stateless_api.py
import io

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import wechat_service


@pytest.fixture(autouse=True)
def _reset_token_cache():
    wechat_service._token_cache.clear()
    yield
    wechat_service._token_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _install_wechat_mock(monkeypatch, routes: dict[str, dict]):
    """routes: url_substring -> response dict"""
    def fake_post(url, json=None, files=None, timeout=None, **_):
        request = httpx.Request("POST", url)
        for needle, payload in routes.items():
            if needle in url:
                return httpx.Response(200, json=payload, request=request)
        return httpx.Response(404, json={"errcode": 404, "errmsg": "unmocked"}, request=request)

    monkeypatch.setattr(httpx, "post", fake_post)


def test_test_connection_returns_200_with_valid_creds(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {"stable_token": {"access_token": "tok", "expires_in": 7200}})
    resp = client.post("/api/v1/wechat/test-connection", json={"appid": "wxA", "appsecret": "secretA"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["valid"] is True


def test_test_connection_rejects_missing_creds(client):
    resp = client.post("/api/v1/wechat/test-connection", json={"appid": "", "appsecret": ""})
    assert resp.status_code == 400 or resp.json()["code"] != 0


def test_upload_image_proxies_to_wechat(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {
        "stable_token": {"access_token": "tok", "expires_in": 7200},
        "media/uploadimg": {"url": "https://mmbiz.qpic.cn/abc.png"},
    })
    resp = client.post(
        "/api/v1/wechat/upload-image",
        data={"appid": "wxA", "appsecret": "secretA"},
        files={"file": ("foo.png", io.BytesIO(b"\x89PNG fake"), "image/png")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["url"] == "https://mmbiz.qpic.cn/abc.png"


def test_upload_image_requires_credentials(client):
    resp = client.post(
        "/api/v1/wechat/upload-image",
        data={"appid": "", "appsecret": ""},
        files={"file": ("foo.png", io.BytesIO(b"fake"), "image/png")},
    )
    assert resp.status_code == 400 or resp.json().get("code", 0) != 0


def test_draft_accepts_credentials_and_article(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {
        "stable_token": {"access_token": "tok", "expires_in": 7200},
        "add_material": {"media_id": "thumb-id"},
        "draft/add": {"media_id": "draft-id-42"},
    })
    resp = client.post(
        "/api/v1/wechat/draft",
        json={
            "appid": "wxA",
            "appsecret": "secretA",
            "article": {
                "title": "hello",
                "html": "<p>hi</p>",
                "author": "",
                "digest": "",
                "cover": "",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["media_id"] == "draft-id-42"
    # validation_report attached even when content is clean (agent learning signal)
    assert "validation_report" in body["data"]
    assert body["data"]["validation_report"]["issues"] == []
    assert body["data"]["validation_report"]["warnings"] == []


def test_draft_response_attaches_findings_for_violating_html(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {
        "stable_token": {"access_token": "tok", "expires_in": 7200},
        "add_material": {"media_id": "thumb-id"},
        "draft/add": {"media_id": "draft-id-99"},
    })
    resp = client.post(
        "/api/v1/wechat/draft",
        json={
            "appid": "wxA",
            "appsecret": "secretA",
            "article": {
                "title": "bad",
                "html": '<script>x</script><animate attributeName="color"/>',
                "author": "",
                "digest": "",
                "cover": "",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["media_id"] == "draft-id-99"
    report = body["data"]["validation_report"]
    rules = {i["rule"] for i in report["issues"]}
    assert {"forbidden-tag", "attribute-whitelist"}.issubset(rules)


def test_compose_has_no_data_volume():
    from pathlib import Path
    content = Path(__file__).resolve().parents[2].joinpath("docker-compose.yml").read_text(encoding="utf-8")
    assert "./data:/app/data" not in content
    assert "IMAGES_DIR" not in content
    assert "ARTICLES_DIR" not in content
    assert "MBDOCS_DIR" not in content
    assert "CONFIG_FILE" not in content
    assert "MAX_UPLOAD_SIZE" in content
