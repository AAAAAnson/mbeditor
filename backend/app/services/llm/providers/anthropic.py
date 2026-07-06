"""AnthropicProvider:复用现 anthropic_client.call_structured 的归一语义,
新增 is_available / call_text / stream_text。

- key 注入:anthropic.Anthropic(api_key=spec.api_key or None);None 时 SDK 读
  env ANTHROPIC_API_KEY(BYOK 优先,env 兜底,与旧 llm_is_available 一致)。
- call_structured:thinking=adaptive + output_config json_schema,平移不改语义。
- stream_text:client.messages.stream(...),逐 text_stream yield token(不主动抽 title)。
所有 anthropic.* 失败归一成 app.services.llm.errors 的 LLM*。
"""
from __future__ import annotations

import json
import logging
from typing import Any, Iterator, Optional

import anthropic

from app.core.config import settings
from app.services.llm.base import (
    AgentLoopEvent,
    LLMProvider,
    ModelSpec,
    StreamEvent,
    ToolCall,
    ToolSpec,
)
from app.services.llm.errors import (
    LLMConnectionError,
    LLMQuotaExceeded,
    LLMRateLimited,
    LLMRefusal,
    LLMSchemaMismatch,
    LLMServerError,
    LLMTimeout,
    LLMTruncated,
    LLMUnavailable,
)

logger = logging.getLogger(__name__)

_MAX_RETRIES = 2
_TERMINAL_STOPS = ("end_turn", "stop_sequence")

# anthropic stop_reason -> AgentLoopEvent.stop_reason(done 帧)。
_STOP_TO_AGENT = {
    "tool_use": "tool_calls",
    "end_turn": "end",
    "stop_sequence": "end",
    "max_tokens": "length",
}


def _to_anthropic_messages(messages: list[dict]) -> list[dict]:
    """openai 风格 messages(含工具往返)-> anthropic 线格式。

    - assistant 带 tool_calls -> content 块列表([text?] + tool_use…);
    - role:"tool" -> user 消息里的 tool_result 块;连续多条工具返回合并进
      同一条 user 消息(anthropic 要求 user/assistant 角色交替);
    - 普通 user/assistant 原样透传(content 保持 str)。
    """
    out: list[dict] = []
    for m in messages:
        role = m.get("role")
        if role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": m.get("tool_call_id", ""),
                "content": m.get("content", ""),
            }
            prev = out[-1] if out else None
            if (
                prev is not None
                and prev.get("role") == "user"
                and isinstance(prev.get("content"), list)
                and prev["content"]
                and prev["content"][-1].get("type") == "tool_result"
            ):
                prev["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
            continue
        if role == "assistant" and m.get("tool_calls"):
            blocks: list[dict] = []
            if m.get("content"):
                blocks.append({"type": "text", "text": m["content"]})
            for tc in m["tool_calls"]:
                fn = tc.get("function") or {}
                raw_args = fn.get("arguments", tc.get("arguments", {}))
                if isinstance(raw_args, str):
                    try:
                        raw_args = json.loads(raw_args)
                    except (json.JSONDecodeError, ValueError):
                        raw_args = {}
                if not isinstance(raw_args, dict):
                    raw_args = {}
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": tc.get("id", ""),
                        "name": fn.get("name") or tc.get("name", ""),
                        "input": raw_args,
                    }
                )
            out.append({"role": "assistant", "content": blocks})
            continue
        out.append({"role": role, "content": m.get("content", "")})
    return out


