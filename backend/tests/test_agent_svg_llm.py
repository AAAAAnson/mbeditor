"""Tests for the real-LLM SVG author path (P1-4).

Covers:
    - Deterministic DSL -> SVG rendering (effects single/multi, text card,
      unknown effect, determinism).
    - LLM path integration (clean DSL, validator-reject retry, retry cap).
    - Every LLM error class mapped to a structured failed response.
    - Graceful fallback / dynamic endpoint gating on ANTHROPIC_API_KEY.
    - The API key never leaks into the response.

All LLM calls go through a mock client — nothing here touches the network.
"""
from __future__ import annotations

import json
from typing import Any

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import agent_svg_prompt, anthropic_client
from app.services.agent_svg_prompt import generate_svg_block
from app.services.svg_dsl import DSL_SCHEMA, render_dsl
from app.services.svg_validator import validate_html


# ---------------------------------------------------------------------------
# Mock client plumbing
# ---------------------------------------------------------------------------
class FakeBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class FakeMessage:
    def __init__(
        self,
        *,
        text: str | None = None,
        stop_reason: str = "end_turn",
        stop_details: Any = None,
    ) -> None:
        self.content = [FakeBlock(text)] if text is not None else []
        self.stop_reason = stop_reason
        self.stop_details = stop_details
        self._request_id = "req_test_0001"


class FakeStopDetails:
    def __init__(self, category: str | None = None, explanation: str = "") -> None:
        self.category = category
        self.explanation = explanation


class FakeMessages:
    def __init__(self, owner: "FakeClient") -> None:
        self._owner = owner

    def create(self, **kwargs):
        self._owner.calls.append(kwargs)
        item = self._owner.responses[
            min(self._owner.idx, len(self._owner.responses) - 1)
        ]
        self._owner.idx += 1
        if isinstance(item, Exception):
            raise item
        return item


class FakeClient:
    """Stands in for anthropic.Anthropic; supports with_options chaining."""

    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.idx = 0
        self.calls: list[dict] = []
        self.messages = FakeMessages(self)

    def with_options(self, **_kwargs):
        return self


def _dsl_message(dsl: dict) -> FakeMessage:
    return FakeMessage(text=json.dumps(dsl))


def _fake_response(status_code: int):
    return httpx.Response(
        status_code,
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )


# A known-good effects DSL (single tab-panel, all defaults).
CLEAN_EFFECTS_DSL = {"kind": "effects", "blocks": [{"effect_id": "tab-panel"}]}
CLEAN_MULTI_DSL = {
    "kind": "effects",
    "blocks": [{"effect_id": "tab-panel"}, {"effect_id": "flip-card"}],
}
TEXT_DSL = {"kind": "text", "notes": "这个意图暂时没有合适的积木，先给你一段说明。"}


# ---------------------------------------------------------------------------
# DSL -> SVG determinism
# ---------------------------------------------------------------------------
def test_effects_dsl_single_block_renders_ok():
    out = render_dsl(CLEAN_EFFECTS_DSL)
    assert out["status"] == "ok"
    assert out["html"]
    assert validate_html(out["html"])["issues"] == []
    assert out["report"]["issues"] == []


def test_effects_dsl_multi_block_concatenates():
    out = render_dsl(CLEAN_MULTI_DSL)
    assert out["status"] == "ok"
    # Both effects appear, joined.
    assert out["html"].count("<svg") == 2
    assert validate_html(out["html"])["issues"] == []


def test_text_dsl_renders_fallback_card():
    out = render_dsl(TEXT_DSL)
    assert out["status"] == "ok"
    assert "AI 说明" in out["html"]
    assert validate_html(out["html"])["issues"] == []


def test_text_card_escapes_quotes_and_angles():
    # Defence-in-depth: the text card must escape the full XML special set,
    # including both quote characters, so the value stays safe if it is ever
    # moved into an attribute context.
    out = render_dsl({"kind": "text", "notes": 'a"b\'c<d>e'})
    assert out["status"] == "ok"
    assert "&quot;" in out["html"]
    assert "&#39;" in out["html"]
    assert "&lt;" in out["html"] and "&gt;" in out["html"]
    # No raw quote/angle from the notes leaked into the rendered fragment.
    assert 'a"b' not in out["html"]
    assert "b'c" not in out["html"]


