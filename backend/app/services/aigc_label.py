# backend/app/services/aigc_label.py
"""AIGC 标识注入(默认关)。

依《人工智能生成合成内容标识办法》,自托管者可开 AIGC_LABEL_ENABLED:
- 显式:正文文末追加可见声明「本文由 AI 辅助生成」。
- 隐式:HTML 头部嵌 <!-- aigc:... --> 元数据注释(提供者编码 + 内容编号),
  并在 markdown 末尾加同义脚注,便于导出/草稿留痕。

apply() 是 article_author 收尾(第7步)的唯一入口:开关关 -> 原样返回 +
flag=False;开 -> 注入并返回 flag=True(进 done_event 的 aigc 字段)。隐式
注释能否在微信 add_draft 存活属开放问题(spec §12),不影响显式声明落地。
"""
from __future__ import annotations

import hashlib

from app.core.config import settings

# 显式可见声明(文末)。措辞与 spec §5.6 一致。
_EXPLICIT_NOTICE = "本文由 AI 辅助生成"
# 提供者编码:本软件作者标识(非 AIGC 服务商,自托管者按需改)。
_PROVIDER_CODE = "mbeditor"


def _append_explicit(html: str, markdown: str) -> tuple[str, str]:
    """文末追加可见声明;已含则跳过(幂等)。"""
    if _EXPLICIT_NOTICE not in html:
        html = html + f'<section data-aigc="notice"><p>{_EXPLICIT_NOTICE}</p></section>'
    if _EXPLICIT_NOTICE not in markdown:
        markdown = markdown.rstrip() + f"\n\n{_EXPLICIT_NOTICE}"
    return html, markdown


def _content_id(html: str, markdown: str) -> str:
    """据内容生成稳定 12 位 hex 编号(同输入同编号,便于留痕去重)。"""
    digest = hashlib.sha256((markdown + "\x00" + html).encode("utf-8")).hexdigest()
    return digest[:12]


def _embed_implicit(html: str, markdown: str) -> tuple[str, str]:
    """HTML 头部嵌隐式元数据注释;markdown 末尾加同义脚注。已含则跳过(幂等)。"""
    if "<!-- aigc:" not in html:
        cid = _content_id(html, markdown)
        comment = f"<!-- aigc:provider={_PROVIDER_CODE};id={cid} -->"
        html = comment + html
        if f"id={cid}" not in markdown:
            markdown = markdown.rstrip() + f"\n\n<!-- aigc:provider={_PROVIDER_CODE};id={cid} -->"
    return html, markdown


def apply(html: str, markdown: str) -> tuple[str, str, bool]:
    """注 AIGC 标识。开关关 -> 原样返回 + False;开 -> 注隐式+显式 + True。"""
    if not settings.AIGC_LABEL_ENABLED:
        return html, markdown, False
    html, markdown = _embed_implicit(html, markdown)
    html, markdown = _append_explicit(html, markdown)
    return html, markdown, True
