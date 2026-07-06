# backend/app/services/prompt_templates/__init__.py
"""七意图 prompt 模板包。schema 定义 + builtin 内置实例。

本刀只内置、不做运营热更后台(留位)。下游统一从这里 import:
    from app.services.prompt_templates import PromptTemplate, get_template, Intent
"""
from __future__ import annotations

from app.services.prompt_templates.schema import (
    FewShot,
    Intent,
    OutputMode,
    PromptTemplate,
    get_template,
    list_templates,
)

__all__ = [
    "FewShot",
    "Intent",
    "OutputMode",
    "PromptTemplate",
    "get_template",
    "list_templates",
]
