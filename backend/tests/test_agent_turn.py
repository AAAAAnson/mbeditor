"""chat_orchestrator.run_agent_turn:形态无关内核的参数注入直测(P2 批1)。

覆盖:注入自定义 system/收窄 tools 被透传给 provider.stream_with_tools;
reason 落进 checkpoint 的 add_revision;纯问答 turn 产帧序列
checkpoint→chat_token→turn_done;无 provider 早退。绝不触网。
"""
from __future__ import annotations

import pytest

from app.services import revisions_store
from app.services.chat_orchestrator import run_agent_turn
from app.services.llm.base import AgentLoopEvent, ToolCall


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    return tmp_path


def tok(text: str) -> AgentLoopEvent:
    return AgentLoopEvent(kind="token", text=text)


def call(cid: str, name: str, args: dict) -> AgentLoopEvent:
    return AgentLoopEvent(
        kind="tool_call", tool_call=ToolCall(id=cid, name=name, arguments=args)
    )


def done(stop: str) -> AgentLoopEvent:
    return AgentLoopEvent(kind="done", stop_reason=stop)


class FakeProvider:
    def __init__(self, script: list[list[AgentLoopEvent]], available: bool = True):
        self.script = list(script)
        self.available = available
        self.calls: list[dict] = []

    def is_available(self) -> bool:
        return self.available

    def stream_with_tools(self, system, messages, tools):
        self.calls.append({
            "system": system,
            "messages": [dict(m) for m in messages],
            "tools": tools,
        })
        yield from self.script.pop(0)


_HTML = "<section><p>第一段正文</p><p>第二段正文</p></section>"
_MSGS = [{"role": "user", "content": "把第一段改得更活泼"}]

_CUSTOM_SYSTEM = "自定义 system 提示词——只此一家"
_NARROW_TOOLS = [{"type": "function", "function": {"name": "read_article", "parameters": {}}}]


def _run(provider, *, system=_CUSTOM_SYSTEM, tools=_NARROW_TOOLS, reason="agent_turn",
         html=_HTML, article_id="art1", messages=None, max_tool_calls=12):
    return list(run_agent_turn(
        provider, article_id, html, messages or _MSGS,
        system=system, tools=tools, reason=reason, max_tool_calls=max_tool_calls,
    ))


def _types(events):
    return [e["type"] for e in events]


def test_injected_system_passed_to_provider():
    prov = FakeProvider([[tok("好的"), done("end")]])
    _run(prov)
    assert prov.calls[0]["system"] == _CUSTOM_SYSTEM


def test_injected_tools_passed_to_provider():
    prov = FakeProvider([[tok("好的"), done("end")]])
    _run(prov)
    assert prov.calls[0]["tools"] is _NARROW_TOOLS


def test_reason_lands_in_add_revision():
    prov = FakeProvider([[tok("好的"), done("end")]])
    events = _run(prov, reason="my_custom_reason")
    revs = revisions_store.list_revisions("art1")
    assert len(revs) == 1
    assert revs[0]["reason"] == "my_custom_reason"
    assert events[0]["type"] == "checkpoint"


def test_plain_answer_frame_sequence():
    prov = FakeProvider([[tok("不用"), tok("改。"), done("end")]])
    events = _run(prov)
    assert _types(events) == ["checkpoint", "chat_token", "chat_token", "turn_done"]
    assert events[-1]["summary"] == "不用改。"


def test_no_provider_yields_error_without_checkpoint():
    prov = FakeProvider([], available=False)
    events = _run(prov)
    assert _types(events) == ["error"]
    assert events[0]["code"] == "no_provider"
    assert revisions_store.list_revisions("art1") == []


def test_default_reason_is_agent_turn():
    prov = FakeProvider([[tok("好的"), done("end")]])
    list(run_agent_turn(
        prov, "artX", _HTML, _MSGS,
        system=_CUSTOM_SYSTEM, tools=_NARROW_TOOLS,
    ))
    revs = revisions_store.list_revisions("artX")
    assert revs[0]["reason"] == "agent_turn"


# --- 工具调用预算:读工具不占工作预算(换调子体验修复)-----------------------
# run_tool 按 name 从 _SPEC_BY_NAME 分派,与传给 provider 的 tools 列表无关,
# 故这些测试沿用默认 _NARROW_TOOLS(仅影响发给 fake provider 的入参)。
def _read_round(cid: str, ref: str = "b1") -> list[AgentLoopEvent]:
    # ref 变化保证签名不同,避开同参熔断(读签名仅在写成功后才重置)。
    return [call(cid, "read_blocks", {"ids": [ref]}), done("tool_calls")]


def _write_round(cid: str, tag: str) -> list[AgentLoopEvent]:
    # 变 html 保证签名不同,避开同参熔断,纯粹压工作预算。
    return [call(cid, "replace_block", {"block_id": "b1", "html": f"<section>{tag}</section>"}),
            done("tool_calls")]


def test_read_tools_excluded_from_work_budget():
    """read_blocks 不消耗 max_tool_calls 工作预算 —— 换调子先读后写不再误触上限。"""
    # 6 次读 > 工作预算 3(证读不计入),又 < runaway 兜底 3*3=9(不误触卡死闸)。
    script = [_read_round(f"r{i}", f"b{i}") for i in range(6)]
    script.append([tok("读完了,不改"), done("end")])
    prov = FakeProvider(script)
    events = _run(prov, max_tool_calls=3)
    assert events[-1]["type"] == "turn_done"
    assert not any(e["type"] == "error" for e in events)


def test_write_tools_hit_work_budget():
    """写工具(replace_block)超过 max_tool_calls 才触发「上限」终止。"""
    script = [_write_round(f"w{i}", f"v{i}") for i in range(4)]  # 4 writes > 预算 3
    prov = FakeProvider(script)
    events = _run(prov, max_tool_calls=3)
    assert events[-1]["type"] == "error"
    assert "上限" in events[-1]["message"]
    # 恰好放行 3 次写(第 4 次被拦),读工具不在此列。
    writes = [e for e in events if e["type"] == "tool_call" and e["name"] == "replace_block"]
    assert len(writes) == 3


def test_reads_do_not_starve_writes():
    """读夹在写之间:读不占预算,3 次写仍能全部跑完并收束。"""
    script = [
        _read_round("r0"),
        _write_round("w0", "a"),
        _read_round("r1"),
        _write_round("w1", "b"),
        _read_round("r2"),
        _write_round("w2", "c"),
        [tok("改完了"), done("end")],
    ]
    prov = FakeProvider(script)
    events = _run(prov, max_tool_calls=3)
    assert events[-1]["type"] == "turn_done"
    writes = [e for e in events if e["type"] == "tool_call" and e["name"] == "replace_block"]
    assert len(writes) == 3


def test_runaway_total_calls_backstop_terminates():
    """纯读也不能无限循环:总调用数超 max_tool_calls*3 兜底终止(防读循环)。"""
    ceiling = 3 * 3  # 与实现的 runaway 系数一致
    script = [_read_round(f"r{i}", f"b{i}") for i in range(ceiling + 2)]
    prov = FakeProvider(script)
    events = _run(prov, max_tool_calls=3)
    assert events[-1]["type"] == "error"
