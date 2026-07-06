# backend/tests/test_llm_provider_store.py
"""BYOK provider 配置存储(data/llm_provider.json)。镜像 credentials/gateway 持久化。"""
import json

import pytest

from app.core.exceptions import AppError
from app.services.llm import provider_store as ps
from app.services.llm.provider_store import LLMProviderConfig


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def test_save_load_roundtrip():
    cfg = LLMProviderConfig(
        provider="openai_compat",
        base_url="https://api.deepseek.com/v1",
        model="deepseek-chat",
        api_key="sk-xyz",
    )
    ps.save(cfg)
    got = ps.load()
    assert got is not None
    assert got.provider == "openai_compat"
    assert got.base_url == "https://api.deepseek.com/v1"
    assert got.model == "deepseek-chat"
    assert got.api_key == "sk-xyz"


def test_load_missing_returns_none():
    assert ps.load() is None


def test_persisted_file_shape(tmp_path):
    ps.save(LLMProviderConfig(provider="anthropic", model="claude-opus-4-8", api_key="k"))
    raw = json.loads((tmp_path / "llm_provider.json").read_text(encoding="utf-8"))
    assert raw["version"] == 1
    assert raw["provider"] == "anthropic"
    assert raw["model"] == "claude-opus-4-8"
    assert raw["api_key"] == "k"


def test_corrupt_file_degrades_to_none(tmp_path):
    (tmp_path / "llm_provider.json").write_text("{not json", encoding="utf-8")
    assert ps.load() is None


def test_clear_is_idempotent():
    ps.clear()  # nothing written yet -> no raise
    ps.save(LLMProviderConfig(api_key="k"))
    ps.clear()
    assert ps.load() is None


def test_readonly_volume_raises_apperror(tmp_path, monkeypatch):
    missing = tmp_path / "nope" / "deeper"
    monkeypatch.setenv("APP_DATA_DIR", str(missing))
    (tmp_path / "nope").write_text("x", encoding="utf-8")  # parent un-creatable
    with pytest.raises(AppError):
        ps.save(LLMProviderConfig(api_key="k"))


def test_redacted_from_env_when_unstored(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_BASE_URL", "https://x/v1")
    monkeypatch.setenv("LLM_MODEL", "m")
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    # Settings is read at call time via the module-level singleton; reload it.
    from importlib import reload
    import app.core.config as cfgmod
    reload(cfgmod)
    import app.services.llm.provider_store as ps_mod
    reload(ps_mod)
    red = ps_mod.redacted()
    assert red["provider"] == "openai_compat"
    assert red["base_url"] == "https://x/v1"
    assert red["model"] == "m"
    assert red["keyConfigured"] is True
    assert red["source"] == "env"
    assert "sk-env" not in json.dumps(red)


def test_redacted_from_stored_hides_key():
    ps.save(LLMProviderConfig(provider="anthropic", model="claude-opus-4-8", api_key="sk-secret"))
    red = ps.redacted()
    assert red["provider"] == "anthropic"
    assert red["model"] == "claude-opus-4-8"
    assert red["keyConfigured"] is True
    assert red["source"] == "stored"
    assert "api_key" not in red
    assert "sk-secret" not in json.dumps(red)


def test_redacted_keyconfigured_false_when_blank_key():
    ps.save(LLMProviderConfig(provider="openai_compat", model="m", api_key=""))
    assert ps.redacted()["keyConfigured"] is False


def _fresh_modules():
    """Reload config + provider_store so monkeypatched LLM_* env take effect."""
    from importlib import reload
    import app.core.config as cfgmod
    reload(cfgmod)
    import app.services.llm.provider_store as ps_mod
    reload(ps_mod)
    return ps_mod


def test_resolve_spec_env_only(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_BASE_URL", "https://env/v1")
    monkeypatch.setenv("LLM_MODEL", "env-model")
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    ps_mod = _fresh_modules()
    spec = ps_mod.resolve_spec(None)
    assert spec.provider == "openai_compat"
    assert spec.base_url == "https://env/v1"
    assert spec.model == "env-model"
    assert spec.api_key == "sk-env"


def test_resolve_spec_stored_beats_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "env-model")
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    ps_mod = _fresh_modules()
    ps_mod.save(LLMProviderConfig(model="stored-model", api_key="sk-stored"))
    spec = ps_mod.resolve_spec(None)
    assert spec.model == "stored-model"
    assert spec.api_key == "sk-stored"


def test_resolve_spec_request_beats_all(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "env-model")
    ps_mod = _fresh_modules()
    ps_mod.save(LLMProviderConfig(model="stored-model", api_key="sk-stored"))
    req = LLMProviderConfig(model="req-model", api_key="sk-req")
    spec = ps_mod.resolve_spec(req)
    assert spec.model == "req-model"
    assert spec.api_key == "sk-req"


def test_resolve_spec_per_field_coalesce(monkeypatch):
    # req supplies only model; base_url falls to stored; api_key falls to env.
    monkeypatch.setenv("LLM_BASE_URL", "")  # env base empty
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    ps_mod = _fresh_modules()
    ps_mod.save(LLMProviderConfig(base_url="https://stored/v1", model="stored-model", api_key=""))
    req = LLMProviderConfig(provider="", base_url="", model="req-model", api_key="")
    spec = ps_mod.resolve_spec(req)
    assert spec.model == "req-model"            # from req
    assert spec.base_url == "https://stored/v1" # req empty -> stored
    assert spec.api_key == "sk-env"             # req+stored empty -> env
