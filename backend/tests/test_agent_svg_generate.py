"""Tests for the 生成交互 SVG 积木 agent endpoint + self-check loop.

Covers:
    - Clean first-pass html returns status="ok" with attempts=1
    - Dirty first-pass html triggers a retry (attempts=2)
    - Retry that fixes issues returns status="ok"
    - Retry that still has issues returns status="failed" with no html leaked
    - API endpoint returns HTTP 200 and mirrors the service result shape
    - Real template fallback (no LLM mock) produces status="ok" and surfaces
      the ``llm-stub`` warning
    - Whitelist inlined in agent_svg_prompt stays in sync with the validator
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import agent_svg_prompt
from app.services.agent_svg_prompt import (
    SYSTEM_PROMPT,
    WHITELIST_ATTR_LIST,
    generate_svg_block,
    system_prompt_word_count,
)
from app.services.svg_validator import WHITELIST_ATTRIBUTES


# ---------------------------------------------------------------------------
# Unit: generate_svg_block()
# ---------------------------------------------------------------------------

CLEAN_HTML = (
    '<section style="margin:0;padding:0;">'
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<rect x="0" y="0" width="100" height="100" fill="#1B2235">'
    '<animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/>'
    '</rect></svg></section>'
)

# Has one forbidden-tag issue (`<script>`), rest is fine.
DIRTY_HTML = (
    '<section><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
    '<rect><animate attributeName="opacity" from="0" to="1" dur="1s"/></rect>'
    '</svg><script>bad()</script></section>'
)


def _install_llm(monkeypatch, responses: list[str]) -> list[dict[str, Any]]:
    """Monkeypatch call_llm to return scripted responses; capture call args."""
    calls: list[dict[str, Any]] = []
    idx = {"i": 0}

    def fake(system_prompt: str, user_prompt: str, feedback: str | None) -> str:
        calls.append({"system": system_prompt, "user": user_prompt, "feedback": feedback})
        out = responses[min(idx["i"], len(responses) - 1)]
        idx["i"] += 1
        return out

    monkeypatch.setattr(agent_svg_prompt, "call_llm", fake)
    return calls


def test_clean_first_pass_returns_ok_in_one_call(monkeypatch):
    calls = _install_llm(monkeypatch, [CLEAN_HTML])
    result = generate_svg_block("任意意图", llm_available=True)

    assert result["status"] == "ok"
    assert result["attempts"] == 1
    assert result["html"] == CLEAN_HTML
    assert result["report"]["issues"] == []
    assert len(calls) == 1
    # No stub warning when llm_available=True
    assert not any(w.get("kind") == "llm-stub" for w in result["warnings"])


def test_dirty_first_pass_triggers_retry_then_ok(monkeypatch):
    calls = _install_llm(monkeypatch, [DIRTY_HTML, CLEAN_HTML])
    result = generate_svg_block("测试意图", llm_available=True)

    assert result["status"] == "ok"
    assert result["attempts"] == 2
    assert result["html"] == CLEAN_HTML
    # Retry must have been given the issue list as feedback.
    assert calls[0]["feedback"] is None
    assert calls[1]["feedback"] is not None
    assert "forbidden-tag" in calls[1]["feedback"]


def test_still_dirty_after_retry_returns_failed_without_html(monkeypatch):
    _install_llm(monkeypatch, [DIRTY_HTML, DIRTY_HTML])
    result = generate_svg_block("测试意图", llm_available=True)

    assert result["status"] == "failed"
    assert result["attempts"] == 2  # loop runs AT MOST twice
    assert result["html"] == ""  # never leak unsafe html
    assert any(i["rule"] == "forbidden-tag" for i in result["report"]["issues"])


def test_loop_never_exceeds_two_llm_calls(monkeypatch):
    calls = _install_llm(monkeypatch, [DIRTY_HTML, DIRTY_HTML, DIRTY_HTML])
    generate_svg_block("压力测试", llm_available=True)
    assert len(calls) == 2


def test_llm_stub_warning_surfaces_when_llm_unavailable():
    # No monkeypatch — exercise the real template fallback.
    result = generate_svg_block("FAQ 手风琴 10 题年终共鸣投票", llm_available=False)
    stub_warnings = [w for w in result["warnings"] if w.get("kind") == "llm-stub"]
    assert len(stub_warnings) == 1
    assert "模板兜底" in stub_warnings[0]["message"]


def test_template_fallback_passes_validator():
    # Every bundled template is supposed to be WeChat-safe. If this fails,
    # the template drifted and needs fixing — not this agent.
    for keyword in ("手风琴", "热点", "抽奖", "时间轴", "封面"):
        result = generate_svg_block(keyword, llm_available=False)
        assert result["status"] == "ok", (
            f"template picked for '{keyword}' failed validation: "
            f"{result['report']['issues']}"
        )
        assert result["html"]


# ---------------------------------------------------------------------------
# Whitelist drift guard + prompt hygiene
# ---------------------------------------------------------------------------

def test_inlined_whitelist_matches_validator():
    assert set(WHITELIST_ATTR_LIST).issubset(WHITELIST_ATTRIBUTES)


def test_system_prompt_mentions_all_whitelist_attrs():
    for attr in WHITELIST_ATTR_LIST:
        assert attr in SYSTEM_PROMPT, f"whitelist attr '{attr}' missing from system prompt"


def test_system_prompt_word_count_under_800():
    # Aim for <800 "字数" per scope note. Fail loud if the prompt bloats.
    assert system_prompt_word_count() < 800


# ---------------------------------------------------------------------------
# API coverage
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return TestClient(app)


def test_endpoint_returns_200_with_ok_status_on_success(client, monkeypatch):
    _install_llm(monkeypatch, [CLEAN_HTML])
    resp = client.post("/api/v1/agent/generate-svg", json={"prompt": "伸长动画 FAQ"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    # Endpoint currently hard-wires llm_available=False, so expect stub warning
    # regardless of mock. We just assert the envelope shape + that issues == [].
    assert body["data"]["status"] == "ok"
    assert body["data"]["html"]
    assert body["data"]["report"]["issues"] == []


def test_endpoint_returns_200_even_on_failed_generation(client, monkeypatch):
    # Force the underlying helper to always return dirty html, bypassing
    # the template fallback path.
    def always_dirty(prompt: str, *, llm_available: bool = False):
        return {
            "status": "failed",
            "html": "",
            "warnings": [{"kind": "llm-stub", "message": "stub"}],
            "report": {"issues": [{"line": 1, "rule": "forbidden-tag",
                                   "message": "<script>", "suggestion": "去掉"}],
                       "warnings": [], "stats": {}},
            "attempts": 2,
        }

    # Patch the name the API module imported at startup, not the source.
    from app.api.v1 import agent_generate
    monkeypatch.setattr(agent_generate, "generate_svg_block", always_dirty)

    resp = client.post("/api/v1/agent/generate-svg", json={"prompt": "随便"})
    assert resp.status_code == 200  # failure lives in body, not status code
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["status"] == "failed"
    assert body["data"]["html"] == ""
    assert body["data"]["report"]["issues"]


def test_endpoint_accepts_empty_prompt(client):
    resp = client.post("/api/v1/agent/generate-svg", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["status"] in {"ok", "failed"}
