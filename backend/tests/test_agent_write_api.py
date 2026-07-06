"""Tests for POST /api/v1/agent/write SSE 端点(线程桥真流式)。

用 monkeypatch 把 article_author.generate_article 换成脚本化 emit,断言响应是
text/event-stream、HTTP 200、帧可逐条解析、含 done。
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.v1 import agent_generate


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


def test_write_returns_event_stream_200(client, monkeypatch):
    def fake_generate(intent, audience, tone, *, voice_sample="",
                      use_brand_voice=True, provider_override=None, emit):
        from app.services.sse_events import (
            stage_event, title_event, token_event, done_event)
        emit(stage_event("立意", "active"))
        emit(stage_event("立意", "done"))
        emit(title_event("标题"))
        emit(token_event("正"))
        emit(token_event("文"))
        emit(done_event(html="<section>x</section>", markdown="正文",
                        report={"issues": [], "warnings": [], "stats": {}}, aigc=False))

    monkeypatch.setattr(agent_generate.article_author, "generate_article", fake_generate)

    resp = client.post("/api/v1/agent/write", json={
        "intent": "带娃去海洋馆", "audience": "生活同好", "tone": "温柔治愈",
    })
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    types = [e["type"] for e in events]
    assert types[0] == "stage"
    assert "title" in types
    assert types.count("token") == 2
    assert types[-1] == "done"
    assert events[-1]["html"] == "<section>x</section>"


def test_write_error_frame_still_http_200(client, monkeypatch):
    def fake_generate(intent, audience, tone, *, voice_sample="",
                      use_brand_voice=True, provider_override=None, emit):
        from app.services.sse_events import error_event
        emit(error_event("no_provider", "还没配置模型 key"))

    monkeypatch.setattr(agent_generate.article_author, "generate_article", fake_generate)
    resp = client.post("/api/v1/agent/write", json={"intent": "x"})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "no_provider"


def test_write_accepts_empty_body(client, monkeypatch):
    def fake_generate(intent, audience, tone, *, voice_sample="",
                      use_brand_voice=True, provider_override=None, emit):
        from app.services.sse_events import error_event
        emit(error_event("no_provider", "x"))

    monkeypatch.setattr(agent_generate.article_author, "generate_article", fake_generate)
    resp = client.post("/api/v1/agent/write", json={})
    assert resp.status_code == 200


def test_write_internal_exception_becomes_stream_error_frame(client, monkeypatch):
    def boom(intent, audience, tone, *, voice_sample="",
             use_brand_voice=True, provider_override=None, emit):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(agent_generate.article_author, "generate_article", boom)
    resp = client.post("/api/v1/agent/write", json={"intent": "x"})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "stream_error"
