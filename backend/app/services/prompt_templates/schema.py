# backend/app/services/prompt_templates/schema.py
"""七意图 prompt 模板的 pydantic schema。builtin/*.py 内置实例,本刀不做热更后台。"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# 七意图(spec §5.5)。article_author 据 audience+tone 选 "正文起草"。
Intent = Literal[
    "选题灵感", "标题生成", "正文起草", "正文终稿",
    "改写换语气", "摘要", "封面文案",
]
OutputMode = Literal["text", "markdown", "structured"]


class FewShot(BaseModel):
    user: str
    assistant: str


class PromptTemplate(BaseModel):
    id: str                                    # 全局唯一,如 "draft_body_v1"
    version: int = 1
    intent: Intent
    stage: str = "行文"                         # 对应五工序之一
    scene: str = ""                            # 场景描述(运营备注用)
    role: str = ""                             # 角色设定句,进 head_rules 之前
    # —— 马鞍三段(context_engine 据此拼 prompt)——
    head_rules: list[str] = Field(default_factory=list)      # 头驼峰:硬约束
    middle_guidance: list[str] = Field(default_factory=list) # 谷底:软引导(可被裁)
    few_shots: list[FewShot] = Field(default_factory=list)   # 谷底:示例(可被裁)
    tail_format: list[str] = Field(default_factory=list)     # 尾驼峰:输出格式硬约束
    output_mode: OutputMode = "markdown"
    output_schema: Optional[dict] = None       # output_mode=="structured" 时必填


def get_template(intent: Intent) -> PromptTemplate:
    """从 builtin 注册表取该意图的模板。缺失 -> KeyError(测试断言全意图齐全)。

    同 intent 多模板时取 id 升序第一个(确定性)。注册表在 builtin 包内,
    延迟 import 以避免 schema <-> builtin 循环导入。
    """
    from app.services.prompt_templates.builtin import BUILTIN_TEMPLATES

    for tpl in BUILTIN_TEMPLATES:  # 已按 id 升序
        if tpl.intent == intent:
            return tpl
    raise KeyError(intent)


def list_templates() -> list[PromptTemplate]:
    """全部内置模板(按 id 升序,用于注册表自检)。"""
    from app.services.prompt_templates.builtin import BUILTIN_TEMPLATES

    return list(BUILTIN_TEMPLATES)
