"""Tests for article_author 五工序编排 + map_llm_error + tone 映射。

用 mock provider(StreamEvent 脚本)驱动,断言 SSE 帧序列。emit 收集成 list,
逐帧 json.loads 还原 type/字段。
"""
from __future__ import annotations

import json
from typing import Iterator

from app.services import article_author
from app.services.article_author import generate_article, map_llm_error
from app.services.llm.base import ModelSpec, StreamEvent
from app.services.llm.errors import (
    LLMQuotaExceeded, LLMRateLimited, LLMRefusal, LLMTimeout, LLMUnavailable,
)


# ---- helpers --------------------------------------------------------------

def _collect():
    """返回 (emit, parsed):emit 是 Callable[[str],None],parsed() 还原事件 list。"""
    raw: list[str] = []

    def emit(frame: str) -> None:
        raw.append(frame)

    def parsed() -> list[dict]:
        out = []
        for f in raw:
            assert f.startswith("data: ") and f.endswith("\n\n")
            out.append(json.loads(f[len("data: "):].strip()))
        return out

    return emit, parsed


class _MockProvider:
    """脚本化 provider:stream_text 吐预设 StreamEvent;is_available 可控。"""

    def __init__(self, spec, events, available=True, raise_exc=None):
        self.spec = spec
        self._events = events
        self._available = available
        self._raise = raise_exc

    def is_available(self) -> bool:
        return self._available

    def stream_text(self, system, messages, **kw) -> Iterator[StreamEvent]:
        if self._raise is not None:
            raise self._raise
        for ev in self._events:
            yield ev

    def call_text(self, system, user, **kw) -> str:  # unused here
        return ""

    def call_structured(self, system, user, schema, **kw) -> dict:  # unused here
        return {}


def _patch_provider(monkeypatch, provider):
    """把 build_provider/resolve_spec 替换成返回 mock。"""
    monkeypatch.setattr(
        article_author, "resolve_spec",
        lambda req=None: ModelSpec(provider="openai_compat", model="x", base_url="u", api_key="k"),
    )
    monkeypatch.setattr(article_author, "build_provider", lambda spec: provider)


# ---- map_llm_error --------------------------------------------------------

def test_map_llm_error_known_codes():
    assert map_llm_error(LLMUnavailable("x"))[0] == "no_provider"
    assert map_llm_error(LLMTimeout("x"))[0] == "llm_timeout"
    assert map_llm_error(LLMRateLimited("x"))[0] == "llm_rate_limit"
    code, msg = map_llm_error(LLMRefusal("x", category="moderation"))
    assert code == "llm_refusal"
    assert "moderation" in msg


def test_map_llm_error_quota_gives_recharge_message():
    # H4:余额不足(402)专项文案——指向充值,绝不落「格式不符/重试」引导;
    # code 复用既有闭集(不新增 AgentErrorCode,chat 帧契约零改)。
    code, msg = map_llm_error(LLMQuotaExceeded("x"))
    assert code == "stream_error"
    assert "余额不足" in msg
    assert "充值" in msg
    assert "格式不符" not in msg


def test_map_llm_error_unknown_defaults_to_stream_error():
    code, msg = map_llm_error(ValueError("boom"))
    assert code == "stream_error"
    assert msg


# ---- no_provider 短路 -----------------------------------------------------

def test_no_provider_emits_error_and_stops(monkeypatch):
    _patch_provider(monkeypatch, _MockProvider(None, [], available=False))
    emit, parsed = _collect()
    generate_article("意图", "生活同好", "温柔治愈", emit=emit)
    events = parsed()
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert events[0]["code"] == "no_provider"


# ---- happy path ----------------------------------------------------------

def _body_events(text: str) -> list[StreamEvent]:
    return [StreamEvent(kind="token", text=ch) for ch in text]


def test_happy_path_full_stage_sequence_and_done(monkeypatch):
    md = "# 海洋馆的两小时\n\n上周末带娃去海洋馆。\n\n第二段。"
    provider = _MockProvider(None, _body_events(md))
    _patch_provider(monkeypatch, provider)
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    emit, parsed = _collect()

    generate_article("带娃去海洋馆", "生活同好", "温柔治愈", emit=emit)
    events = parsed()
    types = [e["type"] for e in events]

    # 五工序各有 active+done;有 title;有 token;以 done 收尾。
    assert "title" in types
    assert types.count("token") == len(md)
    assert types[-1] == "done"
    stages = [(e["stage"], e["status"]) for e in events if e["type"] == "stage"]
    assert ("立意", "active") in stages and ("立意", "done") in stages
    assert ("行文", "active") in stages and ("行文", "done") in stages
    assert ("制版", "active") in stages and ("制版", "done") in stages
    assert ("自检", "active") in stages and ("自检", "done") in stages
    assert ("核验", "active") in stages and ("核验", "done") in stages

    done = events[-1]
    assert done["html"].startswith("<section")
    assert "上周末带娃去海洋馆。" in done["html"]
    assert done["markdown"] == md
    assert "issues" in done["report"]
    assert done["aigc"] is False