class AnthropicProvider:
    """Claude provider(BYOK,env 兜底)。"""

    def __init__(self, spec: ModelSpec) -> None:
        self.spec = spec
        self._client: Optional["anthropic.Anthropic"] = None

    # -- gate ----------------------------------------------------------------
    def is_available(self) -> bool:
        return bool(self.spec.api_key) or bool(settings.ANTHROPIC_API_KEY)

    def _get_client(self) -> "anthropic.Anthropic":
        if not self.is_available():
            raise LLMUnavailable("AI 服务未正确配置")
        if self._client is None:
            # api_key=None 时 SDK 读 env ANTHROPIC_API_KEY。
            self._client = anthropic.Anthropic(api_key=self.spec.api_key or None)
        return self._client

    def _model(self) -> str:
        return self.spec.model or settings.ANTHROPIC_MODEL or "claude-opus-4-8"

    @staticmethod
    def _request_id(resp: Any) -> str | None:
        try:
            return getattr(resp, "_request_id", None)
        except Exception:  # pragma: no cover - defensive
            return None

    # -- shared SDK error normalization -------------------------------------
    def _create(self, **kwargs: Any) -> Any:
        client = self._get_client()
        try:
            return client.with_options(
                timeout=self.spec.timeout, max_retries=_MAX_RETRIES
            ).messages.create(model=self._model(), **kwargs)
        except anthropic.APITimeoutError as e:
            logger.warning("anthropic timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except anthropic.RateLimitError as e:
            logger.warning("anthropic rate limited: %s", e.__class__.__name__)
            raise LLMRateLimited("AI 接口限流") from e
        except anthropic.BadRequestError as e:
            logger.warning("anthropic bad request: %s", e.__class__.__name__)
            raise LLMSchemaMismatch("AI 请求被拒（schema/400）") from e
        except anthropic.APIConnectionError as e:
            logger.warning("anthropic connection error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        except anthropic.AuthenticationError as e:
            logger.warning("anthropic auth error: %s", e.__class__.__name__)
            raise LLMUnavailable("AI 服务未正确配置") from e
        except anthropic.APIStatusError as e:
            status = getattr(e, "status_code", None)
            logger.warning("anthropic status error: status=%s", status)
            if status == 402:
                raise LLMQuotaExceeded("余额不足") from e
            if status is not None and status >= 500:
                raise LLMServerError("AI 服务端错误") from e
            raise LLMSchemaMismatch("AI 请求被拒") from e

    @staticmethod
    def _check_stops(resp: Any) -> None:
        """refusal -> LLMRefusal;非终态 stop -> LLMTruncated。"""
        if getattr(resp, "stop_reason", None) == "refusal":
            details = getattr(resp, "stop_details", None)
            category = getattr(details, "category", None) if details else None
            logger.warning("anthropic refused: category=%s", category)
            raise LLMRefusal("AI 拒绝了该请求", category=category)
        if getattr(resp, "stop_reason", None) not in _TERMINAL_STOPS:
            logger.warning(
                "anthropic truncated: stop_reason=%s",
                getattr(resp, "stop_reason", None),
            )
            raise LLMTruncated("AI 输出被截断")

    @staticmethod
    def _first_text(resp: Any) -> str:
        for block in getattr(resp, "content", []) or []:
            if getattr(block, "type", None) == "text":
                return block.text
        raise LLMSchemaMismatch("AI 未返回文本块")

    # -- structured (平移自 anthropic_client.call_structured) ----------------
    def call_structured(self, system: str, user: str, schema: dict) -> dict:
        resp = self._create(
            max_tokens=self.spec.max_tokens,
            thinking={"type": "adaptive"},
            system=[
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": schema}},
        )
        self._check_stops(resp)
        text = self._first_text(resp)
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("anthropic output not valid JSON")
            raise LLMSchemaMismatch("AI 输出格式不符") from e
        if not isinstance(data, dict):
            logger.warning("anthropic output JSON is not an object")
            raise LLMSchemaMismatch("AI 输出不是 JSON 对象")
        return data

    # -- non-stream text -----------------------------------------------------
    def call_text(
        self,
        system: str,
        user: str,
        *,
        max_tokens: Optional[int] = None,
    ) -> str:
        resp = self._create(
            max_tokens=max_tokens or self.spec.max_tokens,
            thinking={"type": "adaptive"},
            system=[{"type": "text", "text": system}],
            messages=[{"role": "user", "content": user}],
        )
        self._check_stops(resp)
        return self._first_text(resp)

    # -- stream --------------------------------------------------------------
    def stream_text(
        self,
        system: str,
        messages: list[dict[str, str]],
    ) -> Iterator[StreamEvent]:
        client = self._get_client()
        try:
            with client.with_options(
                timeout=self.spec.timeout
            ).messages.stream(
                model=self._model(),
                max_tokens=self.spec.max_tokens,
                system=[{"type": "text", "text": system}],
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        yield StreamEvent("token", text)
        except anthropic.APITimeoutError as e:
            logger.warning("anthropic stream timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except anthropic.RateLimitError as e:
            logger.warning("anthropic stream rate limited: %s", e.__class__.__name__)
            raise LLMRateLimited("AI 接口限流") from e
        except anthropic.APIConnectionError as e:
            logger.warning("anthropic stream connection error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e

    # -- stream with tools(agent 循环)---------------------------------------
    def stream_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[ToolSpec],
    ) -> Iterator[AgentLoopEvent]:
        """messages.stream 带 tools。逐原始事件解析:

        - text_delta -> token;
        - content_block(tool_use)的 input_json_delta 分片拼接,块收束时
          解析成 ToolCall(非法 JSON -> LLMSchemaMismatch);
        - message_delta.stop_reason 映射 done 帧(tool_use -> "tool_calls",
          end_turn -> "end",max_tokens -> "length")。
        """
        client = self._get_client()
        payload_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters}
            for t in tools
        ]
        current: Optional[dict] = None  # 进行中的 tool_use 块 {"id","name","parts"}
        stop_reason = ""
        try:
            with client.with_options(
                timeout=self.spec.timeout
            ).messages.stream(
                model=self._model(),
                max_tokens=self.spec.max_tokens,
                system=[{"type": "text", "text": system}],
                messages=_to_anthropic_messages(messages),
                tools=payload_tools,
            ) as stream:
                for event in stream:
                    etype = getattr(event, "type", "")
                    if etype == "content_block_start":
                        block = getattr(event, "content_block", None)
                        if getattr(block, "type", None) == "tool_use":
                            current = {
                                "id": getattr(block, "id", "") or "",
                                "name": getattr(block, "name", "") or "",
                                "parts": [],
                            }
                    elif etype == "content_block_delta":
                        delta = getattr(event, "delta", None)
                        dtype = getattr(delta, "type", "")
                        if dtype == "text_delta":
                            text = getattr(delta, "text", "") or ""
                            if text:
                                yield AgentLoopEvent(kind="token", text=text)
                        elif dtype == "input_json_delta" and current is not None:
                            current["parts"].append(getattr(delta, "partial_json", "") or "")
                    elif etype == "content_block_stop":
                        if current is not None:
                            yield AgentLoopEvent(
                                kind="tool_call",
                                tool_call=self._finalize_tool_use(current),
                            )
                            current = None
                    elif etype == "message_delta":
                        sr = getattr(getattr(event, "delta", None), "stop_reason", None)
                        if sr:
                            stop_reason = sr
        except anthropic.APITimeoutError as e:
            logger.warning("anthropic tools stream timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except anthropic.RateLimitError as e:
            logger.warning("anthropic tools stream rate limited: %s", e.__class__.__name__)
            raise LLMRateLimited("AI 接口限流") from e
        except anthropic.APIConnectionError as e:
            logger.warning("anthropic tools stream connection error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        except anthropic.AuthenticationError as e:
            logger.warning("anthropic tools stream auth error: %s", e.__class__.__name__)
            raise LLMUnavailable("AI 服务未正确配置") from e
        except anthropic.APIStatusError as e:
            # 批4 minor 清账:补 APIStatusError 归一(与 _create 的口径一致;
            # RateLimitError/AuthenticationError 子类已在上方分支截获)。
            status = getattr(e, "status_code", None)
            logger.warning("anthropic tools stream status error: status=%s", status)
            if status == 402:
                raise LLMQuotaExceeded("余额不足") from e
            if status is not None and status >= 500:
                raise LLMServerError("AI 服务端错误") from e
            raise LLMSchemaMismatch("AI 请求被拒") from e
        yield AgentLoopEvent(
            kind="done", stop_reason=_STOP_TO_AGENT.get(stop_reason, "end")
        )

    @staticmethod
    def _finalize_tool_use(current: dict) -> ToolCall:
        """input_json_delta 分片拼好 -> ToolCall。非法 JSON -> LLMSchemaMismatch。"""
        raw = "".join(current["parts"]) or "{}"
        try:
            args = json.loads(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("anthropic tool input not valid JSON")
            raise LLMSchemaMismatch("AI 工具参数格式不符") from e
        if not isinstance(args, dict):
            logger.warning("anthropic tool input not a JSON object")
            raise LLMSchemaMismatch("AI 工具参数不是 JSON 对象")
        return ToolCall(id=current["id"], name=current["name"], arguments=args)


# 静态契约自检:实现满足 LLMProvider Protocol(runtime_checkable)。
_: LLMProvider = AnthropicProvider(ModelSpec(provider="anthropic", model=""))
