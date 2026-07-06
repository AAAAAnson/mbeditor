"""Tests for the pluggable gateway transport module (``app.services.gateway``).

Covers the shared contract from the Phase 1 plan:
- save -> load round trip (atomic write to APP_DATA_DIR/gateway.json)
- corrupt file degrades to None
- resolve() precedence: stored > env > direct
- effective_redacted() never leaks token / PEM body
- cert_fingerprint() format
- HttpsGatewayTransport carries the Bearer header

The SELF_SIGNED_PEM below is a throwaway self-signed certificate generated only
for these tests (CN=mbeditor-test-gateway). It is NOT a real gateway certificate
and carries no secret -- safe to keep in a tracked file.
"""
import json
import pathlib
import ssl

import pytest

from app.core.exceptions import AppError
from app.services import gateway as gw

# Throwaway self-signed cert (CN=mbeditor-test-gateway), valid 2020..2050.
# Used to exercise cert_fingerprint() and the SSLContext build path.
SELF_SIGNED_PEM = """-----BEGIN CERTIFICATE-----
MIIBaDCCAQ6gAwIBAgIUXlcDO0NnV9PQQ1j3FCN5BBDa89swCgYIKoZIzj0EAwIw
IDEeMBwGA1UEAwwVbWJlZGl0b3ItdGVzdC1nYXRld2F5MCAXDTIwMDEwMTAwMDAw
MFoYDzIwNTAwMTAxMDAwMDAwWjAgMR4wHAYDVQQDDBVtYmVkaXRvci10ZXN0LWdh
dGV3YXkwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASuGqhCxQW4yCIqo8v+wjvM
hHlQ2aoyML3M1hoSjPactui9FJsZwc/mTR/2i0LNNuG11JIdgs7trl4rmzXJy5da
oyQwIjAgBgNVHREEGTAXghVtYmVkaXRvci10ZXN0LWdhdGV3YXkwCgYIKoZIzj0E
AwIDSAAwRQIgWjE4d2JTsoD2+FjzYpoH/d7Mk/2qOL+0rMTHiQHBV9sCIQDf2Wy5
sScRKIf/nr3cV5nb5kvTXvi1dB6wNSxGbkwMgw==
-----END CERTIFICATE-----
"""

EXPECTED_FINGERPRINT = (
    "SHA256:9C:EC:2E:A8:42:AD:19:B5:13:AB:2A:BA:FC:DA:FE:BB:"
    "77:2C:70:F5:8D:61:A7:82:70:2C:C9:05:EF:C0:13:E0"
)


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("WECHAT_API_BASE", raising=False)
    monkeypatch.delenv("WECHAT_PROXY_TOKEN", raising=False)
    monkeypatch.delenv("WECHAT_PROXY_CA", raising=False)
    gw._reset_caches()  # clear in-process caches
    yield


def test_save_load_roundtrip():
    cfg = gw.GatewayConfig(
        enabled=True, transport="https-gateway",
        base="https://1.2.3.4:8443", token="tok", ca_pem="",
    )
    gw.save_stored(cfg)
    got = gw.load_stored()
    assert got.base == "https://1.2.3.4:8443"
    assert got.token == "tok"
    assert got.enabled is True
    assert got.transport == "https-gateway"


def test_save_load_roundtrip_with_ca():
    cfg = gw.GatewayConfig(
        enabled=True, transport="https-gateway",
        base="https://1.2.3.4:8443", token="tok", ca_pem=SELF_SIGNED_PEM,
    )
    gw.save_stored(cfg)
    got = gw.load_stored()
    assert got.ca_pem == SELF_SIGNED_PEM


def test_load_corrupt_returns_none(tmp_path):
    (tmp_path / "gateway.json").write_text("{not json", encoding="utf-8")
    assert gw.load_stored() is None


def test_load_missing_returns_none():
    assert gw.load_stored() is None


def test_clear_stored_removes_file():
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://x:8443", "t", ""))
    assert gw.load_stored() is not None
    gw.clear_stored()
    assert gw.load_stored() is None


def test_resolve_prefers_stored_over_env(monkeypatch):
    monkeypatch.setenv("WECHAT_API_BASE", "https://env:8443")
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://stored:8443", "t", ""))
    t = gw.resolve()
    assert t.base_url == "https://stored:8443"


def test_resolve_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("WECHAT_API_BASE", "https://env:8443")
    t = gw.resolve()
    assert t.base_url == "https://env:8443"


def test_resolve_direct_default():
    assert gw.resolve().base_url == "https://api.weixin.qq.com"
    assert gw.resolve().httpx_kwargs() == {}


def test_disabled_stored_falls_through_to_direct():
    gw.save_stored(gw.GatewayConfig(False, "https-gateway", "https://stored:8443", "t", ""))
    assert gw.resolve().base_url == "https://api.weixin.qq.com"


