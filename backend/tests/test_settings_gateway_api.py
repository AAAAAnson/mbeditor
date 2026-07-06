"""Tests for the settings API (``app.api.v1.settings`` -> ``/api/v1/settings/gateway``).

Covers the shared contract from the Phase 1 plan / spec:
- GET defaults to ``direct`` (no stored config, no env).
- PUT persists then GET reflects it *without* leaking the token (redaction).
- PUT ``token=null`` / ``caPem=null`` keeps the existing stored values.
- PUT rejects ``enabled && https-gateway`` without a ``base``.
- POST /test classifies an unreachable gateway as ``reachable=false``.

Secrets never appear in GET responses -- that is the whole point of this feature,
so the redaction assertions search the raw response text for the token value.
"""
import ssl

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    # Ensure env-mode gateway never bleeds into these tests.
    monkeypatch.delenv("WECHAT_API_BASE", raising=False)
    monkeypatch.delenv("WECHAT_PROXY_TOKEN", raising=False)
    monkeypatch.delenv("WECHAT_PROXY_CA", raising=False)
    yield


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    from app.services import gateway as gw

    gw._reset_caches()
    return TestClient(app)


def test_get_default_direct(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    body = c.get("/api/v1/settings/gateway").json()
    assert body["code"] == 0
    d = body["data"]
    assert d["source"] == "direct"
    assert d["transport"] == "direct"
    assert d["enabled"] is False
    assert d["tokenConfigured"] is False
    assert d["caConfigured"] is False


def test_put_then_get_redacts_token(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "https://gw:8443",
            "token": "SECRETX",
            "caPem": "",
        },
    )
    assert r.json()["code"] == 0
    resp = c.get("/api/v1/settings/gateway")
    assert "SECRETX" not in resp.text
    data = resp.json()["data"]
    assert data["tokenConfigured"] is True
    assert data["source"] == "stored"
    assert data["base"] == "https://gw:8443"


def test_put_token_null_keeps_existing(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "https://gw:8443",
            "token": "KEEPME",
            "caPem": "",
        },
    )
    c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "https://gw2:8443",
            "token": None,
            "caPem": None,
        },
    )
    from app.services import gateway as gw

    stored = gw.load_stored()
    assert stored.token == "KEEPME"
    assert stored.base == "https://gw2:8443"


def test_put_empty_string_clears_token(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "https://gw:8443",
            "token": "CLEARME",
            "caPem": "",
        },
    )
    # transport=direct so base is not required; "" clears the token.
    c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": False,
            "transport": "direct",
            "base": "https://gw:8443",
            "token": "",
            "caPem": None,
        },
    )
    from app.services import gateway as gw

    stored = gw.load_stored()
    assert stored.token == ""


def test_put_rejects_enabled_without_base(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "",
            "token": None,
            "caPem": None,
        },
    )
    assert r.status_code == 400 or r.json()["code"] != 0


def test_put_rejects_non_https_base(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "http://gw:8443",
            "token": None,
            "caPem": None,
        },
    )
    assert r.status_code == 400 or r.json()["code"] != 0


def test_put_rejects_unparseable_ca_pem(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.put(
        "/api/v1/settings/gateway",
        json={
            "enabled": True,
            "transport": "https-gateway",
            "base": "https://gw:8443",
            "token": None,
            "caPem": "not a real certificate",
        },
    )
    assert r.status_code == 400 or r.json()["code"] != 0


def test_test_endpoint_unreachable(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    r = c.post(
        "/api/v1/settings/gateway/test",
        json={"base": "https://10.255.255.1:9", "token": "x", "caPem": ""},
    )
    data = r.json()["data"]
    assert data["reachable"] is False


def test_test_endpoint_tls_fail(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)

    def fake_post(url, **kwargs):
        raise ssl.SSLError("certificate verify failed")

    monkeypatch.setattr("httpx.post", fake_post)
    r = c.post(
        "/api/v1/settings/gateway/test",
        json={"base": "https://gw:8443", "token": "x", "caPem": ""},
    )
    data = r.json()["data"]
    assert data["tls"] == "fail"
    assert data["reachable"] is False


def test_test_endpoint_token_ok(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)

    def fake_post(url, **kwargs):
        return httpx.Response(
            200,
            json={"access_token": "abc", "expires_in": 7200},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("httpx.post", fake_post)
    r = c.post(
        "/api/v1/settings/gateway/test",
        json={
            "base": "https://gw:8443",
            "token": "x",
            "caPem": "",
            "appid": "wx",
            "appsecret": "s",
        },
    )
    data = r.json()["data"]
    assert data["reachable"] is True
    assert data["tls"] == "ok"
    assert data["token"] == "ok"


def test_test_endpoint_token_skipped_without_credentials(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)

    def fake_post(url, **kwargs):
        return httpx.Response(
            200,
            json={"errcode": 41002, "errmsg": "appid missing"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("httpx.post", fake_post)
    r = c.post(
        "/api/v1/settings/gateway/test",
        json={"base": "https://gw:8443", "token": "x", "caPem": ""},
    )
    data = r.json()["data"]
    assert data["reachable"] is True
    assert data["tls"] == "ok"
    assert data["token"] == "skipped"


def test_test_endpoint_response_never_leaks_token(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)

    def fake_post(url, **kwargs):
        raise httpx.ConnectError("refused", request=httpx.Request("POST", url))

    monkeypatch.setattr("httpx.post", fake_post)
    r = c.post(
        "/api/v1/settings/gateway/test",
        json={"base": "https://gw:8443", "token": "TOPSECRET", "caPem": ""},
    )
    assert "TOPSECRET" not in r.text
