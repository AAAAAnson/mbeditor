"""可插拔 LLM Provider 层(BYOK)。

所有 provider(openai_compat / anthropic)实现同一个 LLMProvider Protocol;
失败一律抛 app.services.llm.errors 的 LLM* 异常,调用方永不 import provider SDK。
"""
from __future__ import annotations

from app.services.llm.base import (
    LLMProvider,
    ModelSpec,
    StreamEvent,
    build_provider,
)

__all__ = ["LLMProvider", "ModelSpec", "StreamEvent", "build_provider"]
