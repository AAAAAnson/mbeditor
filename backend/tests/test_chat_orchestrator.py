"""chat_orchestrator.run_chat_turn:脚本化 fake provider 驱动的编排单测(批4)。

覆盖:checkpoint 落盘 / 多轮工具循环 / block_update 增量 / 熔断 / 写预算上限 /
零 tool_call 防御 / LLM* 异常 error 帧 / T0 system prompt。绝不触网。
"""
from __future__ import annotations

import json

import pytest

from app.services import revisions_store
from app.services.chat_orchestrator import MAX_TOOL_CALLS_PER_TURN, run_chat_turn
from app.services.chat_prompt import build_chat_system_prompt
from app.services.llm.base import AgentLoopEvent, ToolCall
from app.services.llm.errors import LLMTimeout


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    return tmp_path


# --- 脚本化 fake provider ------------------------------------------------------
def tok(text: str) -> AgentLoopEvent:
    return AgentLoopEvent(kind="token", text=text)


def call(cid: str, name: str, args: dict) -> AgentLoopEvent:
    return AgentLoopEvent(
        kind="tool_call", tool_call=ToolCall(id=cid, name=name, arguments=args)
    )


def done(stop: str) -> AgentLoopEvent:
    return AgentLoopEvent(kind="done", stop_reason=stop)


class FakeProvider:
    """script = 每次 stream_with_tools 调用要吐的事件列表(按轮消耗)。"""

    def __init__(self, script: list[list[AgentLoopEvent]], available: bool = True):
        self.script = list(script)
        self.available = available
        self.calls: list[dict] = []  # 每轮记录 {"system","messages","tools"}

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


def _run(provider, html=_HTML, article_id="art1", messages=None):
    return list(run_chat_turn(provider, article_id, html, messages or _MSGS))


def _types(events):
    return [e["type"] for e in events]


# --- checkpoint --------------------------------------------------------------
def test_checkpoint_carries_full_block_snapshot():
    """批5 契约加法:checkpoint 帧带 turn 开始的完整块表快照(前端建表用)。"""
    prov = FakeProvider([[tok("好的"), done("end")]])
    events = _run(prov)
    cp = events[0]
    assert cp["type"] == "checkpoint"
    assert cp["shell_open"] == "<section>"
    assert cp["shell_close"] == "</section>"
    assert cp["order"] == ["b1", "b2"]
    assert cp["blocks"] == [
        {"id": "b1", "kind": "text", "html": "<p>第一段正文</p>"},
        {"id": "b2", "kind": "text", "html": "<p>第二段正文</p>"},
    ]


def test_turn_done_carries_final_html():
    """批5 契约加法:turn_done 帧带 blocks_to_html 的最终全文(前端权威锚点)。"""
    # 无修改:html == 原文
    prov = FakeProvider([[tok("不用改"), done("end")]])
    events = _run(prov)
    assert events[-1]["type"] == "turn_done"
    assert events[-1]["html"] == _HTML

    # 有修改:html 反映 replace_block 后的最终拼接
    new_html = "<p>改好的第一段</p>"
    prov2 = FakeProvider([
        [call("c1", "replace_block", {"block_id": "b1", "html": new_html}),
         done("tool_calls")],
        [tok("改好了"), done("end")],
    ])
    events2 = _run(prov2, article_id="art2")
    last = events2[-1]
    assert last["type"] == "turn_done"
    assert last["html"] == "<section><p>改好的第一段</p><p>第二段正文</p></section>"


def test_checkpoint_first_frame_and_persisted():
    prov = FakeProvider([[tok("好的"), done("end")]])
    events = _run(prov)
    assert events[0]["type"] == "checkpoint"
    assert events[0]["rev_id"].startswith("rev_")
    revs = revisions_store.list_revisions("art1")
    assert len(revs) == 1
    assert revs[0]["reason"] == "chat_turn"
    assert revisions_store.get_revision("art1", events[0]["rev_id"])["html"] == _HTML


def test_no_provider_yields_error_without_checkpoint():
    prov = FakeProvider([], available=False)
    events = _run(prov)
    assert _types(events) == ["error"]
    assert events[0]["code"] == "no_provider"
    assert revisions_store.list_revisions("art1") == []


# --- 正常收束 ------------------------------------------------------------------
def test_plain_answer_streams_tokens_then_turn_done():
    prov = FakeProvider([[tok("不用"), tok("改。"), done("end")]])
    events = _run(prov)
    assert _types(events) == ["checkpoint", "chat_token", "chat_token", "turn_done"]
    last = events[-1]
    assert last["changed_block_ids"] == []
    assert last["summary"] == "不用改。"


def test_system_prompt_passed_to_provider():
    prov = FakeProvider([[done("end")]])
    _run(prov)
    system = prov.calls[0]["system"]
    assert "禁止照抄" in system
    assert "read_article" in system


