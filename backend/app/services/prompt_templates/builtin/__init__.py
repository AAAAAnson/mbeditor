# backend/app/services/prompt_templates/builtin/__init__.py
"""内置模板注册表:聚合各 builtin/*.py 的 TEMPLATES,按 id 排序去重自检。

Task 16 会把 misc_intents 并进来,补齐七意图。schema.get_template/list_templates
读本模块的 BUILTIN_TEMPLATES。
"""
from __future__ import annotations

from app.services.prompt_templates.builtin import article_draft, misc_intents
from app.services.prompt_templates.schema import PromptTemplate

# 聚合顺序无关——下方按 id 排序得到确定性 list。
_RAW: list[PromptTemplate] = [
    *article_draft.TEMPLATES,
    *misc_intents.TEMPLATES,
]

# id 必须全局唯一(注册表自检:重复 id 直接在 import 期炸)。
_ids = [t.id for t in _RAW]
assert len(_ids) == len(set(_ids)), f"duplicate template id in builtin: {_ids}"

# 确定性排序:按 id 升序,供 list_templates 输出稳定。
BUILTIN_TEMPLATES: list[PromptTemplate] = sorted(_RAW, key=lambda t: t.id)
