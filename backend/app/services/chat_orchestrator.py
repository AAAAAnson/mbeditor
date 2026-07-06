# backend/app/services/chat_orchestrator.py
"""/agent/chat 的核心编排:agent 工具循环(批4,spec §3)。

``run_chat_turn(provider, article_id, html, messages)`` 跑一个完整 turn,
yield 事件 dict(序列化成 SSE 帧由 API 层做,见 sse_events.chat_frame):

- ``checkpoint``   {rev_id, shell_open, shell_close, order, blocks}
                    — turn 开始的全文快照(批5 加法:附完整块表,前端据此
                    建表做高亮/增量重建;内容即客户端刚 POST 的 html 切块);
- ``chat_token``   {text}                         — assistant 流式正文;
- ``tool_call``    {id, name, arguments}          — 模型发起一次工具调用;
- ``tool_result``  {id, name, ok, summary}        — 工具结果摘要(完整 html
                    不进帧,大字符串截断;完整 payload 只回给 LLM);
- ``block_update`` {changed_blocks, deleted_ids, order[, design_tokens]}
                    — 文档增量(前端持块表重建,不传全文);
- ``turn_done``    {changed_block_ids, summary, html} — 正常收束(批5 加法:
                    html 是 blocks_to_html 的最终全文,前端正确性锚点——块表
                    只用于高亮/汇总,不再承担重建全文);
- ``error``        {code, message}                — 异常终止(中文,复用
                    article_author.map_llm_error 的错误映射;已产生的
                    checkpoint 仍有效)。

终止条件(spec §3 DeepSeek 约束):stop_reason="end" 正常收束;单 turn 写工具
预算 MAX_TOOL_CALLS_PER_TURN(18,读工具不占);同工具同参数第二次触发熔断(注入
「重复调用被拒」工具结果),再犯即终止;stop_reason="tool_calls" 但零
ToolCall 视同异常终止(批1 已知缺陷防御,绝不挂死)。

纯编排、provider 注入可测;不记录 api_key/prompt/正文日志。
"""
from __future__ import annotations

import json
import logging
from typing import Iterable, Iterator

from app.services import revisions_store
from app.services.agent_tools import TOOL_SPECS, run_tool
from app.services.article_author import map_llm_error
from app.services.block_doc import BlockDoc, blocks_to_html, html_to_blocks
from app.services.chat_prompt import build_chat_system_prompt
from app.services.llm.base import LLMProvider, ToolCall
from app.services.llm.errors import LLMError

logger = logging.getLogger(__name__)

# 单 turn 的「写工具」预算(spec §3 约束 4;读工具不占,见 run_agent_turn)。
# 12→18(2026-07-05):读工具不计入后,12 个纯写操作对整篇换调子/改版式偏紧
# (克制高级重排要逐块改 13+ 块),NAS 真 DeepSeek QA 实证会误触上限;放宽到 18
# 让整篇重排一轮完成,runaway 兜底随之 18*3=54 仍守「只读不写」死循环。
MAX_TOOL_CALLS_PER_TURN = 18

# tool_result 帧里字符串值的截断长度(完整 html 不进帧)。
_SUMMARY_STR_LIMIT = 120

# 读工具名单:写工具成功(文档变更)后重置其熔断签名——改完再用同参数复读
# 是正当的验证动作,不算「盲目重试」。
_READ_TOOLS = frozenset({"read_article", "read_blocks", "list_capabilities"})


def _truncate_values(value):
    """递归截断 payload 里的长字符串(只影响帧摘要,不影响回给 LLM 的原件)。"""
    if isinstance(value, str):
        if len(value) > _SUMMARY_STR_LIMIT:
            return value[: _SUMMARY_STR_LIMIT - 1] + "…"
        return value
    if isinstance(value, list):
        return [_truncate_values(v) for v in value]
    if isinstance(value, dict):
        return {k: _truncate_values(v) for k, v in value.items()}
    return value


def _diff_docs(old: BlockDoc, new: BlockDoc) -> dict | None:
    """两版文档 -> block_update 增量。无任何变化返回 None。"""
    old_by_id = {b.id: b for b in old.blocks}
    new_ids = {b.id for b in new.blocks}
    changed = [
        {"id": b.id, "kind": b.kind, "html": b.html}
        for b in new.blocks
        if b.id not in old_by_id
        or old_by_id[b.id].html != b.html
        or old_by_id[b.id].kind != b.kind
    ]
    deleted = [b.id for b in old.blocks if b.id not in new_ids]
    tokens_changed = new.design_tokens != old.design_tokens
    if not changed and not deleted and not tokens_changed:
        return None
    update: dict = {
        "type": "block_update",
        "changed_blocks": changed,
        "deleted_ids": deleted,
        "order": [b.id for b in new.blocks],
    }
    if tokens_changed:
        update["design_tokens"] = dict(new.design_tokens)
    return update


