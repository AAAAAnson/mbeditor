"""AnthropicProvider:mock anthropic.Anthropic,覆盖 call_structured(平移语义)、
stream_text、call_text、is_available、refusal/timeout 归一。绝不触网。"""
from __future__ import annotations

import json
from typing import Iterator

import anthropic
import pytest

from types import SimpleNamespace as _NS

from app.core.config import settings
from app.services.llm.base import ModelSpec, StreamEvent, ToolCall, ToolSpec
from app.services.llm.errors import (
    LLMRefusal,
    LLMSchemaMismatch,
    LLMTimeout,
    LLMTruncated,
    LLMUnavailable,
)
from app.services.llm.providers.anthropic import (
    AnthropicProvider,
    _to_anthropic_messages,
)


# --- fakes ------------------------------------------------------------------
class _FakeBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class _FakeMessage:
    def __init__(self, *, text=None, stop_reason="end_turn", stop_details=None):
        self.content = [_FakeBlock(text)] if text is not None else []
        self.stop_reason = stop_reason
        self.stop_details = stop_details
        self._request_id = "req_x"


class _FakeStopDetails:
    def __init__(self, category=None):
        self.category = category
        self.explanation = ""


class _FakeStream:
    """模拟 client.messages.stream(...) 的 context manager + text_stream。"""

    def __init__(self, pieces: list[str]):
        self._pieces = pieces

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self) -> Iterator[str]:
        yield from self._pieces


class _FakeToolStream:
    """模拟 messages.stream(...) 的 context manager + 原始事件迭代(tool use)。"""

    def __init__(self, events: list):
        self._events = events

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        return iter(self._events)


class _FakeMessages:
    def __init__(self, *, create_result=None, create_exc=None, stream_pieces=None,
                 stream_obj=None):
        self._create_result = create_result
        self._create_exc = create_exc
        self._stream_pieces = stream_pieces or []
        self._stream_obj = stream_obj
        self.last_stream_kwargs: dict = {}

    def create(self, **kw):
        if self._create_exc is not None:
            raise self._create_exc
        return self._create_result

    def stream(self, **kw):
        self.last_stream_kwargs = kw
        if self._stream_obj is not None:
            return self._stream_obj
        return _FakeStream(self._stream_pieces)


class _FakeClient:
    def __init__(self, messages: _FakeMessages):
        self._messages = messages

    def with_options(self, **kw):
        return self

    @property
    def messages(self):
        return self._messages


def _spec(**kw) -> ModelSpec:
    base = dict(provider="anthropic", model="claude-opus-4-8", api_key="sk-ant-x")
    base.update(kw)
    return ModelSpec(**base)  # type: ignore[arg-type]


def _provider_with(messages: _FakeMessages, **spec_kw) -> AnthropicProvider:
    prov = AnthropicProvider(_spec(**spec_kw))
    prov._client = _FakeClient(messages)  # inject mock; bypass SDK construction
    return prov


# --- is_available -----------------------------------------------------------
def test_is_available_true_with_byok_key():
    assert AnthropicProvider(_spec(api_key="sk-ant-x")).is_available() is True


def test_is_available_falls_back_to_env(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "env-key")
    assert AnthropicProvider(_spec(api_key="")).is_available() is True