def test_render_dsl_unknown_effect_id_fails_clean():
    # Bypass the schema enum to simulate dirty data reaching the renderer.
    out = render_dsl({"kind": "effects", "blocks": [{"effect_id": "does-not-exist"}]})
    assert out["status"] == "failed"
    assert out["html"] == ""
    assert out["report"]["issues"]  # carries a feedback-able issue


def test_render_dsl_empty_blocks_fails_clean():
    out = render_dsl({"kind": "effects", "blocks": []})
    assert out["status"] == "failed"
    assert out["html"] == ""
    assert out["report"]["issues"]


def test_render_dsl_is_deterministic():
    a = render_dsl(CLEAN_MULTI_DSL)
    b = render_dsl(CLEAN_MULTI_DSL)
    assert a["html"] == b["html"]


def test_empty_report_returns_fresh_isolated_instances():
    # Regression: a shared module-level constant copied via dict() would only
    # shallow-copy, leaving inner issues/warnings/stats shared across requests.
    # _empty_report() must hand back brand-new, independent containers.
    a = agent_svg_prompt._empty_report()
    b = agent_svg_prompt._empty_report()
    a["issues"].append({"x": 1})
    a["warnings"].append({"y": 2})
    a["stats"]["k"] = "v"
    assert b == {"issues": [], "warnings": [], "stats": {}}
    assert a["issues"] is not b["issues"]
    assert a["warnings"] is not b["warnings"]
    assert a["stats"] is not b["stats"]


def test_dsl_schema_enum_lists_real_effects():
    block_schema = DSL_SCHEMA["properties"]["blocks"]["items"]
    enum = block_schema["properties"]["effect_id"]["enum"]
    assert "tab-panel" in enum
    assert "flip-card" in enum


