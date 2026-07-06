"""Tests for AI 修改闭环后端:rewrite_done 帧 + rewrite_prompt + rewrite 编排 + /agent/rewrite 端点。

既有 5 型帧与 /agent/write 契约零改,本文件只覆盖新增面。
"""
from __future__ import annotations

import json
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import agent_generate
from app.main import app
from app.services import article_author
from app.services.article_author import rewrite_article, rewrite_text
from app.services.llm.base import ModelSpec, StreamEvent
from app.services.llm.errors import LLMTimeout
from app.services.rewrite_prompt import build_rewrite_messages, parse_title_variants
from app.services.sse_events import rewrite_done_event


# ---- helpers(与 test_article_author.py 同款) ------------------------------

def _collect():
    raw: list[str] = []

    def emit(frame: str) -> None:
        raw.append(frame)

    def parsed() -> list[dict]:
        out = []
        for f in raw:
            assert f.startswith("data: ") and f.endswith("\n\n")
            out.append(json.loads(f[len("data: "):].strip()))
        return out

    return emit, parsed


class _MockProvider:
    def __init__(self, spec, events, available=True, raise_exc=None):
        self.spec = spec
        self._events = events
        self._available = available
        self._raise = raise_exc

    def is_available(self) -> bool:
        return self._available

    def stream_text(self, system, messages, **kw) -> Iterator[StreamEvent]:
        if self._raise is not None:
            raise self._raise
        for ev in self._events:
            yield ev

    def call_text(self, system, user, **kw) -> str:
        return ""

    def call_structured(self, system, user, schema, **kw) -> dict:
        return {}


_SPEC = ModelSpec(provider="openai_compat", model="test", base_url="http://x", api_key="k")


def _install_provider(monkeypatch, events, available=True, raise_exc=None):
    provider = _MockProvider(_SPEC, events, available=available, raise_exc=raise_exc)
    monkeypatch.setattr(article_author, "build_provider", lambda spec: provider)
    monkeypatch.setattr(article_author, "resolve_spec", lambda override: _SPEC)
    return provider


def _tokens(text: str) -> list[StreamEvent]:
    return [StreamEvent(kind="token", text=ch) for ch in text]


# ---- sse_events.rewrite_done_event -----------------------------------------

def test_rewrite_done_event_frame_shape():
    frame = rewrite_done_event("新文案", [])
    assert frame.startswith("data: ") and frame.endswith("\n\n")
    payload = json.loads(frame[len("data: "):].strip())
    assert payload == {"type": "rewrite_done", "text": "新文案", "variants": []}


def test_rewrite_done_event_with_variants():
    frame = rewrite_done_event("", ["甲", "乙", "丙"])
    payload = json.loads(frame[len("data: "):].strip())
    assert payload["variants"] == ["甲", "乙", "丙"]
    assert payload["text"] == ""


# ---- rewrite_prompt.build_rewrite_messages ----------------------------------

def test_build_messages_block_contains_material_and_constraints():
    system, user = build_rewrite_messages(
        scope="block", selected_text="原来的段落", instruction="更有画面感",
        title="带娃日记", article_text="全文上下文……",
    )
    assert "纯文本" in system          # 只返回纯文本、不带标记
    assert "原来的段落" in user
    assert "更有画面感" in user
    assert "带娃日记" in user
    assert "全文上下文" in user


def test_build_messages_title_asks_three_lines():
    system, user = build_rewrite_messages(
        scope="title", selected_text="", instruction="",
        title="旧标题", article_text="正文……",
    )
    assert "3" in system or "三" in system
    assert "一行一个" in system
    assert "旧标题" in user


def test_build_messages_digest_has_length_constraint():
    system, user = build_rewrite_messages(
        scope="digest", selected_text="", instruction="",
        title="t", article_text="正文……",
    )
    assert "120" in system


def test_build_messages_article_carries_instruction_and_tone():
    system, user = build_rewrite_messages(
        scope="article", selected_text="", instruction="压缩到约800字",
        title="t", article_text="# 旧标题\n\n旧正文", tone="俏皮带梗",
    )
    assert "压缩到约800字" in user
    assert "俏皮带梗" in user
    assert "旧正文" in user
    assert "Markdown" in system or "markdown" in system


