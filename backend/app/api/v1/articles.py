"""文章主存储 API(``/api/v1/articles``)。

C1 内容安全:文章真源从前端 localStorage 迁到后端(P1 spec §2)。
响应信封照既有惯例(success/AppError);LWW 冲突不阻断,响应带
``conflict_rev_id``(输家 html 已落 revisions,reason="conflict")。
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.core.exceptions import AppError
from app.core.response import success
from app.services import article_store

router = APIRouter(prefix="/articles", tags=["articles"])


class ArticlePayload(BaseModel):
    """PUT body = ArticleFull 字段 + base_updated_at。

    前端未来可能加字段 -> extra=ignore(不 forbid,更稳);
    id 走路径参数,不进 body。
    """
    model_config = ConfigDict(extra="ignore")

    title: str = ""
    mode: str = ""
    html: str = ""
    css: str = ""
    js: str = ""
    markdown: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""
    created_at: str = ""
    updated_at: str = ""
    base_updated_at: str | None = None


@router.get("")
async def list_articles(include_deleted: bool = False):
    """摘要列表(不含 html/css/js/markdown);默认过滤软删。"""
    return success({"articles": article_store.list_articles(include_deleted=include_deleted)})


@router.get("/{article_id}")
async def get_article(article_id: str):
    """全文;不存在 -> 404。"""
    article = article_store.get_article(article_id)
    if article is None:
        raise AppError(code=404, message="文章不存在")
    return success({"article": article})


@router.put("/{article_id}")
async def put_article(article_id: str, req: ArticlePayload):
    """全量 upsert;LWW 冲突时输家落 conflict 快照,响应带 conflict_rev_id。"""
    payload = req.model_dump(exclude={"base_updated_at"})
    payload["id"] = article_id
    article, conflict_rev_id = article_store.upsert_article(
        payload, base_updated_at=req.base_updated_at
    )
    return success({"article": article, "conflict_rev_id": conflict_rev_id})


@router.delete("/{article_id}")
async def delete_article(article_id: str, purge: bool = False):
    """默认软删(标 deleted_at);``?purge=true`` 真删文件 + 连删 revisions。"""
    if purge:
        article_store.purge_article(article_id)
        return success({"purged": True, "id": article_id})
    article = article_store.soft_delete(article_id)
    return success({"article": article})


@router.post("/{article_id}/restore")
async def restore_article(article_id: str):
    """从回收站恢复(清 deleted_at);不存在 -> 404。"""
    article = article_store.restore_article(article_id)
    return success({"article": article})
