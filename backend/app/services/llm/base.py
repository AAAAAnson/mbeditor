"""LLMProvider Protocol + 辅助类型(ModelSpec / StreamEvent)+ build_provider 工厂。

所有 provider(openai_compat / anthropic)实现同一个 Protocol。错误一律抛
app.services.llm.errors 的 LLM* 异常,调用方永不 import provider SDK。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Optional, Protocol, runtime_checkable

from app.services.llm.errors import LLMUnavailable


@dataclass(frozen=True)
class ModelSpec:
    """单次/单 provider 的运行参数。由 provider_store.resolve_spec() 构造。

    key 不进日志、不进 __repr__ 之外的任何序列化路径(frozen dataclass 的
    repr 会含 key —— 调用方禁止把 ModelSpec 整体 log)。
    """

    provider: str          # "openai_compat" | "anthropic"
    model: str             # 如 "deepseek-chat" / "claude-opus-4-8"
    base_url: str = ""     # openai_compat 必填;anthropic 留空走 SDK 默认
    api_key: str = ""      # BYOK 密钥;anthropic 也可留空走 env ANTHROPIC_API_KEY
    timeout: float = 60.0  # 流式正文比结构化更长,默认 60s
    max_tokens: int = 4096


@dataclass(frozen=True)
class StreamEvent:
    """stream_text 产出的最小流式单元。

    kind="token" -> text 是增量正文;kind="title" -> text 是抽到的标题(可选,
    provider 抽不到就不发,由 article_author 兜底从首行截)。
    """

    kind: str   # "token" | "title"
    text: str


@dataclass(frozen=True)
class ToolSpec:
    """一个可供模型调用的工具定义(provider 无关)。

    parameters 是 JSON Schema dict;openai_compat 直传 function.parameters,
    anthropic 转 input_schema。
    """

    name: str
    description: str
    parameters: dict


@dataclass(frozen=True)
class ToolCall:
    """模型发起的一次工具调用(参数已解析为 dict)。

    arguments 非法 JSON 由 provider 在解析时抛 LLMSchemaMismatch,
    调用方拿到的 ToolCall 恒为合法 dict。
    """

    id: str
    name: str
    arguments: dict


@dataclass(frozen=True)
class AgentLoopEvent:
    """stream_with_tools 产出的流式单元(agent 循环用)。

    - kind="token"     -> text 是增量正文;
    - kind="tool_call" -> tool_call 是一次完整(分片已拼好)的工具调用;
    - kind="done"      -> stop_reason 收束本轮:"tool_calls"(需执行工具后续跑)
                          / "end"(自然结束)/ "length"(截断)。
    """

    kind: str                            # "token" | "tool_call" | "done"
    text: str = ""
    tool_call: Optional[ToolCall] = None
    stop_reason: str = ""                # done 帧: "tool_calls" | "end" | "length"


@runtime_checkable
class LLMProvider(Protocol):
    """BYOK provider 抽象。实例持有 ModelSpec,方法不再单独传 key。"""

    spec: ModelSpec

    def is_available(self) -> bool:
        """密钥/配置齐全可调用则 True。article_author 据此 emit no_provider。"""
        ...

    def call_text(
        self,
        system: str,
        user: str,
        *,
        max_tokens: Optional[int] = None,
    ) -> str:
        """非流式纯文本(音色抽取、摘要等用)。失败抛 LLM*。"""
        ...

    def stream_text(
        self,
        system: str,
        messages: list[dict[str, str]],
    ) -> Iterator[StreamEvent]:
        """流式正文。messages 是 [{"role":"user"|"assistant","content":str}]。

        逐个 yield StreamEvent(kind="title" 至多一次且必在 token 前;之后全
        kind="token")。生成器内部把 SDK 流异常归一成 LLM*;调用方对
        Iterator 迭代时用 try/except 捕获 LLM* 即可。
        """
        ...

    def call_structured(
        self,
        system: str,
        user: str,
        schema: dict,
    ) -> dict:
        """结构化 JSON(DSL/音色 traits)。返回必为 dict。失败抛 LLM*。

        语义与现 anthropic_client.call_structured 一致:non-dict / 非法 JSON
        -> LLMSchemaMismatch;refusal -> LLMRefusal;截断 -> LLMTruncated。
        """
        ...

    def stream_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[ToolSpec],
    ) -> Iterator[AgentLoopEvent]:
        """Agent 循环流式调用(原生 function calling)。

        messages 用 openai 风格线格式表达工具往返:
        - {"role": "user"|"assistant", "content": str}
        - assistant 发起调用: {"role": "assistant", "content": str,
          "tool_calls": [{"id", "function": {"name", "arguments": str|dict}}]}
        - 工具返回: {"role": "tool", "tool_call_id": str, "content": str}
        各 provider 自行转换成自家线格式(openai_compat 原样直传,
        anthropic 转 tool_use / tool_result 块)。

        逐个 yield AgentLoopEvent;末尾必有一个 kind="done"。工具 arguments
        非法 JSON -> LLMSchemaMismatch;其余失败照旧归一 LLM*。
        """
        ...


def build_provider(spec: ModelSpec) -> LLMProvider:
    """工厂:据 spec.provider 实例化。未知 provider -> LLMUnavailable。

    延迟 import 两个具体 provider(避免 base <-> providers 循环 import),
    再 dispatch。
    """
    if spec.provider == "openai_compat":
        from app.services.llm.providers.openai_compat import OpenAICompatProvider

        return OpenAICompatProvider(spec)
    if spec.provider == "anthropic":
        from app.services.llm.providers.anthropic import AnthropicProvider

        return AnthropicProvider(spec)
    raise LLMUnavailable(f"未知的 provider: {spec.provider!r}")