def _call_signature(tc: ToolCall) -> tuple[str, str]:
    """熔断指纹:工具名 + 参数的规范化 JSON(键序稳定)。"""
    return tc.name, json.dumps(tc.arguments, sort_keys=True, ensure_ascii=False)


# 熔断注入给 LLM 的「重复调用被拒」工具结果(spec §3 约束 4)。
_DUPLICATE_REJECTION = {
    "error": "重复调用被拒:你刚刚已用完全相同的参数调用过该工具,盲目重试不会得到不同结果",
    "fix_hint": "换一种参数或换一个工具;若任务已完成,请直接用文字总结收束本轮",
}


def run_agent_turn(
    provider: LLMProvider,
    article_id: str,
    html: str,
    messages: Iterable[dict],
    *,
    system: str,
    tools: list,
    reason: str = "agent_turn",
    max_tool_calls: int = MAX_TOOL_CALLS_PER_TURN,
) -> Iterator[dict]:
    """形态无关内核:跑一个 agent turn(快照 -> 工具循环 -> 收束)。

    与 ``run_chat_turn`` 产帧序列完全同构;system/tools/reason 参数化以便
    三入口(chat/rewrite/compose)复用同一编排(spec §3)。yield 事件 dict。
    """
    if not provider.is_available():
        yield {"type": "error", "code": "no_provider",
               "message": "还没配置模型 key,填一个就能开始"}
        return

    # a. turn 开始:切块 + 落快照(checkpoint 先行,后续任何失败都可回滚)。
    doc = html_to_blocks(html)
    rev_id = revisions_store.add_revision(article_id, html, reason=reason)
    yield {
        "type": "checkpoint",
        "rev_id": rev_id,
        # 批5 加法:完整块表快照(前端建表;内容=客户端刚 POST 的 html 切块)。
        "shell_open": doc.shell_open,
        "shell_close": doc.shell_close,
        "order": [b.id for b in doc.blocks],
        "blocks": [{"id": b.id, "kind": b.kind, "html": b.html} for b in doc.blocks],
    }

    convo: list[dict] = [dict(m) for m in messages]
    # 工作预算只数「改文档」的工具:read_article/read_blocks/list_capabilities 是
    # 无副作用的探查,不占预算——否则换调子/整体大改「先读全文再逐块改」的正常
    # 流程会被读工具吃掉预算而误触上限(2026-07-05 NAS 真 DeepSeek QA 实证)。
    # total_calls 仍统计所有调用,作「反复读却不落笔」的 runaway 兜底(防读循环)。
    work_calls = 0
    total_calls = 0
    runaway_ceiling = max_tool_calls * 3
    seen_signatures: set[tuple[str, str]] = set()
    # 按签名记账:同一签名第二次出现警告一次,同一签名第三次出现才熔断终止。
    fuse_warned: set[tuple[str, str]] = set()
    changed_block_ids: list[str] = []  # 有序去重

    def note_changed(ids: Iterable[str]) -> None:
        for bid in ids:
            if bid not in changed_block_ids:
                changed_block_ids.append(bid)

    # b. agent 循环。
    try:
        while True:
            text_parts: list[str] = []
            round_calls: list[ToolCall] = []
            stop_reason = ""
            for ev in provider.stream_with_tools(system, convo, tools):
                if ev.kind == "token":
                    if ev.text:
                        text_parts.append(ev.text)
                        yield {"type": "chat_token", "text": ev.text}
                elif ev.kind == "tool_call" and ev.tool_call is not None:
                    round_calls.append(ev.tool_call)
                elif ev.kind == "done":
                    stop_reason = ev.stop_reason
            text = "".join(text_parts)

            if not round_calls:
                if stop_reason == "tool_calls":
                    # 批1 已知缺陷防御:声称调工具却零 ToolCall,视同异常终止。
                    logger.warning("chat turn: stop=tool_calls but zero tool call")
                    yield {"type": "error", "code": "stream_error",
                           "message": "AI 声称要调用工具却没有给出调用,本轮已终止,请重试"}
                    return
                if stop_reason == "length":
                    yield {"type": "error", "code": "validate_failed",
                           "message": "AI 输出被截断,请把任务拆小或换个说法再试"}
                    return
                # c. 正常收束。html 是最终全文(批5 加法:前端正确性锚点,
                # 覆盖流中按块表增量重建的结果)。
                yield {"type": "turn_done",
                       "changed_block_ids": list(changed_block_ids),
                       "summary": text,
                       "html": blocks_to_html(doc)}
                return

            # 工具往返:assistant(tool_calls) 消息回填(openai 线格式)。
            convo.append({
                "role": "assistant",
                "content": text,
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.name,
                                  "arguments": json.dumps(tc.arguments, ensure_ascii=False)}}
                    for tc in round_calls
                ],
            })
            for tc in round_calls:
                total_calls += 1
                # runaway 兜底:总调用(含读)远超工作预算的 3 倍 → 判定卡死终止,
                # 防「只读不写」的死循环(读工具不占工作预算,故需独立总量闸)。
                if total_calls > runaway_ceiling:
                    logger.warning("chat turn: runaway tool loop (%d calls)", total_calls)
                    yield {"type": "error", "code": "stream_error",
                           "message": "AI 反复读取却迟迟没有落笔,已终止本轮;请把任务拆小分多轮进行"}
                    return
                if tc.name not in _READ_TOOLS:
                    work_calls += 1
                    if work_calls > max_tool_calls:
                        logger.warning("chat turn: tool call limit hit (%d)", max_tool_calls)
                        yield {"type": "error", "code": "stream_error",
                               "message": f"本轮工具调用超过上限({max_tool_calls} 次),已终止;请把任务拆小分多轮进行"}
                        return
                sig = _call_signature(tc)
                if sig in seen_signatures:
                    if sig in fuse_warned:
                        # 同一签名再犯即熔断终止(spec §3 约束 4)。
                        logger.warning("chat turn: duplicate tool call fuse tripped")
                        yield {"type": "error", "code": "stream_error",
                               "message": "AI 反复用相同参数调用同一工具,已熔断本轮;请换个说法再试"}
                        return
                    fuse_warned.add(sig)
                    yield {"type": "tool_call", "id": tc.id,
                           "name": tc.name, "arguments": tc.arguments}
                    yield {"type": "tool_result", "id": tc.id, "name": tc.name,
                           "ok": False, "summary": dict(_DUPLICATE_REJECTION)}
                    convo.append({"role": "tool", "tool_call_id": tc.id,
                                  "content": json.dumps(_DUPLICATE_REJECTION,
                                                        ensure_ascii=False)})
                    continue
                seen_signatures.add(sig)

                yield {"type": "tool_call", "id": tc.id,
                       "name": tc.name, "arguments": tc.arguments}
                outcome = run_tool(tc.name, doc, tc.arguments)
                payload = outcome.payload
                yield {"type": "tool_result", "id": tc.id, "name": tc.name,
                       "ok": "error" not in payload,
                       "summary": _truncate_values(payload)}
                if outcome.doc is not doc:
                    update = _diff_docs(doc, outcome.doc)
                    if update is not None:
                        note_changed(b["id"] for b in update["changed_blocks"])
                        yield update
                    doc = outcome.doc
                    # 写成功:重置读工具签名(改完复读是验证改动,非盲目重试)。
                    seen_signatures = {
                        s for s in seen_signatures if s[0] not in _READ_TOOLS
                    }
                    fuse_warned = {
                        s for s in fuse_warned if s[0] not in _READ_TOOLS
                    }
                convo.append({"role": "tool", "tool_call_id": tc.id,
                              "content": json.dumps(payload, ensure_ascii=False)})
    except LLMError as exc:
        code, message = map_llm_error(exc)
        logger.warning("chat turn LLM error: %s", exc.__class__.__name__)
        yield {"type": "error", "code": code, "message": message}


def run_chat_turn(
    provider: LLMProvider,
    article_id: str,
    html: str,
    messages: Iterable[dict],
    *,
    max_tool_calls: int = MAX_TOOL_CALLS_PER_TURN,
) -> Iterator[dict]:
    """/agent/chat 的对话 turn:形态无关内核 run_agent_turn 的薄封装。

    签名/产帧序列与旧实现逐字节等价——只是把 chat 形态的 system/tools/reason
    喂给统一内核(spec §3)。
    """
    return run_agent_turn(
        provider, article_id, html, messages,
        system=build_chat_system_prompt(),
        tools=TOOL_SPECS,
        reason="chat_turn",
        max_tool_calls=max_tool_calls,
    )