def test_stored_direct_transport_falls_through_to_direct():
    gw.save_stored(gw.GatewayConfig(True, "direct", "", "", ""))
    assert gw.resolve().base_url == "https://api.weixin.qq.com"


def test_effective_redacted_never_leaks_secret():
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://x:8443", "SUPERSECRET", ""))
    r = gw.effective_redacted()
    blob = json.dumps(r)
    assert "SUPERSECRET" not in blob
    assert r["tokenConfigured"] is True
    assert r["source"] == "stored"
    assert r["transport"] == "https-gateway"
    assert r["base"] == "https://x:8443"
    assert r["caConfigured"] is False
    assert r["caFingerprint"] is None


def test_effective_redacted_pem_only_fingerprint():
    gw.save_stored(
        gw.GatewayConfig(True, "https-gateway", "https://x:8443", "tok", SELF_SIGNED_PEM)
    )
    r = gw.effective_redacted()
    blob = json.dumps(r)
    assert "BEGIN CERTIFICATE" not in blob
    assert r["caConfigured"] is True
    assert r["caFingerprint"] == EXPECTED_FINGERPRINT


def test_effective_redacted_env_source(monkeypatch):
    monkeypatch.setenv("WECHAT_API_BASE", "https://env:8443")
    monkeypatch.setenv("WECHAT_PROXY_TOKEN", "envtok")
    r = gw.effective_redacted()
    assert r["source"] == "env"
    assert r["transport"] == "https-gateway"
    assert r["base"] == "https://env:8443"
    assert r["tokenConfigured"] is True


def test_effective_redacted_direct_source():
    r = gw.effective_redacted()
    assert r["source"] == "direct"
    assert r["transport"] == "direct"
    assert r["enabled"] is False
    assert r["tokenConfigured"] is False
    assert r["caConfigured"] is False
    assert r["caFingerprint"] is None


def test_cert_fingerprint_format():
    fp = gw.cert_fingerprint(SELF_SIGNED_PEM)
    assert fp == EXPECTED_FINGERPRINT
    assert fp.startswith("SHA256:")


def test_gateway_transport_kwargs_have_bearer():
    t = gw.HttpsGatewayTransport("https://x:8443", "tok", None)
    assert t.httpx_kwargs()["headers"]["Authorization"] == "Bearer tok"


def test_gateway_transport_verify_path_string():
    # env-mode back-compat: verify is the literal CA path string.
    t = gw.HttpsGatewayTransport("https://x:8443", "tok", "/some/ca.pem")
    assert t.httpx_kwargs()["verify"] == "/some/ca.pem"


def test_gateway_transport_verify_ssl_context():
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(cadata=SELF_SIGNED_PEM)
    t = gw.HttpsGatewayTransport("https://x:8443", "tok", ctx)
    assert t.httpx_kwargs()["verify"] is ctx


def test_resolve_stored_with_ca_builds_ssl_context():
    gw.save_stored(
        gw.GatewayConfig(True, "https-gateway", "https://x:8443", "tok", SELF_SIGNED_PEM)
    )
    t = gw.resolve()
    kwargs = t.httpx_kwargs()
    assert isinstance(kwargs["verify"], ssl.SSLContext)
    assert kwargs["headers"]["Authorization"] == "Bearer tok"


def test_ssl_context_cached_returns_same_object():
    a = gw._ssl_context_cached(SELF_SIGNED_PEM)
    b = gw._ssl_context_cached(SELF_SIGNED_PEM)
    assert a is b


def test_config_path_reads_env_each_call(tmp_path, monkeypatch):
    # Saving under one APP_DATA_DIR must not leak into another.
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://x:8443", "t", ""))
    other = tmp_path / "other"
    other.mkdir()
    monkeypatch.setenv("APP_DATA_DIR", str(other))
    assert gw.load_stored() is None


def test_save_stored_write_failure_raises_readable_apperror(monkeypatch):
    # Read-only / unmounted data volume -> readable AppError, not a bare OSError.
    def boom(self, *a, **k):
        raise PermissionError("read-only file system")

    monkeypatch.setattr(pathlib.Path, "write_text", boom)
    with pytest.raises(AppError) as ei:
        gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://x:8443", "t", ""))
    assert ei.value.code == 500
    assert "数据卷" in ei.value.message and "可写" in ei.value.message


def test_save_atomic_old_content_intact_on_replace_failure(monkeypatch):
    # os.replace failing mid-save must leave the prior config intact (no partial).
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://old:8443", "OLDTOK", ""))

    def boom(src, dst):
        raise OSError("replace failed")

    monkeypatch.setattr(gw.os, "replace", boom)
    with pytest.raises(AppError):
        gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://new:8443", "NEWTOK", ""))

    got = gw.load_stored()
    assert got is not None
    assert got.base == "https://old:8443" and got.token == "OLDTOK"
