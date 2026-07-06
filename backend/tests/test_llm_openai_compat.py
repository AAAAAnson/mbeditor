"""OpenAICompatProvider:mock httpx,覆盖 stream_text SSE / call_structured /
错误归一(超时/429/5xx/连接失败/moderation 400)。绝不触网。"""
from __future__ import annotations

import json
from typing import Iterator

import httpx
import pytest

from app.services.llm.base import ModelSpec, StreamEvent, ToolCall, ToolSpec
from app.services.llm.errors import (
    LLMConnectionError,
    LLMQuotaExceeded,
    LLMRateLimited,
    LLMRefusal,
    LLMSchemaMismatch,
    LLMServerError,
    LLMTimeout,
)
from app.services.llm.providers.openai_compat import (
    OpenAICompatProvider,
    extract_inline_tool_calls,
)


def _spec(**kw) -> ModelSpec:
    base = dict(
        provider="openai_compat", model="deepseek-chat",
        base_url="https://api.deepseek.com/v1", api_key="sk-test",
    )
    base.update(kw)
    return ModelSpec(**base)  # type: ignore[arg-type]


# --- is_available -----------------------------------------------------------
def test_is_available_true_when_all_set():
    assert OpenAICompatProvider(_spec()).is_available() is True


@pytest.mark.parametrize("missing", ["api_key", "base_url", "model"])
def test_is_available_false_when_field_missing(missing):
    assert OpenAICompatProvider(_spec(**{missing: ""})).is_available() is False


# --- stream_text ------------------------------------------------------------
class _FakeStreamResponse:
    """模拟 httpx.Response(stream context manager)。"""

    def __init__(self, lines: list[str], status_code: int = 200):
        self._lines = lines
        self.status_code = status_code

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "err", request=httpx.Request("POST", "http://x"),
                response=httpx.Response(self.status_code, request=httpx.Request("POST", "http://x")),
            )

    def iter_lines(self) -> Iterator[str]:
        yield from self._lines


def _sse(content: str) -> str:
    return "data: " + json.dumps({"choices": [{"delta": {"content": content}}]})


def test_stream_text_yields_tokens(monkeypatch):
    lines = [_sse("上"), _sse("周"), _sse("末"), "data: [DONE]"]

    def fake_stream(self, method, url, **kw):
        return _FakeStreamResponse(lines)

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    prov = OpenAICompatProvider(_spec())
    out = list(prov.stream_text("sys", [{"role": "user", "content": "海洋馆"}]))
    assert all(isinstance(e, StreamEvent) for e in out)
    assert [e.kind for e in out] == ["token", "token", "token"]
    assert "".join(e.text for e in out) == "上周末"


def test_stream_text_skips_empty_and_keepalive(monkeypatch):
    lines = ["", ": keep-alive", _sse(""), _sse("好"), "data: [DONE]"]

    def fake_stream(self, method, url, **kw):
        return _FakeStreamResponse(lines)

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    out = list(OpenAICompatProvider(_spec()).stream_text("s", [{"role": "user", "content": "x"}]))
    assert [e.text for e in out] == ["好"]


def test_stream_text_429_raises_rate_limited(monkeypatch):
    def fake_stream(self, method, url, **kw):
        return _FakeStreamResponse([], status_code=429)

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    with pytest.raises(LLMRateLimited):
        list(OpenAICompatProvider(_spec()).stream_text("s", [{"role": "user", "content": "x"}]))


def test_stream_text_timeout_raises(monkeypatch):
    def fake_stream(self, method, url, **kw):
        raise httpx.TimeoutException("slow")

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    with pytest.raises(LLMTimeout):
        list(OpenAICompatProvider(_spec()).stream_text("s", [{"role": "user", "content": "x"}]))


def test_stream_text_connect_error_raises(monkeypatch):
    def fake_stream(self, method, url, **kw):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    with pytest.raises(LLMConnectionError):
        list(OpenAICompatProvider(_spec()).stream_text("s", [{"role": "user", "content": "x"}]))


# --- call_structured --------------------------------------------------------
_SCHEMA = {
    "type": "object",
    "properties": {"tone": {"type": "string"}},
    "required": ["tone"],
}


def _post_returning(payload: dict, status_code: int = 200, body_text: str = ""):
    def fake_post(self, url, **kw):
        req = httpx.Request("POST", url)
        if body_text:
            return httpx.Response(status_code, request=req, text=body_text)
        return httpx.Response(status_code, request=req, json=payload)

    return fake_post


def _chat_json(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def test_call_structured_returns_dict(monkeypatch):
    monkeypatch.setattr(
        httpx.Client, "post", _post_returning(_chat_json(json.dumps({"tone": "温柔"})))
    )
    out = OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)
    assert out == {"tone": "温柔"}


