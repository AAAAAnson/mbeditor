"""Agent 对话式编辑端点(批4,spec §3):POST /agent/chat SSE。

线程 + Queue 桥接照 agent_generate 同款(run_chat_turn 是同步阻塞编排,放
后台线程跑,主生成器阻塞读队列 yield,实现真流式);HTTP 恒 200,请求级
校验失败与运行期错误都走流内 error 帧。/agent/write、/agent/rewrite 零改。
"""
from __future__ import annotations

import queue
import re
import threading
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.chat_orchestrator import run_chat_turn
from app.services.llm.base import build_provider
from app.services.llm.provider_store import LLMProviderConfig, resolve_spec
from app.services.sse_events import chat_frame, error_event

router = APIRouter(prefix="/agent", tags=["agent"])

# 与 revisions_store 的文章 id 口径一致(防路径穿越)。
_ARTICLE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# 线程桥哨兵(与 agent_generate._DONE 同语义)。
_DONE = object()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = ""


class AgentChatReq(BaseModel):
    article_id: str = Field(default="", description="文章 id(快照按此存)")
    html: str = Field(default="", description="当前整篇 HTML(会话真源)")
    messages: list[ChatMessage] = Field(default_factory=list, description="对话历史")
    provider: LLMProviderConfig | None = None


def _validate_chat(req: "AgentChatReq") -> str | None:
    """请求级校验。返回中文错误消息(validate_failed 帧),None 表示通过。"""
    aid = req.article_id.strip()
    if not aid or not _ARTICLE_ID_RE.match(aid):
        return "非法文章 id(只允许字母、数字、下划线、连字符)"
    if not any(m.content.strip() for m in req.messages if m.role == "user"):
        return "先输入想让 AI 做的修改"
    return None


def _run_chat(req: "AgentChatReq", q: "queue.Queue") -> None:
    """后台线程:run_chat_turn 的事件实时入队。LLM* 已在编排层转 error 事件,
    这里只防御真正意外异常 -> 兜底 stream_error 帧(消息不带内部细节)。"""
    try:
        provider = build_provider(resolve_spec(req.provider))
        events = run_chat_turn(
            provider,
            req.article_id.strip(),
            req.html,
            [m.model_dump() for m in req.messages],
        )
        for event in events:
            q.put(chat_frame(event))
    except Exception:
        q.put(error_event("stream_error", "AI 服务暂时不可用,请稍后再试"))
    finally:
        q.put(_DONE)


@router.post("/chat")
async def agent_chat(req: AgentChatReq) -> StreamingResponse:
    """SSE 流式对话编辑一个 turn。HTTP 恒 200,错误走流内 error 帧。"""
    invalid = _validate_chat(req)
    if invalid:
        def gen_invalid():
            yield error_event("validate_failed", invalid)

        return StreamingResponse(
            gen_invalid(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    q: "queue.Queue" = queue.Queue()
    worker = threading.Thread(target=_run_chat, args=(req, q), daemon=True)
    worker.start()

    def gen():
        while True:
            frame = q.get()
            if frame is _DONE:
                break
            yield frame

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