def test_is_available_false_without_any_key(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    assert AnthropicProvider(_spec(api_key="")).is_available() is False


# --- call_structured (平移语义) ---------------------------------------------
_SCHEMA = {"type": "object", "properties": {"tone": {"type": "string"}}}


def test_call_structured_returns_dict():
    msg = _FakeMessage(text=json.dumps({"tone": "温柔"}))
    prov = _provider_with(_FakeMessages(create_result=msg))
    assert prov.call_structured("s", "u", _SCHEMA) == {"tone": "温柔"}


def test_call_structured_refusal_raises():
    msg = _FakeMessage(text=None, stop_reason="refusal",
                       stop_details=_FakeStopDetails(category="safety"))
    prov = _provider_with(_FakeMessages(create_result=msg))
    with pytest.raises(LLMRefusal) as ei:
        prov.call_structured("s", "u", _SCHEMA)
    assert ei.value.category == "safety"


def test_call_structured_truncated_raises():
    msg = _FakeMessage(text="{}", stop_reason="max_tokens")
    prov = _provider_with(_FakeMessages(create_result=msg))
    with pytest.raises(LLMTruncated):
        prov.call_structured("s", "u", _SCHEMA)


def test_call_structured_timeout_normalized():
    exc = anthropic.APITimeoutError(request=_dummy_request())
    prov = _provider_with(_FakeMessages(create_exc=exc))
    with pytest.raises(LLMTimeout):
        prov.call_structured("s", "u", _SCHEMA)


def test_call_structured_unavailable_when_no_key(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    prov = AnthropicProvider(_spec(api_key=""))
    with pytest.raises(LLMUnavailable):
        prov.call_structured("s", "u", _SCHEMA)


# --- stream_text ------------------------------------------------------------
def test_stream_text_yields_tokens():
    prov = _provider_with(_FakeMessages(stream_pieces=["上", "周", "末"]))
    out = list(prov.stream_text("s", [{"role": "user", "content": "海洋馆"}]))
    assert all(isinstance(e, StreamEvent) and e.kind == "token" for e in out)
    assert "".join(e.text for e in out) == "上周末"


# --- call_text --------------------------------------------------------------
def test_call_text_returns_first_text_block():
    msg = _FakeMessage(text="一句话摘要")
    prov = _provider_with(_FakeMessages(create_result=msg))
    assert prov.call_text("s", "u") == "一句话摘要"


def _dummy_request():
    import httpx
    return httpx.Request("POST", "https://api.anthropic.com/v1/messages")


# --- stream_with_tools(批1 新增) ---------------------------------------------
_TOOLS = [
    ToolSpec(
        name="replace_block",
        description="整块替换 html",
        parameters={"type": "object", "properties": {"id": {"type": "string"}}},
    ),
]


def _ev(type_: str, **kw):
    return _NS(type=type_, **kw)


def _tool_use_events(*, partials: list[str], stop_reason: str = "tool_use") -> list:
    return [
        _ev("content_block_start", content_block=_NS(type="text")),
        _ev("content_block_delta", delta=_NS(type="text_delta", text="好的")),
        _ev("content_block_stop"),
        _ev("content_block_start",
            content_block=_NS(type="tool_use", id="toolu_1", name="replace_block")),
        *[
            _ev("content_block_delta", delta=_NS(type="input_json_delta", partial_json=p))
            for p in partials
        ],
        _ev("content_block_stop"),
        _ev("message_delta", delta=_NS(stop_reason=stop_reason)),
    ]


def test_stream_with_tools_assembles_tool_use_from_partials():
    events = _tool_use_events(partials=['{"id":"b1",', '"html":"<p>x</p>"}'])
    messages = _FakeMessages(stream_obj=_FakeToolStream(events))
    prov = _provider_with(messages)
    out = list(prov.stream_with_tools("s", [{"role": "user", "content": "改第一段"}], _TOOLS))
    tokens = [e for e in out if e.kind == "token"]
    calls = [e for e in out if e.kind == "tool_call"]
    assert "".join(t.text for t in tokens) == "好的"
    assert len(calls) == 1
    tc = calls[0].tool_call
    assert isinstance(tc, ToolCall)
    assert tc.id == "toolu_1"
    assert tc.name == "replace_block"
    assert tc.arguments == {"id": "b1", "html": "<p>x</p>"}
    assert out[-1].kind == "done" and out[-1].stop_reason == "tool_calls"
    # tools 以 anthropic input_schema 形式传入
    tools_sent = messages.last_stream_kwargs["tools"]
    assert tools_sent[0]["name"] == "replace_block"
    assert tools_sent[0]["input_schema"]["type"] == "object"


def test_stream_with_tools_end_turn_maps_end():
    events = [
        _ev("content_block_start", content_block=_NS(type="text")),
        _ev("content_block_delta", delta=_NS(type="text_delta", text="不用改。")),
        _ev("content_block_stop"),
        _ev("message_delta", delta=_NS(stop_reason="end_turn")),
    ]
    prov = _provider_with(_FakeMessages(stream_obj=_FakeToolStream(events)))
    out = list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))
    assert [e.kind for e in out] == ["token", "done"]
    assert out[-1].stop_reason == "end"


