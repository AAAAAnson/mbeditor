"""POST /api/v1/agent/chat SSE 端点(批4):冒烟 / 参数校验 / provider 未配置。

编排逻辑在 test_chat_orchestrator.py 覆盖;这里 monkeypatch run_chat_turn
只验证线程桥 + 帧序列化 + 请求级校验(与 /agent/write 测试同款套路)。
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import agent_chat
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def _parse_sse(text: str) -> list[dict]:
    out = []
    for block in text.split("\n\n"):
        block = block.strip()
        if block.startswith("data: "):
            out.append(json.loads(block[len("data: "):]))
    return out


_BODY = {
    "article_id": "art-1",
    "html": "<section><p>正文</p></section>",
    "messages": [{"role": "user", "content": "改活泼点"}],
}


def test_chat_streams_orchestrator_events(client, monkeypatch):
    def fake_run(provider, article_id, html, messages):
        assert article_id == "art-1"
        assert messages == [{"role": "user", "content": "改活泼点"}]
        yield {"type": "checkpoint", "rev_id": "rev_1"}
        yield {"type": "chat_token", "text": "好"}
        yield {"type": "turn_done", "changed_block_ids": [], "summary": "好"}

    monkeypatch.setattr(agent_chat, "run_chat_turn", fake_run)
    resp = client.post("/api/v1/agent/chat", json=_BODY)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    assert [e["type"] for e in events] == ["checkpoint", "chat_token", "turn_done"]
    assert events[0]["rev_id"] == "rev_1"


@pytest.mark.parametrize("bad_id", ["", "  ", "../etc", "a/b", "带中文"])
def test_chat_invalid_article_id_yields_validate_failed(client, bad_id):
    resp = client.post("/api/v1/agent/chat", json={**_BODY, "article_id": bad_id})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events == [events[0]]
    assert events[0]["type"] == "error"
    assert events[0]["code"] == "validate_failed"


def test_chat_empty_messages_yields_validate_failed(client):
    resp = client.post("/api/v1/agent/chat", json={**_BODY, "messages": []})
    events = _parse_sse(resp.text)
    assert events[0]["type"] == "error"
    assert events[0]["code"] == "validate_failed"


def test_chat_provider_not_configured_yields_no_provider(client, monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))

    class Unavailable:
        def is_available(self):
            return False

    monkeypatch.setattr(agent_chat, "build_provider", lambda spec: Unavailable())
    resp = client.post("/api/v1/agent/chat", json=_BODY)
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "no_provider"


def test_chat_internal_exception_becomes_stream_error(client, monkeypatch):
    def boom(provider, article_id, html, messages):
        raise RuntimeError("unexpected")
        yield  # pragma: no cover

    monkeypatch.setattr(agent_chat, "run_chat_turn", boom)
    resp = client.post("/api/v1/agent/chat", json=_BODY)
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "stream_error"