def test_title_emitted_before_any_token(monkeypatch):
    md = "# 标题行\n\n正文。"
    _patch_provider(monkeypatch, _MockProvider(None, _body_events(md)))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    emit, parsed = _collect()
    generate_article("x", "路人泛读", "干货利落", emit=emit)
    types = [e["type"] for e in parsed()]
    assert types.index("title") < types.index("token")


def test_provider_title_event_used_when_present(monkeypatch):
    events = [StreamEvent(kind="title", text="模型给的标题")] + _body_events("正文内容。")
    _patch_provider(monkeypatch, _MockProvider(None, events))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    emit, parsed = _collect()
    generate_article("x", "行业同行", "克制高级", emit=emit)
    titles = [e["text"] for e in parsed() if e["type"] == "title"]
    assert titles == ["模型给的标题"]  # 只发一次,用 provider 抽的


def test_aigc_label_applied_when_enabled(monkeypatch):
    _patch_provider(monkeypatch, _MockProvider(None, _body_events("# t\n\n正文。")))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", True)
    # aigc_label 读自己模块的 settings,需一并打开。
    monkeypatch.setattr(article_author.aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    emit, parsed = _collect()
    generate_article("x", "生活同好", "温柔治愈", emit=emit)
    done = parsed()[-1]
    assert done["type"] == "done"
    assert done["aigc"] is True
    assert "本文由 AI 辅助生成" in done["html"]


# ---- error / degrade paths ------------------------------------------------

def test_stream_timeout_emits_llm_timeout_and_stops(monkeypatch):
    provider = _MockProvider(None, [], raise_exc=LLMTimeout("slow"))
    _patch_provider(monkeypatch, provider)
    emit, parsed = _collect()
    generate_article("x", "生活同好", "温柔治愈", emit=emit)
    events = parsed()
    # 行文 active 之后立刻 error;无 done。
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "llm_timeout"
    assert not any(e["type"] == "done" for e in events)
    # 已点亮过「行文 active」(用户能看到卡在行文)。
    assert ("行文", "active") in [(e.get("stage"), e.get("status")) for e in events]


def test_stream_refusal_emits_llm_refusal(monkeypatch):
    provider = _MockProvider(None, [], raise_exc=LLMRefusal("no", category="moderation"))
    _patch_provider(monkeypatch, provider)
    emit, parsed = _collect()
    generate_article("x", "路人泛读", "俏皮带梗", emit=emit)
    last = parsed()[-1]
    assert last["type"] == "error"
    assert last["code"] == "llm_refusal"
    assert "moderation" in last["message"]


def test_safety_block_when_enabled_high_risk(monkeypatch):
    from app.services.content_safety import SafetyVerdict
    _patch_provider(monkeypatch, _MockProvider(None, _body_events("# t\n\n正文。")))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    # article_author 通过 content_safety.review 间接调用,patch 其引用的模块属性。
    monkeypatch.setattr(
        article_author.content_safety, "review",
        lambda text: SafetyVerdict(blocked=True, label="block", message="高风险占位"),
    )
    emit, parsed = _collect()
    generate_article("x", "生活同好", "温柔治愈", emit=emit)
    events = parsed()
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "safety_block"
    assert "高风险占位" in events[-1]["message"]
    assert not any(e["type"] == "done" for e in events)


def test_degrade_to_plain_when_template_output_has_issue(monkeypatch):
    # 强制 compose 产出带违禁标签的 HTML(模拟模板套版异常),验证降级到 compose_plain
    # 后仍出 done 且 html 安全(零 issue),不泄漏未过闸内容。
    bad_html = '<section><script>x()</script>正文不应泄漏</section>'
    monkeypatch.setattr(article_author.layout_composer, "compose",
                        lambda md, *, template_id: bad_html)
    _patch_provider(monkeypatch, _MockProvider(None, _body_events("# t\n\n安全正文。")))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    emit, parsed = _collect()
    generate_article("x", "行业同行", "克制高级", emit=emit)
    done = parsed()[-1]
    assert done["type"] == "done"
    assert "<script>" not in done["html"]   # 降级后无违禁标签
    assert done["report"]["issues"] == []   # 出稿一定过闸


def test_title_first_fallback_when_stream_has_no_newline(monkeypatch):
    # 极端:provider 纯 token 流且整篇无换行——title-first 的「流末兜底」分支应仍
    # 保证 title 在首个 token 前(从全文抽首句前 24 字),且所有 char 逐字 emit。
    body = "没有任何换行的一整行正文内容用于触发流末兜底分支"
    _patch_provider(monkeypatch, _MockProvider(None, _body_events(body)))
    monkeypatch.setattr(article_author.settings, "AIGC_LABEL_ENABLED", False)
    emit, parsed = _collect()
    generate_article("x", "路人泛读", "干货利落", emit=emit)
    events = parsed()
    types = [e["type"] for e in events]
    assert types.index("title") < types.index("token")   # 兜底也保证 title 先出
    assert types.count("token") == len(body)              # 所有 char 仍逐字 emit
    assert types[-1] == "done"