def test_call_structured_invalid_json_raises_schema_mismatch(monkeypatch):
    monkeypatch.setattr(httpx.Client, "post", _post_returning(_chat_json("not json{")))
    with pytest.raises(LLMSchemaMismatch):
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)


def test_call_structured_schema_violation_raises(monkeypatch):
    # 合法 JSON 但缺 required 字段 -> jsonschema 兜底拦截。
    monkeypatch.setattr(
        httpx.Client, "post", _post_returning(_chat_json(json.dumps({"wrong": 1})))
    )
    with pytest.raises(LLMSchemaMismatch):
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)


def test_call_structured_moderation_400_raises_refusal(monkeypatch):
    body = json.dumps({"error": {"code": "content_filter", "message": "blocked"}})
    monkeypatch.setattr(httpx.Client, "post", _post_returning({}, status_code=400, body_text=body))
    with pytest.raises(LLMRefusal) as ei:
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)
    assert ei.value.category == "moderation"


def test_call_structured_plain_400_raises_schema_mismatch(monkeypatch):
    body = json.dumps({"error": {"code": "invalid_request", "message": "bad"}})
    monkeypatch.setattr(httpx.Client, "post", _post_returning({}, status_code=400, body_text=body))
    with pytest.raises(LLMSchemaMismatch):
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)


def test_call_structured_402_raises_quota_exceeded(monkeypatch):
    # DeepSeek 余额不足返回 402 -> 必须归一成 LLMQuotaExceeded,
    # 绝不能落进 LLMSchemaMismatch(「格式不符」会诱导无效重试)。
    monkeypatch.setattr(
        httpx.Client, "post",
        _post_returning({}, status_code=402, body_text="Insufficient Balance"),
    )
    with pytest.raises(LLMQuotaExceeded):
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)


def test_call_text_402_raises_quota_exceeded(monkeypatch):
    monkeypatch.setattr(
        httpx.Client, "post",
        _post_returning({}, status_code=402, body_text="Insufficient Balance"),
    )
    with pytest.raises(LLMQuotaExceeded):
        OpenAICompatProvider(_spec()).call_text("s", "u")


def test_call_structured_500_raises_server_error(monkeypatch):
    monkeypatch.setattr(httpx.Client, "post", _post_returning({}, status_code=500, body_text="oops"))
    with pytest.raises(LLMServerError):
        OpenAICompatProvider(_spec()).call_structured("s", "u", _SCHEMA)


# --- call_text --------------------------------------------------------------
def test_call_text_returns_content(monkeypatch):
    monkeypatch.setattr(httpx.Client, "post", _post_returning(_chat_json("一句话摘要")))
    assert OpenAICompatProvider(_spec()).call_text("s", "u") == "一句话摘要"


# --- stream_with_tools(批1 新增) ---------------------------------------------
_TOOLS = [
    ToolSpec(
        name="replace_block",
        description="整块替换 html",
        parameters={
            "type": "object",
            "properties": {"id": {"type": "string"}, "html": {"type": "string"}},
            "required": ["id", "html"],
        },
    ),
    ToolSpec(name="read_article", description="读结构摘要", parameters={"type": "object"}),
]


def _sse_choice(delta: dict | None = None, finish_reason: str | None = None) -> str:
    choice: dict = {"delta": delta or {}}
    if finish_reason is not None:
        choice["finish_reason"] = finish_reason
    return "data: " + json.dumps({"choices": [choice]})


def _tool_frag(index: int, *, call_id: str | None = None,
               name: str | None = None, arguments: str | None = None) -> dict:
    frag: dict = {"index": index}
    if call_id is not None:
        frag["id"] = call_id
    fn: dict = {}
    if name is not None:
        fn["name"] = name
    if arguments is not None:
        fn["arguments"] = arguments
    if fn:
        frag["function"] = fn
    return {"tool_calls": [frag]}


def _patch_stream(monkeypatch, lines: list[str], captured: dict | None = None):
    def fake_stream(self, method, url, **kw):
        if captured is not None:
            captured["json"] = kw.get("json")
        return _FakeStreamResponse(lines)

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)


