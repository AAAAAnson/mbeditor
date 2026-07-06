"""OpenAICompatProvider:httpx 直连 OpenAI-兼容端点(DeepSeek/Qwen/GLM/Kimi…)。

不引入 openai SDK——用项目既有依赖 httpx。
- stream_text:``"stream": true``,逐行读 ``data: `` 帧,取 delta.content。
- call_structured:``response_format={"type":"json_object"}`` + jsonschema.validate 兜底。
- moderation 命中(HTTP 400 且 body code 含 moderation/content_filter)-> LLMRefusal(category="moderation")。
所有失败归一成 app.services.llm.errors 的 LLM*。日志只记类名/状态码,绝不记 key/prompt/正文。
"""
from __future__ import annotations

import json
import logging
from typing import Iterator, Optional

import httpx
import jsonschema

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
    LLMUnavailable,
)

logger = logging.getLogger(__name__)

# 400 body 里命中这些 code 子串 -> 判为内容审核拒答(而非普通 schema 400)。
_MODERATION_CODES = ("moderation", "content_filter")

# openai finish_reason -> AgentLoopEvent.stop_reason(done 帧)。
_FINISH_TO_STOP = {"tool_calls": "tool_calls", "stop": "end", "length": "length"}


def _try_json(text: str):
    """尝试解析 JSON;失败返回 None(纯函数,不抛异常)。"""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None


def _strip_code_fences(text: str) -> str:
    """整段被 markdown 代码围栏包住时剥掉围栏(``` / ```json)。"""
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _iter_brace_candidates(text: str):
    """扫出文本里所有顶层配平的 {…} 片段(考虑字符串内转义)。"""
    depth = 0
    start = -1
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    yield text[start : i + 1]
                    start = -1


def _collect_tool_calls(obj, known: set[str], out: list[ToolCall]) -> None:
    """递归收集候选 JSON 里的工具调用(只认 known 工具名)。"""
    if isinstance(obj, list):
        for item in obj:
            _collect_tool_calls(item, known, out)
        return
    if not isinstance(obj, dict):
        return
    if isinstance(obj.get("tool_calls"), list):
        _collect_tool_calls(obj["tool_calls"], known, out)
        return
    fn = obj.get("function")
    if isinstance(fn, dict):
        name, raw_args = fn.get("name"), fn.get("arguments")
    else:
        name, raw_args = obj.get("name"), obj.get("arguments")
    if not isinstance(name, str) or name not in known:
        return
    if raw_args is None:
        # 批4 minor 清账:要求 'arguments' 键存在——正文里的 {"name": …}
        # 普通 JSON 示例(无 arguments)不再被误判成工具调用。
        return
    if isinstance(raw_args, dict):
        args = raw_args
    elif isinstance(raw_args, str):
        parsed = _try_json(raw_args)
        if not isinstance(parsed, dict):
            return  # arguments 非法/非对象 -> 兜底路径静默跳过,不误执行
        args = parsed
    else:
        return
    cid = obj.get("id")
    out.append(ToolCall(id=cid if isinstance(cid, str) else "", name=name, arguments=args))


def extract_inline_tool_calls(
    text: str, known_tool_names: list[str] | tuple[str, ...] | set[str]
) -> list[ToolCall]:
    """从纯文本兜底提取 tool-call JSON(DeepSeek 已知缺陷:tool call 吐进 content)。

    认两种形状:{"name": …, "arguments": …}(arguments 可为 dict 或 JSON 串)
    与 openai 风格 {"tool_calls": [{"id", "function": {"name", "arguments"}}]}。
    只认 known_tool_names 里的工具名,避免误伤正文里的 JSON 示例;任何解析
    失败静默跳过(纯函数,不抛异常)。无原生 id 时合成 "inline_{序号}"。
    """
    known = set(known_tool_names)
    if not text or not known:
        return []
    stripped = _strip_code_fences(text)
    candidates: list = []
    whole = _try_json(stripped)
    if whole is not None:
        candidates.append(whole)
    else:
        for frag in _iter_brace_candidates(stripped):
            parsed = _try_json(frag)
            if parsed is not None:
                candidates.append(parsed)
    calls: list[ToolCall] = []
    for cand in candidates:
        _collect_tool_calls(cand, known, calls)
    return [
        ToolCall(id=tc.id or f"inline_{i}", name=tc.name, arguments=tc.arguments)
        for i, tc in enumerate(calls)
    ]