# ---- rewrite_prompt.parse_title_variants -------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("甲\n乙\n丙", ["甲", "乙", "丙"]),
    ("1. 甲\n2. 乙\n3. 丙", ["甲", "乙", "丙"]),
    ("- 甲\n- 乙\n- 丙", ["甲", "乙", "丙"]),
    ("甲\n\n乙\n\n丙\n", ["甲", "乙", "丙"]),
    ("甲\n乙\n丙\n丁", ["甲", "乙", "丙"]),   # 超 3 截断
    ("只有一个", ["只有一个"]),                # 不足 3 按实际
    ("", []),
])
def test_parse_title_variants(raw, expected):
    assert parse_title_variants(raw) == expected


# ---- article_author.rewrite_text(block / digest / title) --------------------

def test_rewrite_block_streams_tokens_then_rewrite_done(monkeypatch):
    _install_provider(monkeypatch, _tokens("新文案"))
    emit, parsed = _collect()
    rewrite_text("block", selected_text="旧文案", instruction="润色", emit=emit)
    events = parsed()
    assert [e["type"] for e in events] == ["token", "token", "token", "rewrite_done"]
    assert events[-1]["text"] == "新文案"
    assert events[-1]["variants"] == []


def test_rewrite_digest_same_frame_sequence(monkeypatch):
    _install_provider(monkeypatch, _tokens("摘要"))
    emit, parsed = _collect()
    rewrite_text("digest", article_text="全文", emit=emit)
    events = parsed()
    assert events[-1]["type"] == "rewrite_done"
    assert events[-1]["text"] == "摘要"
    assert all(e["type"] == "token" for e in events[:-1])


def test_rewrite_title_no_tokens_only_variants(monkeypatch):
    _install_provider(monkeypatch, _tokens("标题甲\n标题乙\n标题丙"))
    emit, parsed = _collect()
    rewrite_text("title", title="旧标题", article_text="全文", emit=emit)
    events = parsed()
    assert [e["type"] for e in events] == ["rewrite_done"]
    assert events[0]["variants"] == ["标题甲", "标题乙", "标题丙"]


def test_rewrite_no_provider_emits_error(monkeypatch):
    _install_provider(monkeypatch, [], available=False)
    emit, parsed = _collect()
    rewrite_text("block", selected_text="x", emit=emit)
    events = parsed()
    assert events == [{"type": "error", "code": "no_provider",
                       "message": events[0]["message"]}]


def test_rewrite_llm_exception_mapped(monkeypatch):
    _install_provider(monkeypatch, [], raise_exc=LLMTimeout("slow"))
    emit, parsed = _collect()
    rewrite_text("block", selected_text="x", emit=emit)
    events = parsed()
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "llm_timeout"


# ---- article_author.rewrite_article(整篇:换调子/缩长度) ---------------------

_ARTICLE_MD = "# 新标题\n\n重写后的正文第一段。\n\n第二段。"


def test_rewrite_article_full_pipeline(monkeypatch):
    _install_provider(monkeypatch, _tokens(_ARTICLE_MD))
    emit, parsed = _collect()
    rewrite_article(article_text="# 旧标题\n\n旧正文", instruction="换个调子",
                    tone="温柔治愈", emit=emit)
    events = parsed()
    types = [e["type"] for e in events]
    assert "title" in types
    assert types.count("token") > 0
    assert types[-1] == "done"
    done = events[-1]
    assert done["html"]                      # 制版产物非空
    assert "重写后的正文" in done["markdown"]
    assert "issues" in done["report"]
    # 与 /agent/write 同套 stage 帧,生成层 UI 可复用
    stages = [e["stage"] for e in events if e["type"] == "stage"]
    assert "行文" in stages and "制版" in stages and "自检" in stages