def test_stream_with_tools_assembles_fragmented_tool_call(monkeypatch):
    lines = [
        _sse_choice({"content": "好的,"}),
        _sse_choice(_tool_frag(0, call_id="call_1", name="replace_block", arguments="")),
        _sse_choice(_tool_frag(0, arguments='{"id":"b1",')),
        _sse_choice(_tool_frag(0, arguments='"html":"<p>x</p>"}')),
        _sse_choice(finish_reason="tool_calls"),
        "data: [DONE]",
    ]
    captured: dict = {}
    _patch_stream(monkeypatch, lines, captured)
    prov = OpenAICompatProvider(_spec())
    out = list(prov.stream_with_tools("sys", [{"role": "user", "content": "改第一段"}], _TOOLS))
    tokens = [e for e in out if e.kind == "token"]
    calls = [e for e in out if e.kind == "tool_call"]
    assert "".join(t.text for t in tokens) == "好的,"
    assert len(calls) == 1
    tc = calls[0].tool_call
    assert isinstance(tc, ToolCall)
    assert tc.id == "call_1"
    assert tc.name == "replace_block"
    assert tc.arguments == {"id": "b1", "html": "<p>x</p>"}
    done = out[-1]
    assert done.kind == "done" and done.stop_reason == "tool_calls"
    # payload:tools 以 function 定义直传 parameters
    tools_sent = captured["json"]["tools"]
    assert tools_sent[0]["type"] == "function"
    assert tools_sent[0]["function"]["name"] == "replace_block"
    assert tools_sent[0]["function"]["parameters"]["required"] == ["id", "html"]


def test_stream_with_tools_plain_text_maps_stop_to_end(monkeypatch):
    lines = [
        _sse_choice({"content": "这段写得已经很好了。"}),
        _sse_choice(finish_reason="stop"),
        "data: [DONE]",
    ]
    _patch_stream(monkeypatch, lines)
    out = list(OpenAICompatProvider(_spec()).stream_with_tools(
        "s", [{"role": "user", "content": "x"}], _TOOLS))
    assert [e.kind for e in out] == ["token", "done"]
    assert out[-1].stop_reason == "end"


def test_stream_with_tools_maps_length(monkeypatch):
    lines = [_sse_choice({"content": "太长"}), _sse_choice(finish_reason="length"), "data: [DONE]"]
    _patch_stream(monkeypatch, lines)
    out = list(OpenAICompatProvider(_spec()).stream_with_tools(
        "s", [{"role": "user", "content": "x"}], _TOOLS))
    assert out[-1].stop_reason == "length"


def test_stream_with_tools_invalid_arguments_raises_schema_mismatch(monkeypatch):
    lines = [
        _sse_choice(_tool_frag(0, call_id="call_1", name="replace_block", arguments="not json{")),
        _sse_choice(finish_reason="tool_calls"),
        "data: [DONE]",
    ]
    _patch_stream(monkeypatch, lines)
    with pytest.raises(LLMSchemaMismatch):
        list(OpenAICompatProvider(_spec()).stream_with_tools(
            "s", [{"role": "user", "content": "x"}], _TOOLS))


def test_stream_with_tools_content_fallback_extracts_inline_call(monkeypatch):
    """DeepSeek 已知缺陷:tool call 吐进 content、finish_reason=stop。"""
    inline = json.dumps({"name": "replace_block", "arguments": {"id": "b2", "html": "<p>y</p>"}})
    lines = [_sse_choice({"content": inline}), _sse_choice(finish_reason="stop"), "data: [DONE]"]
    _patch_stream(monkeypatch, lines)
    out = list(OpenAICompatProvider(_spec()).stream_with_tools(
        "s", [{"role": "user", "content": "x"}], _TOOLS))
    calls = [e for e in out if e.kind == "tool_call"]
    assert len(calls) == 1
    assert calls[0].tool_call.name == "replace_block"
    assert calls[0].tool_call.arguments == {"id": "b2", "html": "<p>y</p>"}
    assert out[-1].kind == "done" and out[-1].stop_reason == "tool_calls"


def test_stream_with_tools_content_fallback_ignores_unknown_tool(monkeypatch):
    """正文里的 JSON 示例(非 known 工具名)不误伤。"""
    inline = json.dumps({"name": "danger_tool", "arguments": {"x": 1}})
    lines = [_sse_choice({"content": inline}), _sse_choice(finish_reason="stop"), "data: [DONE]"]
    _patch_stream(monkeypatch, lines)
    out = list(OpenAICompatProvider(_spec()).stream_with_tools(
        "s", [{"role": "user", "content": "x"}], _TOOLS))
    assert [e for e in out if e.kind == "tool_call"] == []
    assert out[-1].stop_reason == "end"


def test_stream_with_tools_stream_timeout_raises(monkeypatch):
    def fake_stream(self, method, url, **kw):
        raise httpx.TimeoutException("slow")

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    with pytest.raises(LLMTimeout):
        list(OpenAICompatProvider(_spec()).stream_with_tools(
            "s", [{"role": "user", "content": "x"}], _TOOLS))


# --- extract_inline_tool_calls(纯函数) ---------------------------------------
_KNOWN = ["replace_block", "read_article"]


