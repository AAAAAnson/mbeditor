# backend/tests/test_config_llm_fields.py
"""新增 BYOK / 合规开关 env 字段的默认值与类型。"""
from app.core.config import Settings


def test_llm_env_defaults():
    s = Settings()
    assert s.LLM_PROVIDER == "openai_compat"
    assert s.LLM_BASE_URL == ""
    assert s.LLM_MODEL == ""
    assert s.LLM_API_KEY == ""
    assert s.CONTENT_SAFETY_ENABLED is False
    assert s.AIGC_LABEL_ENABLED is False


def test_llm_env_override(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("CONTENT_SAFETY_ENABLED", "true")
    s = Settings()
    assert s.LLM_PROVIDER == "anthropic"
    assert s.LLM_API_KEY == "sk-test"
    assert s.CONTENT_SAFETY_ENABLED is True