class OpenAICompatProvider:
    """OpenAI Chat Completions 兼容 provider(BYOK)。"""

    def __init__(self, spec: ModelSpec) -> None:
        self.spec = spec

    # -- gate ----------------------------------------------------------------
    def is_available(self) -> bool:
        s = self.spec
        return bool(s.api_key and s.base_url and s.model)

    # -- internals -----------------------------------------------------------
    def _url(self) -> str:
        return self.spec.base_url.rstrip("/") + "/chat/completions"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.spec.api_key}",
            "Content-Type": "application/json",
        }

    def _raise_for_status(self, status: int, body_text: str) -> None:
        """非 2xx -> 归一 LLM*。400 看 body 区分 moderation / schema。"""
        if status < 400:
            return
        if status == 408:
            raise LLMTimeout("AI 生成超时")
        if status == 429:
            raise LLMRateLimited("AI 接口限流")
        if status in (401, 403):
            raise LLMUnavailable("AI 服务未正确配置（鉴权失败）")
        if status == 402:
            # DeepSeek 等平台余额不足返回 402 —— 归一成配额类,
            # 绝不落 LLMSchemaMismatch(「格式不符」会诱导无效重试)。
            raise LLMQuotaExceeded("余额不足")
        if status >= 500:
            raise LLMServerError("AI 服务端错误")
        if status == 400:
            code = ""
            try:
                err = json.loads(body_text or "{}").get("error") or {}
                code = str(err.get("code") or err.get("type") or "")
            except (json.JSONDecodeError, ValueError, AttributeError):
                code = ""
            if any(m in code.lower() for m in _MODERATION_CODES):
                logger.warning("openai_compat moderation block: code=%s", code)
                raise LLMRefusal("AI 拒绝了该请求", category="moderation")
            logger.warning("openai_compat bad request: status=400")
            raise LLMSchemaMismatch("AI 请求被拒（schema/400）")
        logger.warning("openai_compat status error: status=%s", status)
        raise LLMSchemaMismatch("AI 请求被拒")

    # -- non-stream text -----------------------------------------------------
    def call_text(
        self,
        system: str,
        user: str,
        *,
        max_tokens: Optional[int] = None,
    ) -> str:
        if not self.is_available():
            raise LLMUnavailable("AI 服务未正确配置")
        payload = {
            "model": self.spec.model,
            "max_tokens": max_tokens or self.spec.max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        data = self._post_json(payload)
        return self._first_content(data)

    # -- structured ----------------------------------------------------------
    def call_structured(self, system: str, user: str, schema: dict) -> dict:
        if not self.is_available():
            raise LLMUnavailable("AI 服务未正确配置")
        payload = {
            "model": self.spec.model,
            "max_tokens": self.spec.max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        data = self._post_json(payload)
        text = self._first_content(data)
        try:
            parsed = json.loads(text)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("openai_compat output not valid JSON")
            raise LLMSchemaMismatch("AI 输出格式不符") from e
        if not isinstance(parsed, dict):
            logger.warning("openai_compat output JSON is not an object")
            raise LLMSchemaMismatch("AI 输出不是 JSON 对象")
        try:
            jsonschema.validate(parsed, schema)
        except jsonschema.ValidationError as e:
            logger.warning("openai_compat output failed schema validation")
            raise LLMSchemaMismatch("AI 输出不符合结构要求") from e
        return parsed

    def _post_json(self, payload: dict) -> dict:
        """单次 POST,归一错误,返回解析后的 JSON dict。"""
        try:
            with httpx.Client(timeout=self.spec.timeout) as client:
                resp = client.post(self._url(), headers=self._headers(), json=payload)
        except httpx.TimeoutException as e:
            logger.warning("openai_compat timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except httpx.ConnectError as e:
            logger.warning("openai_compat connect error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        except httpx.HTTPError as e:
            logger.warning("openai_compat http error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        self._raise_for_status(resp.status_code, resp.text)
        try:
            return resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("openai_compat response not JSON")
            raise LLMSchemaMismatch("AI 响应解析失败") from e

    @staticmethod
    def _first_content(data: dict) -> str:
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            logger.warning("openai_compat response missing choices/message")
            raise LLMSchemaMismatch("AI 未返回内容") from e

    # -- stream --------------------------------------------------------------
    def stream_text(
        self,
        system: str,
        messages: list[dict[str, str]],
    ) -> Iterator[StreamEvent]:
        if not self.is_available():
            raise LLMUnavailable("AI 服务未正确配置")
        payload = {
            "model": self.spec.model,
            "max_tokens": self.spec.max_tokens,
            "stream": True,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        try:
            with httpx.Client(timeout=self.spec.timeout) as client:
                with client.stream(
                    "POST", self._url(), headers=self._headers(), json=payload
                ) as resp:
                    if resp.status_code >= 400:
                        self._raise_for_status(resp.status_code, "")
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            break
                        piece = self._parse_delta(data_str)
                        if piece:
                            yield StreamEvent("token", piece)
        except httpx.TimeoutException as e:
            logger.warning("openai_compat stream timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except httpx.ConnectError as e:
            logger.warning("openai_compat stream connect error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e

    @staticmethod
    def _parse_delta(data_str: str) -> str:
        """从一条 SSE data 帧抽 delta.content;无内容返回空串。"""
        try:
            obj = json.loads(data_str)
            return obj["choices"][0]["delta"].get("content") or ""
        except (json.JSONDecodeError, ValueError, KeyError, IndexError, TypeError):
            return ""

    # -- stream with tools(agent 循环)---------------------------------------
    def stream_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[ToolSpec],
    ) -> Iterator[AgentLoopEvent]:
        """chat/completions 带 tools 流式。openai 风格 messages 原样直传。

        delta.tool_calls 按 index 分片拼 arguments;finish_reason 映射
        stop_reason;finish_reason=stop 但 content 疑含 tool-call JSON 时走
        extract_inline_tool_calls 兜底(DeepSeek 已知缺陷)。
        """
        if not self.is_available():
            raise LLMUnavailable("AI 服务未正确配置")
        payload = {
            "model": self.spec.model,
            "max_tokens": self.spec.max_tokens,
            "stream": True,
            "messages": [{"role": "system", "content": system}, *messages],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ],
        }
        content_parts: list[str] = []
        pending: dict[int, dict] = {}  # index -> {"id","name","args":[分片]}
        finish_reason = ""
        try:
            with httpx.Client(timeout=self.spec.timeout) as client:
                with client.stream(
                    "POST", self._url(), headers=self._headers(), json=payload
                ) as resp:
                    if resp.status_code >= 400:
                        self._raise_for_status(resp.status_code, "")
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            break
                        choice = self._parse_choice(data_str)
                        if choice is None:
                            continue
                        delta = choice.get("delta") or {}
                        piece = delta.get("content") or ""
                        if piece:
                            content_parts.append(piece)
                            yield AgentLoopEvent(kind="token", text=piece)
                        for frag in delta.get("tool_calls") or []:
                            idx = int(frag.get("index") or 0)
                            slot = pending.setdefault(idx, {"id": "", "name": "", "args": []})
                            if frag.get("id"):
                                slot["id"] = frag["id"]
                            fn = frag.get("function") or {}
                            if fn.get("name"):
                                slot["name"] = fn["name"]
                            if fn.get("arguments"):
                                slot["args"].append(fn["arguments"])
                        if choice.get("finish_reason"):
                            finish_reason = choice["finish_reason"]
        except httpx.TimeoutException as e:
            logger.warning("openai_compat tools stream timeout: %s", e.__class__.__name__)
            raise LLMTimeout("AI 生成超时") from e
        except httpx.ConnectError as e:
            logger.warning("openai_compat tools stream connect error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        except httpx.HTTPError as e:
            # 批4 minor 清账:其余传输层失败(协议错误/读断流等)统一归一,
            # 与 _post_json 的兜底口径一致。
            logger.warning("openai_compat tools stream http error: %s", e.__class__.__name__)
            raise LLMConnectionError("AI 服务连接失败") from e
        # 收尾:原生 tool_calls 优先;否则 finish=stop 走 content 兜底提取。
        calls = [self._finalize_tool_call(i, pending[i]) for i in sorted(pending)]
        if not calls and finish_reason == "stop":
            calls = extract_inline_tool_calls(
                "".join(content_parts), [t.name for t in tools]
            )
        if calls:
            for tc in calls:
                yield AgentLoopEvent(kind="tool_call", tool_call=tc)
            yield AgentLoopEvent(kind="done", stop_reason="tool_calls")
            return
        yield AgentLoopEvent(
            kind="done", stop_reason=_FINISH_TO_STOP.get(finish_reason, "end")
        )

    @staticmethod
    def _parse_choice(data_str: str) -> Optional[dict]:
        """从一条 SSE data 帧取 choices[0](含 delta / finish_reason)。"""
        try:
            obj = json.loads(data_str)
            choice = obj["choices"][0]
            return choice if isinstance(choice, dict) else None
        except (json.JSONDecodeError, ValueError, KeyError, IndexError, TypeError):
            return None

    @staticmethod
    def _finalize_tool_call(idx: int, slot: dict) -> ToolCall:
        """分片拼好的一次工具调用 -> ToolCall。arguments 非法 -> LLMSchemaMismatch。"""
        raw = "".join(slot["args"]) or "{}"
        try:
            args = json.loads(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("openai_compat tool arguments not valid JSON")
            raise LLMSchemaMismatch("AI 工具参数格式不符") from e
        if not isinstance(args, dict):
            logger.warning("openai_compat tool arguments not a JSON object")
            raise LLMSchemaMismatch("AI 工具参数不是 JSON 对象")
        return ToolCall(id=slot["id"] or f"call_{idx}", name=slot["name"], arguments=args)


# 静态契约自检:实现满足 LLMProvider Protocol(runtime_checkable)。
_: LLMProvider = OpenAICompatProvider(ModelSpec(provider="openai_compat", model=""))
