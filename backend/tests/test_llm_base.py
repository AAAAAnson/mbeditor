"""LLMProvider Protocol + ModelSpec/StreamEvent + build_provider 工厂。"""
from __future__ import annotations

import pytest

from app.services.llm.base import (
    AgentLoopEvent,
    LLMProvider,
    ModelSpec,
    StreamEvent,
    ToolCall,
    ToolSpec,
    build_provider,
)
from app.services.llm.errors import LLMUnavailable


def test_modelspec_defaults():
    spec = ModelSpec(provider="openai_compat", model="deepseek-chat")
    assert spec.base_url == ""
    assert spec.api_key == ""
    assert spec.timeout == 60.0
    assert spec.max_tokens == 4096


def test_modelspec_frozen():
    spec = ModelSpec(provider="anthropic", model="claude-opus-4-8")
    with pytest.raises(Exception):
        spec.model = "other"  # type: ignore[misc]


def test_streamevent_fields():
    ev = StreamEvent(kind="token", text="上")
    assert ev.kind == "token"
    assert ev.text == "上"


def test_build_provider_unknown_raises_unavailable():
    spec = ModelSpec(provider="grok", model="x")
    with pytest.raises(LLMUnavailable):
        build_provider(spec)


def test_build_provider_openai_compat_returns_protocol():
    spec = ModelSpec(
        provider="openai_compat", model="deepseek-chat",
        base_url="https://api.deepseek.com/v1", api_key="sk-x",
    )
    prov = build_provider(spec)
    assert isinstance(prov, LLMProvider)  # runtime_checkable
    assert prov.spec is spec


def test_build_provider_anthropic_returns_protocol():
    spec = ModelSpec(provider="anthropic", model="claude-opus-4-8", api_key="sk-ant-x")
    prov = build_provider(spec)
    assert isinstance(prov, LLMProvider)
    assert prov.spec is spec


# --- tool-use 协议层(批1 新增) ----------------------------------------------
def test_toolspec_fields_and_frozen():
    ts = ToolSpec(
        name="replace_block",
        description="整块替换 html",
        parameters={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    assert ts.name == "replace_block"
    assert ts.parameters["type"] == "object"
    with pytest.raises(Exception):
        ts.name = "other"  # type: ignore[misc]


def test_toolcall_fields_and_frozen():
    tc = ToolCall(id="call_1", name="replace_block", arguments={"id": "b1"})
    assert tc.id == "call_1"
    assert tc.name == "replace_block"
    assert tc.arguments == {"id": "b1"}
    with pytest.raises(Exception):
        tc.name = "other"  # type: ignore[misc]


def test_agent_loop_event_defaults():
    ev = AgentLoopEvent(kind="token", text="好")
    assert ev.kind == "token"
    assert ev.text == "好"
    assert ev.tool_call is None
    assert ev.stop_reason == ""


def test_agent_loop_event_tool_call_and_done():
    tc = ToolCall(id="call_1", name="read_article", arguments={})
    ev = AgentLoopEvent(kind="tool_call", tool_call=tc)
    assert ev.tool_call is tc
    done = AgentLoopEvent(kind="done", stop_reason="tool_calls")
    assert done.stop_reason == "tool_calls"
    with pytest.raises(Exception):
        done.stop_reason = "end"  # type: ignore[misc]


def test_providers_expose_stream_with_tools():
    """两个 provider 都要实现 stream_with_tools(协议存在性)。"""
    oa = build_provider(
        ModelSpec(provider="openai_compat", model="m", base_url="https://x", api_key="k")
    )
    an = build_provider(ModelSpec(provider="anthropic", model="m", api_key="k"))
    assert callable(getattr(oa, "stream_with_tools"))
    assert callable(getattr(an, "stream_with_tools"))
    assert isinstance(oa, LLMProvider)
    assert isinstance(an, LLMProvider)