# --- 工具循环 ------------------------------------------------------------------
def test_read_tool_roundtrip_feeds_result_back():
    prov = FakeProvider([
        [call("c1", "read_article", {}), done("tool_calls")],
        [tok("已读完。"), done("end")],
    ])
    events = _run(prov)
    assert _types(events) == [
        "checkpoint", "tool_call", "tool_result", "chat_token", "turn_done",
    ]
    tc = events[1]
    assert tc["name"] == "read_article" and tc["id"] == "c1"
    tr = events[2]
    assert tr["ok"] is True and tr["name"] == "read_article"
    assert tr["summary"]["stats"]["block_count"] == 2
    # 第二轮 messages 含 assistant(tool_calls) + tool 返回,arguments 是 JSON 串
    msgs2 = prov.calls[1]["messages"]
    assistant = next(m for m in msgs2 if m["role"] == "assistant")
    assert isinstance(assistant["tool_calls"][0]["function"]["arguments"], str)
    tool_msg = next(m for m in msgs2 if m["role"] == "tool")
    assert tool_msg["tool_call_id"] == "c1"
    assert "blocks" in json.loads(tool_msg["content"])


def test_read_tool_does_not_emit_block_update():
    prov = FakeProvider([
        [call("c1", "read_blocks", {"ids": ["b1"]}), done("tool_calls")],
        [done("end")],
    ])
    events = _run(prov)
    assert "block_update" not in _types(events)


def test_full_html_not_in_tool_result_frame():
    long_html = "<section><p>" + "很长的正文" * 200 + "</p></section>"
    prov = FakeProvider([
        [call("c1", "read_blocks", {"ids": ["b1"]}), done("tool_calls")],
        [done("end")],
    ])
    events = _run(prov, html=long_html)
    tr = next(e for e in events if e["type"] == "tool_result")
    assert len(json.dumps(tr["summary"], ensure_ascii=False)) < 2000
    # 但回给 LLM 的 tool 消息里是完整 html
    tool_msg = next(m for m in prov.calls[1]["messages"] if m["role"] == "tool")
    assert "很长的正文" * 200 in tool_msg["content"]


def test_write_tool_emits_block_update_increment():
    new_html = '<section style="color:#333333;">改好的第一段</section>'
    prov = FakeProvider([
        [call("c1", "replace_block", {"block_id": "b1", "html": new_html}),
         done("tool_calls")],
        [tok("改好了"), done("end")],
    ])
    events = _run(prov)
    updates = [e for e in events if e["type"] == "block_update"]
    assert len(updates) == 1
    up = updates[0]
    assert [b["id"] for b in up["changed_blocks"]] == ["b1"]
    assert "改好的第一段" in up["changed_blocks"][0]["html"]
    assert up["deleted_ids"] == []
    assert up["order"] == ["b1", "b2"]
    assert events[-1]["type"] == "turn_done"
    assert events[-1]["changed_block_ids"] == ["b1"]


def test_delete_emits_deleted_ids_and_order():
    prov = FakeProvider([
        [call("c1", "edit_structure", {"op": "delete", "block_id": "b1"}),
         done("tool_calls")],
        [done("end")],
    ])
    events = _run(prov)
    up = next(e for e in events if e["type"] == "block_update")
    assert up["deleted_ids"] == ["b1"]
    assert up["order"] == ["b2"]
    assert up["changed_blocks"] == []


def test_set_design_tokens_included_in_block_update():
    prov = FakeProvider([
        [call("c1", "set_design_tokens", {"primary_color": "#b45309"}),
         done("tool_calls")],
        [done("end")],
    ])
    events = _run(prov)
    up = next(e for e in events if e["type"] == "block_update")
    assert up["design_tokens"]["primary_color"] == "#b45309"


def test_failed_tool_marks_not_ok_and_no_update():
    prov = FakeProvider([
        [call("c1", "read_blocks", {"ids": ["b99"]}), done("tool_calls")],
        [done("end")],
    ])
    events = _run(prov)
    tr = next(e for e in events if e["type"] == "tool_result")
    assert tr["ok"] is False
    assert "block_update" not in _types(events)


# --- 终止条件 ------------------------------------------------------------------
def test_duplicate_call_rejected_then_third_time_terminates():
    dup = {"ids": ["b1"]}
    prov = FakeProvider([
        [call("c1", "read_blocks", dup), done("tool_calls")],
        [call("c2", "read_blocks", dup), done("tool_calls")],
        [call("c3", "read_blocks", dup), done("tool_calls")],
    ])
    events = _run(prov)
    # 第二次:注入「重复调用被拒」工具结果,不终止
    results = [e for e in events if e["type"] == "tool_result"]
    assert len(results) == 2
    assert results[1]["ok"] is False
    assert "重复调用" in json.dumps(results[1]["summary"], ensure_ascii=False)
    rejected_msg = next(
        m for m in prov.calls[2]["messages"]
        if m["role"] == "tool" and "重复调用" in m["content"]
    )
    assert rejected_msg["tool_call_id"] == "c2"
    # 第三次:终止 turn,error 帧收尾
    assert events[-1]["type"] == "error"
    assert prov.script == []  # 恰好消耗三轮


