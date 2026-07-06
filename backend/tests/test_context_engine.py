# backend/tests/test_context_engine.py
"""context_engine 马鞍拼装 + token 估算测试。"""
from __future__ import annotations

import pytest

from app.services.context_engine import (
    SaddleInput,
    SaddlePrompt,
    build_saddle_prompt,
    estimate_tokens,
)
from app.services.prompt_templates.schema import FewShot


def test_estimate_tokens_counts_cjk_and_ascii_words():
    """中文逐字计 + ASCII 词按整词计(连字符/空格分词)。"""
    # 4 个中文字 + 2 个 ascii 词(deepseek, v1)
    assert estimate_tokens("你好世界 deepseek v1") == 4 + 2
    # 纯中文:逐字
    assert estimate_tokens("温柔治愈") == 4
    # 标点/空白不计
    assert estimate_tokens("，。！ ") == 0
    # 与 svg prompt 同口径:下划线词算一个
    assert estimate_tokens("draft_body_v1") == 1


def test_saddle_no_trim_keeps_all_humps_and_valley():
    """预算充足时:头尾驼峰进 system,谷底四段全进 user,dropped 为空。"""
    saddle = SaddleInput(
        head_rules=["硬约束A", "硬约束B"],
        tail_format=["格式X"],
        brand_traits="品牌音色: 温柔",
        few_shots=[FewShot(user="问", assistant="答")],
        user_material="用户素材",
        history="历史对话",
        token_budget=10_000,  # 远超内容,绝不裁
    )
    out = build_saddle_prompt(saddle)
    assert isinstance(out, SaddlePrompt)
    # system 含两条头驼峰 + 尾驼峰
    assert "硬约束A" in out.system and "硬约束B" in out.system
    assert "格式X" in out.system
    # 谷底四段全在 user
    assert "品牌音色: 温柔" in out.user
    assert "问" in out.user and "答" in out.user
    assert "用户素材" in out.user
    assert "历史对话" in out.user
    assert out.dropped == []


def test_saddle_trims_valley_in_fixed_order():
    """超预算:按 历史->素材->few_shots->品牌 顺序逐段砍,直到落入预算。"""
    # 每段都给足量中文,使全量远超预算;预算调到只够头尾驼峰 + 品牌一段。
    saddle = SaddleInput(
        head_rules=["硬约束必须保留"],
        tail_format=["格式必须保留"],
        brand_traits="品" * 50,          # 倒数第 4 砍(最后才砍)
        few_shots=[FewShot(user="示" * 50, assistant="例" * 50)],
        user_material="素" * 50,
        history="史" * 200,              # 最先砍
        token_budget=120,               # 只容得下头尾驼峰 + 品牌(~50) 量级
    )
    out = build_saddle_prompt(saddle)
    # 头尾驼峰永远在 system
    assert "硬约束必须保留" in out.system and "格式必须保留" in out.system
    # 历史最先被砍
    assert "history" in out.dropped
    # 砍序前缀:dropped 必须是 _VALLEY_ORDER 的前缀(不能跳着砍)
    from app.services.context_engine import _VALLEY_ORDER
    assert out.dropped == list(_VALLEY_ORDER[: len(out.dropped)])
    # 砍到落入预算后停手:品牌(最后才砍)应仍在
    assert "品" * 50 in out.user
    assert "brand_traits" not in out.dropped


def test_saddle_never_drops_humps_even_when_over_budget():
    """谷底全砍光仍超预算时:dropped 含全部谷底段,但 system(头尾)绝不被砍。"""
    saddle = SaddleInput(
        head_rules=["很长的硬约束" * 30],
        tail_format=["很长的尾格式" * 30],
        brand_traits="品" * 50,
        few_shots=[FewShot(user="示" * 50, assistant="例" * 50)],
        user_material="素" * 50,
        history="史" * 50,
        token_budget=1,  # 极端:连头尾都超,但头尾不可裁
    )
    out = build_saddle_prompt(saddle)
    # 四段谷底全被砍
    assert set(out.dropped) == {"history", "user_material", "few_shots", "brand_traits"}
    # 头尾驼峰仍在(永不裁,即便超预算)
    assert "很长的硬约束" in out.system and "很长的尾格式" in out.system
    # 谷底砍空后 user 只剩意图尾巴
    assert out.user.strip().endswith("请据以上信息开始写作。")


def test_estimate_tokens_matches_svg_prompt_word_count_idiom():
    """estimate_tokens 与 agent_svg_prompt 的字数口径一致(同一段文本同值),
    防止两端分词正则漂移导致马鞍预算与 svg 字数统计口径分裂。"""
    import re

    from app.services import agent_svg_prompt

    sample = "微信公众号 SVG draft_body_v1 温柔治愈 deepseek-chat 你好"
    # 复刻 system_prompt_word_count 的口径:中文逐字 + [A-Za-z0-9_]+ 词。
    chinese = len(re.findall(r"[一-鿿]", sample))
    ascii_words = len(re.findall(r"[A-Za-z0-9_]+", sample))
    assert estimate_tokens(sample) == chinese + ascii_words
    # 直接拿 svg prompt 模块的同口径函数侧证:对其 SYSTEM_PROMPT 二者相等。
    assert estimate_tokens(agent_svg_prompt.SYSTEM_PROMPT) == (
        agent_svg_prompt.system_prompt_word_count()
    )
