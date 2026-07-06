"""Live smoke test for the real-LLM SVG author path (P1-4).

Gated behind ANTHROPIC_API_KEY — skipped by default so CI / offline runs
never touch the network. Set the key to enable a single real Claude call.

Run:
    cd backend
    ANTHROPIC_API_KEY=sk-ant-... python -m pytest tests/test_agent_svg_llm_live.py -v
"""
from __future__ import annotations

import os

import pytest

from app.services.agent_svg_prompt import generate_svg_block
from app.services.svg_validator import validate_html

pytestmark = pytest.mark.skipif(
    os.environ.get("ANTHROPIC_API_KEY") is None,
    reason="设置 ANTHROPIC_API_KEY 以启用 LLM live 冒烟",
)


def test_live_generate_svg_does_not_crash_and_is_valid():
    """真调一次 Claude：只断言「不崩 + 产物合法」，不断言具体内容。"""
    result = generate_svg_block("10 题年终共鸣投票", llm_available=True)
    assert result["status"] in {"ok", "failed"}
    if result["status"] == "ok":
        assert result["html"]
        assert validate_html(result["html"])["issues"] == []
    else:
        # A failed run must still leak no html.
        assert result["html"] == ""