def test_extract_single_object_with_dict_arguments():
    text = '{"name": "replace_block", "arguments": {"id": "b1", "html": "<p>a</p>"}}'
    out = extract_inline_tool_calls(text, _KNOWN)
    assert len(out) == 1
    assert out[0].name == "replace_block"
    assert out[0].arguments == {"id": "b1", "html": "<p>a</p>"}
    assert out[0].id  # 合成 id 非空


def test_extract_arguments_as_json_string():
    text = json.dumps({"name": "read_article", "arguments": "{\"detail\": true}"})
    out = extract_inline_tool_calls(text, _KNOWN)
    assert len(out) == 1
    assert out[0].arguments == {"detail": True}


def test_extract_tool_calls_array_openai_style():
    text = json.dumps({
        "tool_calls": [
            {"id": "call_a", "function": {"name": "read_article", "arguments": "{}"}},
            {"id": "call_b", "function": {"name": "replace_block",
                                          "arguments": "{\"id\":\"b9\",\"html\":\"<p>z</p>\"}"}},
        ]
    })
    out = extract_inline_tool_calls(text, _KNOWN)
    assert [c.name for c in out] == ["read_article", "replace_block"]
    assert out[1].id == "call_b"
    assert out[1].arguments == {"id": "b9", "html": "<p>z</p>"}


def test_extract_from_fenced_json_block():
    text = "```json\n" + json.dumps(
        {"name": "replace_block", "arguments": {"id": "b1", "html": "<p>a</p>"}}
    ) + "\n```"
    out = extract_inline_tool_calls(text, _KNOWN)
    assert len(out) == 1 and out[0].name == "replace_block"


def test_extract_embedded_json_in_prose():
    text = '我来改这一块:{"name": "replace_block", "arguments": {"id": "b3", "html": "<p>c</p>"}} 好了。'
    out = extract_inline_tool_calls(text, _KNOWN)
    assert len(out) == 1 and out[0].arguments["id"] == "b3"


def test_extract_unknown_tool_name_returns_empty():
    text = '{"name": "delete_everything", "arguments": {}}'
    assert extract_inline_tool_calls(text, _KNOWN) == []


def test_extract_plain_prose_returns_empty():
    assert extract_inline_tool_calls("这段正文没有任何 JSON。", _KNOWN) == []
    assert extract_inline_tool_calls("", _KNOWN) == []


def test_extract_invalid_argument_string_skipped():
    text = json.dumps({"name": "replace_block", "arguments": "not json{"})
    assert extract_inline_tool_calls(text, _KNOWN) == []


# --- 批4 minor 清账:HTTPError 归一 / 双工具交错分片 / bare 形状缺 arguments ------
def test_stream_with_tools_http_error_raises_connection_error(monkeypatch):
    def fake_stream(self, method, url, **kw):
        raise httpx.RemoteProtocolError("peer closed connection")

    monkeypatch.setattr(httpx.Client, "stream", fake_stream)
    with pytest.raises(LLMConnectionError):
        list(OpenAICompatProvider(_spec()).stream_with_tools(
            "s", [{"role": "user", "content": "x"}], _TOOLS))


def test_stream_with_tools_interleaved_two_tool_fragments(monkeypatch):
    """双工具分片交错乱序到达:按 index 各自拼装,产出顺序按 index 升序。"""
    lines = [
        _sse_choice(_tool_frag(0, call_id="call_a", name="replace_block", arguments='{"id":')),
        _sse_choice(_tool_frag(1, call_id="call_b", name="read_article", arguments="{")),
        _sse_choice(_tool_frag(1, arguments="}")),
        _sse_choice(_tool_frag(0, arguments='"b1","html":"<p>x</p>"}')),
        _sse_choice(finish_reason="tool_calls"),
        "data: [DONE]",
    ]
    _patch_stream(monkeypatch, lines)
    out = list(OpenAICompatProvider(_spec()).stream_with_tools(
        "s", [{"role": "user", "content": "x"}], _TOOLS))
    calls = [e.tool_call for e in out if e.kind == "tool_call"]
    assert [c.id for c in calls] == ["call_a", "call_b"]
    assert calls[0].name == "replace_block"
    assert calls[0].arguments == {"id": "b1", "html": "<p>x</p>"}
    assert calls[1].name == "read_article"
    assert calls[1].arguments == {}
    assert out[-1].kind == "done" and out[-1].stop_reason == "tool_calls"


def test_extract_bare_shape_without_arguments_key_skipped():
    """bare 形状必须带 arguments 键:正文里的 {"name": ...} JSON 示例不误伤。"""
    assert extract_inline_tool_calls('{"name": "read_article"}', _KNOWN) == []
    assert extract_inline_tool_calls(
        '介绍一下:{"name": "replace_block", "desc": "整块替换"}', _KNOWN) == []