def test_rewrite_article_tone_maps_template(monkeypatch):
    _install_provider(monkeypatch, _tokens(_ARTICLE_MD))
    captured: dict = {}
    real_compose = article_author.layout_composer.compose

    def spy_compose(markdown, template_id=None, **kw):
        captured["template_id"] = template_id
        return real_compose(markdown, template_id=template_id, **kw)

    monkeypatch.setattr(article_author.layout_composer, "compose", spy_compose)
    emit, parsed = _collect()
    rewrite_article(article_text="旧", instruction="", tone="俏皮带梗", emit=emit)
    assert captured["template_id"] == "tpl_vibrant"


def test_rewrite_article_llm_error_mapped(monkeypatch):
    _install_provider(monkeypatch, [], raise_exc=LLMTimeout("slow"))
    emit, parsed = _collect()
    rewrite_article(article_text="旧", instruction="", tone="", emit=emit)
    events = parsed()
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "llm_timeout"


# ---- POST /api/v1/agent/rewrite(端点线程桥) ---------------------------------

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


def test_rewrite_endpoint_block_streams(client, monkeypatch):
    def fake_rewrite_text(scope, *, selected_text="", instruction="", title="",
                          article_text="", provider_override=None, emit):
        from app.services.sse_events import rewrite_done_event, token_event
        emit(token_event("新"))
        emit(rewrite_done_event("新", []))

    monkeypatch.setattr(agent_generate.article_author, "rewrite_text", fake_rewrite_text)
    resp = client.post("/api/v1/agent/rewrite", json={
        "scope": "block", "selected_text": "旧", "instruction": "润色",
    })
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    assert [e["type"] for e in events] == ["token", "rewrite_done"]


def test_rewrite_endpoint_article_routes_to_rewrite_article(client, monkeypatch):
    called: dict = {}

    def fake_rewrite_article(*, article_text, instruction="", tone="",
                             provider_override=None, emit):
        called["article_text"] = article_text
        called["tone"] = tone
        from app.services.sse_events import done_event
        emit(done_event(html="<p>x</p>", markdown="x",
                        report={"issues": [], "warnings": [], "stats": {}}, aigc=False))

    monkeypatch.setattr(agent_generate.article_author, "rewrite_article", fake_rewrite_article)
    resp = client.post("/api/v1/agent/rewrite", json={
        "scope": "article", "article_text": "# 旧\n\n正文", "tone": "克制高级",
    })
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "done"
    assert called["tone"] == "克制高级"


def test_rewrite_endpoint_block_requires_selected_text(client):
    resp = client.post("/api/v1/agent/rewrite", json={"scope": "block"})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events == [{"type": "error", "code": "validate_failed",
                       "message": events[0]["message"]}]


def test_rewrite_endpoint_article_requires_article_text(client):
    resp = client.post("/api/v1/agent/rewrite", json={"scope": "article"})
    events = _parse_sse(resp.text)
    assert events[-1]["code"] == "validate_failed"


def test_rewrite_endpoint_invalid_scope_422(client):
    resp = client.post("/api/v1/agent/rewrite", json={"scope": "nope"})
    assert resp.status_code == 422


def test_rewrite_endpoint_internal_exception_becomes_stream_error(client, monkeypatch):
    def boom(scope, **kw):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(agent_generate.article_author, "rewrite_text", boom)
    resp = client.post("/api/v1/agent/rewrite", json={
        "scope": "block", "selected_text": "x",
    })
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "stream_error"


def test_rewrite_endpoint_provider_passthrough(client, monkeypatch):
    """BYOK provider 透传语义与 /agent/write 一致。"""
    seen: dict = {}

    def fake_rewrite_text(scope, *, selected_text="", instruction="", title="",
                          article_text="", provider_override=None, emit):
        seen["provider"] = provider_override
        from app.services.sse_events import rewrite_done_event
        emit(rewrite_done_event("x", []))

    monkeypatch.setattr(agent_generate.article_author, "rewrite_text", fake_rewrite_text)
    client.post("/api/v1/agent/rewrite", json={
        "scope": "block", "selected_text": "旧",
        "provider": {"provider": "openai_compat", "model": "m",
                     "base_url": "http://x", "api_key": "k"},
    })
    assert seen["provider"] is not None
    assert seen["provider"].model == "m"
