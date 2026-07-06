"""LLM* 异常层级(从 anthropic_client 平移到 app.services.llm.errors)。

断言:层级关系、LLMRefusal.category 携带、八个具体类齐全。
"""
from __future__ import annotations

import pytest

from app.services.llm.errors import (
    LLMConnectionError,
    LLMError,
    LLMRateLimited,
    LLMRefusal,
    LLMSchemaMismatch,
    LLMServerError,
    LLMTimeout,
    LLMTruncated,
    LLMUnavailable,
)

_ALL_SUBCLASSES = (
    LLMUnavailable,
    LLMTimeout,
    LLMRateLimited,
    LLMRefusal,
    LLMTruncated,
    LLMSchemaMismatch,
    LLMServerError,
    LLMConnectionError,
)


@pytest.mark.parametrize("cls", _ALL_SUBCLASSES)
def test_every_llm_error_subclasses_base(cls):
    assert issubclass(cls, LLMError)
    assert issubclass(cls, Exception)


def test_refusal_carries_category():
    exc = LLMRefusal("拒绝", category="moderation")
    assert exc.category == "moderation"
    assert str(exc) == "拒绝"


def test_refusal_category_defaults_none():
    assert LLMRefusal("拒绝").category is None


def test_anthropic_client_reexports_same_classes():
    """anthropic_client 的 LLM* 必须 IS llm.errors 的同一类对象(转发垫片)。

    否则 agent_svg_prompt 用旧路径 except、article_author 用新路径 raise 会
    isinstance 不命中。
    """
    from app.services import anthropic_client as ac
    from app.services.llm import errors as e

    assert ac.LLMTimeout is e.LLMTimeout
    assert ac.LLMRefusal is e.LLMRefusal
    assert ac.LLMUnavailable is e.LLMUnavailable
    assert ac.LLMError is e.LLMError