# ---------------------------------------------------------------------------
# LLM path integration
# ---------------------------------------------------------------------------
def test_llm_path_clean_dsl_returns_ok_one_call(monkeypatch):
    fake = FakeClient([_dsl_message(CLEAN_EFFECTS_DSL)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("Tab 切换三个面板", llm_available=True)

    assert result["status"] == "ok"
    assert result["attempts"] == 1
    assert result["html"]
    assert len(fake.calls) == 1
    assert not any(w.get("kind") == "llm-stub" for w in result["warnings"])


def test_llm_path_validator_reject_triggers_retry(monkeypatch):
    # First DSL renders to issues (unknown effect), second is clean.
    bad = {"kind": "effects", "blocks": [{"effect_id": "nope"}]}
    fake = FakeClient([_dsl_message(bad), _dsl_message(CLEAN_EFFECTS_DSL)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("Tab 切换", llm_available=True)

    assert result["status"] == "ok"
    assert result["attempts"] == 2
    # Second call must have carried feedback appended to the user content.
    second_user = fake.calls[1]["messages"][0]["content"]
    assert "上一版" in second_user


def test_llm_path_retry_still_dirty_fails(monkeypatch):
    bad = {"kind": "effects", "blocks": [{"effect_id": "nope"}]}
    fake = FakeClient([_dsl_message(bad), _dsl_message(bad)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)

    assert result["status"] == "failed"
    assert result["html"] == ""
    assert result["attempts"] == 2


def test_llm_call_count_capped_at_two(monkeypatch):
    bad = {"kind": "effects", "blocks": [{"effect_id": "nope"}]}
    fake = FakeClient([_dsl_message(bad), _dsl_message(bad), _dsl_message(bad)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    generate_svg_block("压力测试", llm_available=True)
    assert len(fake.calls) == 2


# ---------------------------------------------------------------------------
# Error paths — each maps to a structured failed response, no retry, no raise
# ---------------------------------------------------------------------------
def _run_with_error(monkeypatch, exc) -> dict:
    fake = FakeClient([exc, _dsl_message(CLEAN_EFFECTS_DSL)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)
    return result, fake


def test_timeout_returns_structured_failed(monkeypatch):
    exc = anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["html"] == ""
    assert result["warnings"][0]["kind"] == "llm-timeout"
    assert len(fake.calls) == 1  # no retry


def test_rate_limit_returns_structured_failed(monkeypatch):
    exc = anthropic.RateLimitError(
        "rate limited", response=_fake_response(429), body=None
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-rate-limit"
    assert len(fake.calls) == 1


def test_refusal_stop_reason_returns_structured_failed(monkeypatch):
    msg = FakeMessage(
        text=None,
        stop_reason="refusal",
        stop_details=FakeStopDetails(category="cyber"),
    )
    fake = FakeClient([msg])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-refusal"
    assert "cyber" in result["warnings"][0]["message"]


def test_truncated_max_tokens_returns_structured_failed(monkeypatch):
    msg = FakeMessage(text="{}", stop_reason="max_tokens")
    fake = FakeClient([msg])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-schema"


def test_schema_mismatch_bad_json_returns_failed(monkeypatch):
    msg = FakeMessage(text="not json at all", stop_reason="end_turn")
    fake = FakeClient([msg])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-schema"


def test_server_error_5xx_returns_failed(monkeypatch):
    exc = anthropic.APIStatusError(
        "server error", response=_fake_response(503), body=None
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-error"


def test_connection_error_returns_failed(monkeypatch):
    exc = anthropic.APIConnectionError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-error"


def test_bad_request_maps_to_schema(monkeypatch):
    exc = anthropic.BadRequestError(
        "bad request", response=_fake_response(400), body=None
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-schema"


def test_auth_error_401_maps_to_llm_error_not_schema(monkeypatch):
    # AuthenticationError is a subclass of APIStatusError carrying 401. It must
    # NOT be swallowed as a schema mismatch (llm-schema) — an invalid/expired
    # key should surface as a distinct llm-error (LLMUnavailable), giving
    # operators a real signal that the key is the problem.
    exc = anthropic.AuthenticationError(
        "invalid api key", response=_fake_response(401), body=None
    )
    result, fake = _run_with_error(monkeypatch, exc)
    assert result["status"] == "failed"
    assert result["warnings"][0]["kind"] == "llm-error"
    # The env-var name must never leak into the user-facing message.
    assert "ANTHROPIC_API_KEY" not in result["warnings"][0]["message"]


def test_no_500_ever(monkeypatch):
    # Every error path returns HTTP 200 with status in the body.
    exc = anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )
    fake = FakeClient([exc])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    monkeypatch.setattr(anthropic_client, "llm_is_available", lambda: True)
    client = TestClient(app)
    resp = client.post("/api/v1/agent/generate-svg", json={"prompt": "意图"})
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "failed"


# ---------------------------------------------------------------------------
# Fallback / dynamic gating
# ---------------------------------------------------------------------------
def test_llm_unavailable_falls_back_to_stub(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    assert anthropic_client.llm_is_available() is False
    result = generate_svg_block("FAQ 手风琴", llm_available=False)
    assert any(w.get("kind") == "llm-stub" for w in result["warnings"])


def test_endpoint_dynamic_detection_uses_stub_without_key(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    client = TestClient(app)
    resp = client.post("/api/v1/agent/generate-svg", json={"prompt": "FAQ 手风琴"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "ok"
    assert any(w.get("kind") == "llm-stub" for w in body["data"]["warnings"])


def test_endpoint_uses_llm_when_key_present(monkeypatch):
    fake = FakeClient([_dsl_message(CLEAN_EFFECTS_DSL)])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    monkeypatch.setattr(anthropic_client, "llm_is_available", lambda: True)
    client = TestClient(app)
    resp = client.post("/api/v1/agent/generate-svg", json={"prompt": "Tab 切换"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "ok"
    assert not any(w.get("kind") == "llm-stub" for w in body["data"]["warnings"])


# ---------------------------------------------------------------------------
# Security: key never leaks into the response
# ---------------------------------------------------------------------------
def test_api_key_never_in_response(monkeypatch):
    secret = "sk-ant-test-SHOULD-NOT-LEAK-123456"
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", secret)
    exc = anthropic.RateLimitError(
        "rate limited", response=_fake_response(429), body=None
    )
    fake = FakeClient([exc])
    monkeypatch.setattr(anthropic_client, "get_client", lambda: fake)
    result = generate_svg_block("意图", llm_available=True)
    blob = json.dumps(result, ensure_ascii=False, default=str)
    assert secret not in blob
