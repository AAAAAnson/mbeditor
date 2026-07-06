# backend/tests/test_prompt_templates.py
"""prompt_templates schema + builtin 注册表的加载/完备性测试。"""
from __future__ import annotations

import pytest

from app.services.prompt_templates import (
    FewShot,
    PromptTemplate,
    get_template,
    list_templates,
)


def test_few_shot_and_template_construct():
    """schema 类型可实例化,字段默认齐全。"""
    fs = FewShot(user="问", assistant="答")
    assert fs.user == "问" and fs.assistant == "答"
    t = PromptTemplate(id="x_v1", intent="摘要")
    # 默认值:version=1 / stage="行文" / 三段空列表 / markdown
    assert t.version == 1
    assert t.stage == "行文"
    assert t.head_rules == [] and t.middle_guidance == [] and t.few_shots == []
    assert t.tail_format == []
    assert t.output_mode == "markdown"
    assert t.output_schema is None


def test_article_draft_templates_have_saddle_humps():
    """正文起草/终稿:头尾驼峰硬约束非空,markdown 输出,首行格式约束在尾驼峰。"""
    from app.services.prompt_templates.builtin import article_draft

    for tpl in article_draft.TEMPLATES:
        assert tpl.head_rules, f"{tpl.id} 头驼峰不应为空"
        assert tpl.tail_format, f"{tpl.id} 尾驼峰不应为空"
        assert tpl.output_mode == "markdown"
    draft = article_draft.DRAFT_BODY
    assert draft.intent == "正文起草"
    assert draft.id == "draft_body_v1"
    # 首行 `# 标题` 的硬格式约束必须落在尾驼峰(永不被裁)。
    assert any("# 标题" in line for line in draft.tail_format)


def test_get_template_returns_matching_intent():
    """get_template 按 intent 返回模板;list_templates 确定性按 id 升序。"""
    t = get_template("正文起草")
    assert t.intent == "正文起草"
    assert t.id == "draft_body_v1"

    templates = list_templates()
    ids = [x.id for x in templates]
    assert ids == sorted(ids), "list_templates 必须按 id 升序"
    assert "draft_body_v1" in ids and "final_body_v1" in ids


def test_all_seven_intents_registered():
    """七意图全部可 get_template;每个模板头尾驼峰非空(硬约束有载体)。"""
    intents = [
        "选题灵感", "标题生成", "正文起草", "正文终稿",
        "改写换语气", "摘要", "封面文案",
    ]
    for intent in intents:
        tpl = get_template(intent)
        assert tpl.intent == intent
        # 头尾驼峰至少有一侧承载硬约束(structured 模板的格式约束在 tail)。
        assert tpl.head_rules or tpl.tail_format, f"{tpl.id} 缺硬约束驼峰"

    # 注册表无重复 id、按 id 升序。
    ids = [t.id for t in list_templates()]
    assert ids == sorted(ids)
    assert len(ids) == len(set(ids))


def test_structured_templates_carry_output_schema():
    """output_mode==structured 的模板必须带 output_schema。"""
    for tpl in list_templates():
        if tpl.output_mode == "structured":
            assert tpl.output_schema is not None, f"{tpl.id} structured 缺 output_schema"
            assert tpl.output_schema.get("type") == "object"
