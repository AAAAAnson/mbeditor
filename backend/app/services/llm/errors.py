"""归一化 LLM 错误层级。

所有 provider 把各自 SDK / HTTP 的失败模式归一成这些类,上游(article_author /
agent_svg_prompt)永不 import provider SDK,也不 special-case 其错误类。

本模块由 anthropic_client.py 平移而来(P1 重构);anthropic_client.py 改为
``from app.services.llm.errors import *`` 转发垫片,旧 import 路径不破。
"""
from __future__ import annotations


class LLMError(Exception):
    """Base class for all normalized LLM failures."""


class LLMUnavailable(LLMError):
    """No API key configured / client could not be constructed."""


class LLMQuotaExceeded(LLMError):
    """Insufficient balance / quota exhausted (HTTP 402)."""


class LLMTimeout(LLMError):
    """Request timed out (SDK timeout / HTTP 408)."""


class LLMRateLimited(LLMError):
    """Rate limited (HTTP 429)."""


class LLMRefusal(LLMError):
    """Model refused for safety reasons (stop_reason == 'refusal' / moderation 400)."""

    def __init__(self, message: str, *, category: str | None = None) -> None:
        super().__init__(message)
        self.category = category


class LLMTruncated(LLMError):
    """Generation stopped before completion (e.g. max_tokens)."""


class LLMSchemaMismatch(LLMError):
    """Output was not valid JSON / a 400 BadRequest (schema-shaped failure)."""


class LLMServerError(LLMError):
    """Upstream 5xx."""


class LLMConnectionError(LLMError):
    """Network failure."""


__all__ = [
    "LLMError",
    "LLMUnavailable",
    "LLMQuotaExceeded",
    "LLMTimeout",
    "LLMRateLimited",
    "LLMRefusal",
    "LLMTruncated",
    "LLMSchemaMismatch",
    "LLMServerError",
    "LLMConnectionError",
]
