# backend/app/services/rewrite_prompt.py
"""AI 修改闭环的 prompt 组装 + title 候选解析。

纯函数、无 IO;编排在 article_author.rewrite_text / rewrite_article。
"""
from __future__ import annotations

import re

_SYSTEM: dict[str, str] = {
    "block": (
        "你是公众号文章的段落改写器。根据用户指令改写选中的段落,"
        "只返回改写后的该段纯文本:不带任何 HTML/Markdown 标记、不带引号、"
        "不带解释或前后缀。除非指令要求缩短/扩写,长度量级与原段相当。"
        "语气与全文上下文保持一致。"
    ),
    "title": (
        "你是公众号标题创作器。为这篇文章拟 3 个候选标题,一行一个,"
        "不带序号、不带引号、不带解释。风格贴合正文调性,长度适合公众号标题。"
    ),
    "digest": (
        "你是公众号摘要撰写器。为这篇文章写一条摘要(显示在分享卡片上),"
        "不超过 120 字,只返回摘要纯文本:不带标记、不带引号、不带解释。"
    ),
    "article": (
        "你是公众号文章改写器。按用户指令整篇改写这篇文章。"
        "用 Markdown 输出,首行是 `# 标题`,正文分段;只返回改写后的全文,"
        "不带解释或前后缀。保留原文的事实与核心信息。"
    ),
}


def build_rewrite_messages(
    *,
    scope: str,
    selected_text: str = "",
    instruction: str = "",
    title: str = "",
    article_text: str = "",
    tone: str = "",
) -> tuple[str, str]:
    """返回 (system, user)。scope 必须是 block/title/digest/article 之一。"""
    system = _SYSTEM[scope]
    parts: list[str] = []
    if title:
        parts.append(f"文章标题:{title}")
    if article_text:
        label = "待改写的文章全文" if scope == "article" else "全文上下文(供风格参照)"
        parts.append(f"{label}:\n{article_text}")
    if scope == "block":
        parts.append(f"选中的段落:\n{selected_text}")
    if instruction:
        parts.append(f"改写指令:{instruction}")
    if scope == "article" and tone:
        parts.append(f"目标调子:{tone}")
    return system, "\n\n".join(parts)


# 行首序号/项目符号:1. / 1、 / 1) / - / * / •
_LEADING_MARK = re.compile(r"^\s*(?:\d+\s*[.、)]|[-*•])\s*")


def parse_title_variants(raw: str, limit: int = 3) -> list[str]:
    """LLM 返回的多行标题 -> 候选列表。剥序号/空行,最多 limit 个,不足按实际。"""
    out: list[str] = []
    for line in raw.splitlines():
        text = _LEADING_MARK.sub("", line).strip()
        if text:
            out.append(text)
        if len(out) >= limit:
            break
    return out