def test_write_success_resets_read_tool_signatures():
    """项2:写工具成功后重置读工具签名——改完复读同参数是正当验证,不触发熔断警告。"""
    read_args = {"ids": ["b1"]}
    prov = FakeProvider([
        [call("c1", "read_blocks", read_args), done("tool_calls")],
        [call("c2", "replace_block",
              {"block_id": "b1", "html": "<p>改好的第一段</p>"}),
         done("tool_calls")],
        [call("c3", "read_blocks", read_args), done("tool_calls")],
        [tok("验证完毕"), done("end")],
    ])
    events = _run(prov)
    results = [e for e in events if e["type"] == "tool_result"]
    assert len(results) == 3
    assert all(r["ok"] for r in results)
    assert not any(
        "重复调用" in json.dumps(r["summary"], ensure_ascii=False) for r in results
    )
    assert events[-1]["type"] == "turn_done"


def test_same_signature_triple_call_still_terminates():
    """项2:同一签名三连调仍熔断终止(警告一次后再犯即终止,行为不回退)。"""
    dup = {"ids": ["b1"]}
    prov = FakeProvider([
        [call("c1", "read_blocks", dup), done("tool_calls")],
        [call("c2", "read_blocks", dup), done("tool_calls")],
        [call("c3", "read_blocks", dup), done("tool_calls")],
    ])
    events = _run(prov)
    assert events[-1]["type"] == "error"
    assert "熔断" in events[-1]["message"]


def test_two_distinct_signatures_each_warn_once_without_termination():
    """项2:fuse_warned 按签名记账——两个不同签名各重复一次,各警告一次,不误终止。"""
    a1 = {"ids": ["b1"]}
    a2 = {"ids": ["b2"]}
    prov = FakeProvider([
        [call("c1", "read_blocks", a1), done("tool_calls")],
        [call("c2", "read_blocks", a2), done("tool_calls")],
        [call("c3", "read_blocks", a1), done("tool_calls")],
        [call("c4", "read_blocks", a2), done("tool_calls")],
        [tok("好"), done("end")],
    ])
    events = _run(prov)
    rejected = [
        e for e in events
        if e["type"] == "tool_result"
        and "重复调用" in json.dumps(e["summary"], ensure_ascii=False)
    ]
    assert len(rejected) == 2
    assert events[-1]["type"] == "turn_done"


def test_tool_call_limit_terminates_with_error():
    # 工作预算只数写工具:用 replace_block(变 html 避熔断)压满 MAX+1 触发上限。
    # 读工具不占预算(见 test_agent_turn.test_read_tools_excluded_from_work_budget)。
    script = [
        [call(f"c{i}", "replace_block", {"block_id": "b1", "html": f"<section>v{i}</section>"}),
         done("tool_calls")]
        for i in range(MAX_TOOL_CALLS_PER_TURN + 1)
    ]
    prov = FakeProvider(script)
    events = _run(prov)
    assert events[-1]["type"] == "error"
    assert "上限" in events[-1]["message"]
    calls = [e for e in events if e["type"] == "tool_call"]
    assert len(calls) == MAX_TOOL_CALLS_PER_TURN


def test_tool_calls_stop_without_calls_is_defended():
    prov = FakeProvider([[tok("我要调工具"), done("tool_calls")]])
    events = _run(prov)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "stream_error"


def test_length_stop_yields_error():
    prov = FakeProvider([[tok("太长"), done("length")]])
    events = _run(prov)
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "validate_failed"


def test_llm_error_becomes_error_frame_checkpoint_kept():
    class BoomProvider(FakeProvider):
        def stream_with_tools(self, system, messages, tools):
            yield tok("开")
            raise LLMTimeout("AI 生成超时")

    prov = BoomProvider([])
    events = _run(prov)
    assert events[0]["type"] == "checkpoint"
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "llm_timeout"
    assert len(revisions_store.list_revisions("art1")) == 1


# --- T0 system prompt ---------------------------------------------------------
def test_build_chat_system_prompt_contains_t0_essentials():
    prompt = build_chat_system_prompt()
    # 必死清单
    for kw in ("<style>", "JavaScript", "iframe", "mmbiz", "mp.weixin.qq.com"):
        assert kw in prompt, kw
    assert "id" in prompt
    # 能力词表指引 + 设计原则
    assert "list_capabilities" in prompt
    assert "set_design_tokens" in prompt
    # 旧 5 套版式:灵感参考、禁止照抄
    assert "禁止照抄" in prompt
    for kw in ("literary", "minimal", "vibrant", "magazine"):
        assert kw in prompt, kw
    # 工作纪律
    assert "read_article" in prompt
    assert "fix_hint" in prompt
    # 对话文案纪律(项1):对话正文纯中文口语,禁 HTML 标签/markdown 记号
    assert "markdown" in prompt
    assert "口语" in prompt
