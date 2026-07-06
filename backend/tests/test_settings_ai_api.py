# backend/tests/test_settings_ai_api.py
"""BYOK + 音色 设置端点(/api/v1/settings/llm, /voice)。

约定:AppError -> HTTP 200 + {code,message};success -> {code:0,data}。
密钥只写不回显;音色学习注入 fake provider,绝不触真 LLM。
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.llm import provider_store
from app.services.llm.base import ModelSpec

client = TestClient(app)


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    # 存储读 APP_DATA_DIR 是 call-time,无需 reload。
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    # 隔离:test_llm_provider_store 用 reload(config) 会让 provider_store.settings
    # 重新绑到一个带残留 LLM_* env 的 Settings 实例(reload 不换模块对象,污染会
    # 持续到本文件)。直接把端点实际读取的 settings 对象的 LLM_* 钉空,确保
    # "未配置" 用例稳定。
    monkeypatch.setattr(provider_store.settings, "LLM_PROVIDER", "openai_compat")
    monkeypatch.setattr(provider_store.settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(provider_store.settings, "LLM_MODEL", "")
    monkeypatch.setattr(provider_store.settings, "LLM_API_KEY", "")
    yield


# --- /settings/llm ----------------------------------------------------------
def test_get_llm_unconfigured_hides_key():
    data = client.get("/api/v1/settings/llm").json()["data"]
    assert data["keyConfigured"] is False
    assert "api_key" not in data


def test_put_llm_then_get_reflects_without_key():
    r = client.put("/api/v1/settings/llm", json={
        "provider": "openai_compat",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "api_key": "sk-secretkey-1234567890",
    })
    assert r.status_code == 200
    body = r.json()["data"]
    assert body["keyConfigured"] is True
    assert "sk-secretkey" not in json.dumps(body)
    g = client.get("/api/v1/settings/llm").json()["data"]
    assert g["model"] == "deepseek-chat"
    assert g["source"] == "stored"
    assert "sk-secretkey" not in json.dumps(g)


def test_put_llm_none_key_keeps_stored():
    client.put("/api/v1/settings/llm", json={"model": "m1", "api_key": "sk-keepme-0987654321"})
    client.put("/api/v1/settings/llm", json={"model": "m2"})  # api_key 缺省 -> None -> 保留
    cfg = provider_store.load()
    assert cfg is not None
    assert cfg.model == "m2"
    assert cfg.api_key == "sk-keepme-0987654321"


def test_put_llm_empty_key_clears():
    client.put("/api/v1/settings/llm", json={"model": "m", "api_key": "sk-tobecleared-111"})
    client.put("/api/v1/settings/llm", json={"model": "m", "api_key": ""})  # "" -> 清除
    assert provider_store.load().api_key == ""


def test_test_llm_unavailable_when_incomplete():
    r = client.post("/api/v1/settings/llm/test", json={
        "provider": "openai_compat", "base_url": "", "model": "", "api_key": "",
    })
    assert r.json()["data"]["ok"] is False


# --- /settings/llm/test 真测通(H4)------------------------------------------
# monkeypatch build_provider 注入 fake provider:配置完整时必须真发一次最小
# call_text,按异常类型给 {ok,detail,code};绝不触真 LLM。
class _ProbeProv:
    spec = ModelSpec(provider="openai_compat", model="m", base_url="https://x/v1", api_key="sk-abc")

    def __init__(self, exc: Exception | None = None):
        self._exc = exc
        self.calls: list[dict] = []

    def is_available(self):
        return True

    def call_text(self, system, user, *, max_tokens=None):
        self.calls.append({"system": system, "user": user, "max_tokens": max_tokens})
        if self._exc is not None:
            raise self._exc
        return "ok"


def _inject_provider(monkeypatch, prov):
    import app.api.v1.settings_ai as mod
    monkeypatch.setattr(mod, "build_provider", lambda spec: prov)


_COMPLETE = {
    "provider": "openai_compat", "base_url": "https://x/v1", "model": "m", "api_key": "sk-abc",
}


def test_test_llm_ok_when_complete(monkeypatch):
    prov = _ProbeProv()
    _inject_provider(monkeypatch, prov)
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is True
    assert data["detail"] == "连接成功,密钥可用。"
    # 真发了一次最小请求(不再只看三字段非空)
    assert len(prov.calls) == 1


def test_test_llm_quota_maps_to_recharge(monkeypatch):
    from app.services.llm.errors import LLMQuotaExceeded
    _inject_provider(monkeypatch, _ProbeProv(LLMQuotaExceeded("余额不足")))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is False
    assert data["code"] == "quota"
    assert "余额不足" in data["detail"]
    assert "充值" in data["detail"]


def test_test_llm_auth_maps_to_key_check(monkeypatch):
    from app.services.llm.errors import LLMUnavailable
    _inject_provider(monkeypatch, _ProbeProv(LLMUnavailable("鉴权失败")))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is False
    assert data["code"] == "auth"
    assert "API Key" in data["detail"] or "密钥" in data["detail"]


@pytest.mark.parametrize("exc_name", ["LLMTimeout", "LLMConnectionError"])
def test_test_llm_network_errors_map_to_network(monkeypatch, exc_name):
    from app.services.llm import errors as llm_errors
    exc = getattr(llm_errors, exc_name)("x")
    _inject_provider(monkeypatch, _ProbeProv(exc))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is False
    assert data["code"] == "network"


def test_test_llm_truncated_counts_as_ok(monkeypatch):
    """anthropic 探针小 max_tokens 常被截断——截断即证明密钥可用连通,须算测通。"""
    from app.services.llm.errors import LLMTruncated
    _inject_provider(monkeypatch, _ProbeProv(LLMTruncated("AI 输出被截断")))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is True
    assert data["detail"] == "连接成功,密钥可用。"


def test_test_llm_rate_limited_maps_to_retry_hint(monkeypatch):
    from app.services.llm.errors import LLMRateLimited
    _inject_provider(monkeypatch, _ProbeProv(LLMRateLimited("429")))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is False
    assert data["code"] == "network"
    assert "稍" in data["detail"]


def test_test_llm_other_llm_error_maps_to_other(monkeypatch):
    from app.services.llm.errors import LLMSchemaMismatch
    _inject_provider(monkeypatch, _ProbeProv(LLMSchemaMismatch("x")))
    data = client.post("/api/v1/settings/llm/test", json=_COMPLETE).json()["data"]
    assert data["ok"] is False
    assert data["code"] == "other"


# --- /settings/voice --------------------------------------------------------
def test_get_voice_empty():
    assert client.get("/api/v1/settings/voice").json()["data"]["configured"] is False


def test_put_voice_blank_returns_code_400():
    r = client.put("/api/v1/settings/voice", json={"sample": "   "})
    assert r.status_code == 200          # AppError -> 200 + code
    assert r.json()["code"] == 400


def test_put_voice_learns_persists_and_clears(monkeypatch):
    class _FakeProv:
        spec = ModelSpec(provider="openai_compat", model="m", base_url="https://x/v1", api_key="sk-x")

        def is_available(self):
            return True

        def call_structured(self, system, user, schema):
            return {"tone": "温柔治愈", "signatures": ["愿你被温柔以待"],
                    "cadence": "短句多", "banned_words": ["最"]}

    import app.api.v1.settings_ai as mod
    monkeypatch.setattr(mod, "build_provider", lambda spec: _FakeProv())

    r = client.put("/api/v1/settings/voice", json={"sample": "这是一段很长的旧文。" * 30})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["configured"] is True
    assert data["traits"]["tone"] == "温柔治愈"

    g = client.get("/api/v1/settings/voice").json()["data"]
    assert g["configured"] is True
    assert g["traits"]["signatures"] == ["愿你被温柔以待"]

    client.delete("/api/v1/settings/voice")
    assert client.get("/api/v1/settings/voice").json()["data"]["configured"] is False
