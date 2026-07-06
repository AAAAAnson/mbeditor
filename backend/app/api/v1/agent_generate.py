"""Agent copilot generation endpoints.

Currently hosts the "生成交互 SVG 积木" intent. Always returns HTTP 200
(matching ``core.response.success(...)``) — failure is signaled via
``data.status`` in the body, so the editor UI can render a diff-style
error panel without juggling axios error handling.
"""
import queue
import threading
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.response import success
from app.services import anthropic_client, article_author
from app.services.agent_svg_prompt import generate_svg_block
from app.services.llm.provider_store import LLMProviderConfig
from app.services.sse_events import error_event

router = APIRouter(prefix="/agent", tags=["agent"])


class GenerateSvgReq(BaseModel):
    prompt: str = Field(default="", description="中文意图，如 10 题年终共鸣投票")


@router.post("/generate-svg")
async def generate_svg(req: GenerateSvgReq):
    # LLM path activates automatically once ANTHROPIC_API_KEY is set;
    # otherwise we fall back to the deterministic template stub. See
    # app.services.agent_svg_prompt for both contracts.
    llm_available = anthropic_client.llm_is_available()
    result = generate_svg_block(req.prompt, llm_available=llm_available)
    return success(result)


class AgentWriteReq(BaseModel):
    intent: str = Field(default="", description="一句话意图")
    audience: str = Field(default="", description="受众:生活同好/行业同行/路人泛读")
    tone: str = Field(default="", description="调子:温柔治愈/干货利落/俏皮带梗/克制高级")
    voice_sample: str = Field(default="", description="可选:贴的旧文全文")
    use_brand_voice: bool = True
    provider: LLMProviderConfig | None = None


# 线程桥哨兵:后台线程跑完(正常或异常)后放入队列,主生成器据此收尾。
_DONE = object()


def _run_generation(req: "AgentWriteReq", q: "queue.Queue") -> None:
    """后台线程:把 generate_article 的 emit 帧实时塞进队列。

    generate_article 自身已吞所有 LLM*(转 error_event),这里只防御真正
    意外异常 -> 兜底 stream_error 帧。结束/异常都放 _DONE 让主生成器停。
    """
    try:
        article_author.generate_article(
            req.intent, req.audience, req.tone,
            voice_sample=req.voice_sample,
            use_brand_voice=req.use_brand_voice,
            provider_override=req.provider,
            emit=q.put,
        )
    except Exception:
        q.put(error_event("stream_error", "AI 服务暂时不可用,请稍后再试"))
    finally:
        q.put(_DONE)


@router.post("/write")
async def agent_write(req: AgentWriteReq) -> StreamingResponse:
    """SSE 流式出整篇。HTTP 恒 200,状态/错误走流内 error 事件。

    用后台线程 + Queue 桥接:generate_article 是同步阻塞编排,放线程里跑,
    emit=q.put 把每帧实时入队;本生成器阻塞读队列并 yield,实现首字 <2s 真流式。
    """
    q: "queue.Queue" = queue.Queue()
    worker = threading.Thread(target=_run_generation, args=(req, q), daemon=True)
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


# ── AI 修改闭环(/agent/rewrite)────────────────────────────────────────────
#
# P2(2026-07-05)收编:article / block scope 已被前端弃用 —— 前端「整体换调子/
# 缩长度」「选中即改」改注入预设指令走 /agent/chat 的统一 agent 块级遍历(不再
# 以纯文本为母本重排,H1「换调子销毁图片」根治)。本端点的 article / block 分支
# @deprecated,仅保留兼容、行为零改;title / digest scope 仍在前端 AI 改稿菜单
# 使用,维持契约不动。


class AgentRewriteReq(BaseModel):
    scope: Literal["block", "title", "digest", "article"]
    selected_text: str = Field(default="", description="block 必填:选中块纯文本")
    instruction: str = Field(default="", description="改写指令(预设或自由输入)")
    title: str = Field(default="", description="文章标题(上下文)")
    article_text: str = Field(default="", description="全文纯文本;article 为重写母本")
    tone: str = Field(default="", description="仅 article 换调子:4 调子之一")
    provider: LLMProviderConfig | None = None


def _validate_rewrite(req: "AgentRewriteReq") -> str | None:
    """请求级校验。返回中文错误消息(validate_failed 帧),None 表示通过。"""
    if req.scope == "block" and not req.selected_text.strip():
        return "请先选中要改写的文字"
    if req.scope in ("article", "digest", "title") and not req.article_text.strip():
        return "文章内容为空,先写点内容再试"
    return None


def _run_rewrite(req: "AgentRewriteReq", q: "queue.Queue") -> None:
    """后台线程:rewrite_* 的 emit 帧实时入队。与 _run_generation 同款防御。"""
    try:
        if req.scope == "article":
            article_author.rewrite_article(
                article_text=req.article_text, instruction=req.instruction,
                tone=req.tone, provider_override=req.provider, emit=q.put,
            )
        else:
            article_author.rewrite_text(
                req.scope, selected_text=req.selected_text,
                instruction=req.instruction, title=req.title,
                article_text=req.article_text,
                provider_override=req.provider, emit=q.put,
            )
    except Exception:
        q.put(error_event("stream_error", "AI 服务暂时不可用,请稍后再试"))
    finally:
        q.put(_DONE)


@router.post("/rewrite")
async def agent_rewrite(req: AgentRewriteReq) -> StreamingResponse:
    """SSE 流式局部/整篇改写。HTTP 恒 200,错误走流内 error 帧(与 /write 同语义)。"""
    invalid = _validate_rewrite(req)
    if invalid:
        def gen_invalid():
            yield error_event("validate_failed", invalid)

        return StreamingResponse(
            gen_invalid(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    q: "queue.Queue" = queue.Queue()
    worker = threading.Thread(target=_run_rewrite, args=(req, q), daemon=True)
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