def test_stream_with_tools_max_tokens_maps_length():
    events = [
        _ev("content_block_delta", delta=_NS(type="text_delta", text="太长")),
        _ev("message_delta", delta=_NS(stop_reason="max_tokens")),
    ]
    prov = _provider_with(_FakeMessages(stream_obj=_FakeToolStream(events)))
    out = list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))
    assert out[-1].stop_reason == "length"


def test_stream_with_tools_invalid_input_json_raises_schema_mismatch():
    events = _tool_use_events(partials=["not json{"])
    prov = _provider_with(_FakeMessages(stream_obj=_FakeToolStream(events)))
    with pytest.raises(LLMSchemaMismatch):
        list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))


def test_stream_with_tools_timeout_normalized(monkeypatch):
    class _RaisingMessages:
        def stream(self, **kw):
            raise anthropic.APITimeoutError(request=_dummy_request())

    prov = AnthropicProvider(_spec())
    prov._client = _FakeClient(_RaisingMessages())  # type: ignore[arg-type]
    with pytest.raises(LLMTimeout):
        list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))


# --- _to_anthropic_messages(openai 风格 -> anthropic 线格式) ------------------
def test_to_anthropic_messages_converts_tool_roundtrip():
    msgs = [
        {"role": "user", "content": "把第一段改短"},
        {
            "role": "assistant",
            "content": "我来改。",
            "tool_calls": [
                {"id": "call_1",
                 "function": {"name": "replace_block",
                              "arguments": "{\"id\":\"b1\",\"html\":\"<p>x</p>\"}"}},
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "{\"applied\": true}"},
        {"role": "tool", "tool_call_id": "call_2", "content": "{\"applied\": true}"},
    ]
    out = _to_anthropic_messages(msgs)
    assert out[0] == {"role": "user", "content": "把第一段改短"}
    asst = out[1]
    assert asst["role"] == "assistant"
    assert asst["content"][0] == {"type": "text", "text": "我来改。"}
    assert asst["content"][1]["type"] == "tool_use"
    assert asst["content"][1]["id"] == "call_1"
    assert asst["content"][1]["name"] == "replace_block"
    assert asst["content"][1]["input"] == {"id": "b1", "html": "<p>x</p>"}
    # 连续 role:"tool" 合并进同一条 user 消息(anthropic 要求角色交替)
    assert len(out) == 3
    results = out[2]
    assert results["role"] == "user"
    assert [b["type"] for b in results["content"]] == ["tool_result", "tool_result"]
    assert results["content"][0]["tool_use_id"] == "call_1"
    assert results["content"][1]["tool_use_id"] == "call_2"


def test_to_anthropic_messages_plain_passthrough():
    msgs = [
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "在。"},
    ]
    assert _to_anthropic_messages(msgs) == msgs


# --- 批4 minor 清账:stream_with_tools 补 APIStatusError 归一 --------------------
def _status_error(status: int) -> anthropic.APIStatusError:
    import httpx
    resp = httpx.Response(status, request=_dummy_request())
    return anthropic.APIStatusError("boom", response=resp, body=None)


def _raising_provider(exc) -> AnthropicProvider:
    class _RaisingMessages:
        def stream(self, **kw):
            raise exc

    prov = AnthropicProvider(_spec())
    prov._client = _FakeClient(_RaisingMessages())  # type: ignore[arg-type]
    return prov


def test_stream_with_tools_status_5xx_raises_server_error():
    from app.services.llm.errors import LLMServerError
    prov = _raising_provider(_status_error(503))
    with pytest.raises(LLMServerError):
        list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))


def test_stream_with_tools_status_4xx_raises_schema_mismatch():
    prov = _raising_provider(_status_error(422))
    with pytest.raises(LLMSchemaMismatch):
        list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))


# --- H4:402 余额不足 -> LLMQuotaExceeded(绝不落 SchemaMismatch)---------------
def test_create_402_raises_quota_exceeded():
    from app.services.llm.errors import LLMQuotaExceeded
    prov = _provider_with(_FakeMessages(create_exc=_status_error(402)))
    with pytest.raises(LLMQuotaExceeded):
        prov.call_text("s", "u")


def test_stream_with_tools_402_raises_quota_exceeded():
    from app.services.llm.errors import LLMQuotaExceeded
    prov = _raising_provider(_status_error(402))
    with pytest.raises(LLMQuotaExceeded):
        list(prov.stream_with_tools("s", [{"role": "user", "content": "x"}], _TOOLS))
