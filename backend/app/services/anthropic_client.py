"""Anthropic / Claude SDK wrapper (P1-4).

A thin, testable layer over ``anthropic.Anthropic`` that:

  - Lazily initializes a single module-level client (env-only credentials;
    the key is read by the SDK from ``ANTHROPIC_API_KEY`` and never passed
    as a literal through our code or logs).
  - Exposes ``llm_is_available()`` so callers (the agent SVG author, the
    HTTP layer) can gate on whether a key is configured.
  - Provides ``call_structured(system, user, schema, *, client=None)`` which
    runs a structured-output (json_schema) request with adaptive thinking
    and a stable, cache-friendly system prefix.
  - Normalizes every ``anthropic.*`` failure mode into this module's own
    ``LLM*`` exception hierarchy so upstream callers never have to import
    ``anthropic`` or special-case its error classes.

Logging discipline: on failure we log ONLY the exception class name plus
``response._request_id`` (when available). We never log the system prompt,
the user prompt, the API key, or the raw response body.

API shape verified against the bundled claude-api skill (README §Structured
Outputs / §Extended Thinking / §Stop Reasons, 2026-06):
  - model id ``claude-opus-4-8`` (no date suffix); overridable via config.
  - ``thinking={"type": "adaptive"}`` (opus-4-8 rejects budget_tokens /
    temperature / top_p / top_k with a 400 — we send none of them).
  - structured output via ``output_config={"format": {"type":"json_schema",
    "schema": ...}}`` — the first text block is guaranteed valid JSON.
  - ``stop_reason == "refusal"`` carries ``stop_details`` (category /
    explanation).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

# Exact model id — no date suffix (claude-opus-4-8-2026xxxx does not exist).
# Configurable override via ANTHROPIC_MODEL.
MODEL_ID: str = settings.ANTHROPIC_MODEL or "claude-opus-4-8"

# Non-streaming response budget for the DSL JSON (small, well-bounded output).
_MAX_TOKENS = 8000
_MAX_RETRIES = 2


# ---------------------------------------------------------------------------
# Normalized error hierarchy — MOVED to app.services.llm.errors (P1 refactor).
# This module re-exports them so legacy imports
# (``from app.services.anthropic_client import LLMTimeout``) keep working and
# resolve to the SAME class objects used by the new llm/ provider layer.
# ---------------------------------------------------------------------------
from app.services.llm.errors import (  # noqa: E402,F401
    LLMConnectionError,
    LLMError,
    LLMQuotaExceeded,
    LLMRateLimited,
    LLMRefusal,
    LLMSchemaMismatch,
    LLMServerError,
    LLMTimeout,
    LLMTruncated,
    LLMUnavailable,
)


# ---------------------------------------------------------------------------
# Client lifecycle
# ---------------------------------------------------------------------------
_client: Optional["anthropic.Anthropic"] = None


def llm_is_available() -> bool:
    """True when an API key is configured (gate for the LLM path)."""
    return bool(settings.ANTHROPIC_API_KEY)


def get_client() -> Optional["anthropic.Anthropic"]:
    """Lazily build and cache a module-level client.

    Returns ``None`` (never raises) when no key is configured. The SDK reads
    ``ANTHROPIC_API_KEY`` from the environment itself — we do not pass the
    literal key through code.
    """
    global _client
    if not settings.ANTHROPIC_API_KEY:
        return None
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def _request_id(resp: Any) -> str | None:
    try:
        return getattr(resp, "_request_id", None)
    except Exception:  # pragma: no cover - defensive
        return None


# ---------------------------------------------------------------------------
# Structured output call
# ---------------------------------------------------------------------------
def call_structured(
    system: str,
    user: str,
    schema: dict,
    *,
    client: Optional["anthropic.Anthropic"] = None,
) -> dict:
    """Run a json_schema structured-output request and return the parsed dict.

    Args:
        system: stable system prefix (cached via cache_control).
        user: volatile user content (prompt + any retry feedback).
        schema: JSON Schema the output must conform to.
        client: optional injected client (tests pass a mock). Falls back to
            the lazily-initialized module client.

    Raises:
        One of the ``LLM*`` exceptions on any failure. Never raises a raw
        ``anthropic.*`` error.
    """
    client = client or get_client()
    if client is None:
        raise LLMUnavailable("LLM client not available")

    try:
        resp = client.with_options(
            timeout=settings.ANTHROPIC_TIMEOUT, max_retries=_MAX_RETRIES
        ).messages.create(
            model=MODEL_ID,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user}],
            output_config={
                "format": {"type": "json_schema", "schema": schema}
            },
        )
    except anthropic.APITimeoutError as e:
        logger.warning("LLM call timed out: %s", e.__class__.__name__)
        raise LLMTimeout("AI 生成超时") from e
    except anthropic.RateLimitError as e:
        logger.warning("LLM call rate limited: %s", e.__class__.__name__)
        raise LLMRateLimited("AI 接口限流") from e
    except anthropic.BadRequestError as e:
        logger.warning("LLM bad request: %s", e.__class__.__name__)
        raise LLMSchemaMismatch("AI 请求被拒（schema/400）") from e
    except anthropic.APIConnectionError as e:
        logger.warning("LLM connection error: %s", e.__class__.__name__)
        raise LLMConnectionError("AI 服务连接失败") from e
    except anthropic.AuthenticationError as e:
        # 401: invalid / expired key. Subclass of APIStatusError, so it MUST
        # be caught before the generic APIStatusError below — otherwise it
        # would masquerade as a schema rejection (status < 500 -> mismatch),
        # giving operators no signal that the key is the problem.
        logger.warning("LLM auth error: %s", e.__class__.__name__)
        raise LLMUnavailable("AI 服务未正确配置") from e
    except anthropic.APIStatusError as e:
        status = getattr(e, "status_code", None)
        logger.warning(
            "LLM status error: %s status=%s", e.__class__.__name__, status
        )
        if status == 402:
            raise LLMQuotaExceeded("余额不足") from e
        if status is not None and status >= 500:
            raise LLMServerError("AI 服务端错误") from e
        raise LLMSchemaMismatch("AI 请求被拒") from e

    # Refusal check.
    if getattr(resp, "stop_reason", None) == "refusal":
        details = getattr(resp, "stop_details", None)
        category = getattr(details, "category", None) if details else None
        logger.warning(
            "LLM refused: request_id=%s category=%s", _request_id(resp), category
        )
        raise LLMRefusal("AI 拒绝了该请求", category=category)

    # Any non-terminal stop (max_tokens, pause_turn, ...) means we did not
    # get a complete JSON document.
    if getattr(resp, "stop_reason", None) not in ("end_turn", "stop_sequence"):
        logger.warning(
            "LLM truncated: request_id=%s stop_reason=%s",
            _request_id(resp),
            getattr(resp, "stop_reason", None),
        )
        raise LLMTruncated("AI 输出被截断")

    # Extract the first text block and parse it.
    text = None
    for block in getattr(resp, "content", []) or []:
        if getattr(block, "type", None) == "text":
            text = block.text
            break
    if text is None:
        logger.warning(
            "LLM returned no text block: request_id=%s", _request_id(resp)
        )
        raise LLMSchemaMismatch("AI 未返回文本块")

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(
            "LLM output not valid JSON: request_id=%s", _request_id(resp)
        )
        raise LLMSchemaMismatch("AI 输出格式不符") from e

    if not isinstance(data, dict):
        logger.warning(
            "LLM output JSON is not an object: request_id=%s", _request_id(resp)
        )
        raise LLMSchemaMismatch("AI 输出不是 JSON 对象")

    return data
