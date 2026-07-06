"""SSE 事件序列化:5 型(stage/title/token/done/error)。

每个构造器返回 ``data: <json>\\n\\n`` 的 str,可直接 yield 进 StreamingResponse。
字段与 frontend/src/types/agent.ts 的判别联合逐字对齐——改一边必须改另一边。
"""
from __future__ import annotations

import json
from typing import Any, Literal

# 与前端 AgentStageEvent.stage 五个中文工序名逐字一致。
StageName = Literal["立意", "行文", "制版", "自检", "核验"]
StageStatus = Literal["active", "done"]

# 错误码:与前端 AgentErrorCode、article_author.map_llm_error 三方对齐。
ErrorCode = Literal[
    "no_provider",
    "llm_timeout",
    "llm_rate_limit",
    "llm_refusal",
    "safety_block",
    "stream_error",
    "validate_failed",
]


def _frame(payload: dict[str, Any]) -> str:
    """打包成一条 SSE data 帧。紧凑 json + 中文不转义。"""
    return "data: " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n\n"


def stage_event(stage: StageName, status: StageStatus, desc: str = "") -> str:
    return _frame({"type": "stage", "stage": stage, "status": status, "desc": desc})


def title_event(text: str) -> str:
    return _frame({"type": "title", "text": text})


def token_event(text: str) -> str:
    return _frame({"type": "token", "text": text})


def done_event(html: str, markdown: str, report: dict[str, Any], aigc: bool) -> str:
    return _frame({
        "type": "done",
        "html": html,
        "markdown": markdown,
        "report": report,
        "aigc": aigc,
    })


def error_event(code: ErrorCode, message: str) -> str:
    return _frame({"type": "error", "code": code, "message": message})


def chat_frame(payload: dict[str, Any]) -> str:
    """/agent/chat 的事件 dict -> SSE 帧(批4)。

    事件类型与字段由 chat_orchestrator.run_chat_turn 产出并注释
    (chat_token/tool_call/tool_result/block_update/checkpoint/turn_done/error),
    与前端 agent chat 判别联合逐字对齐——改一边必须改另一边。error 事件的
    code 恒取自上方 ErrorCode 集合(经 map_llm_error 归一)。
    """
    return _frame(payload)


def rewrite_done_event(text: str, variants: list[str] | None = None) -> str:
    """局部改写终态帧(/agent/rewrite 的 block/digest/title 用)。

    text 是权威全文(token 帧只作流式显示);variants 仅 title scope 非空,
    恰位候选标题列表。article scope 不用本帧——它复用 done_event 全管线。
    """
    return _frame({"type": "rewrite_done", "text": text, "variants": list(variants or [])})
