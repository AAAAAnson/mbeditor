"""文章快照 API(``/api/v1/revisions``)。

agent 对话编辑的检查点/后悔机制地基(spec §6):每轮 turn 前落快照,
前端/编排层经此读回。响应信封照既有惯例(success/AppError)。
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.exceptions import AppError
from app.core.response import success
from app.services import revisions_store

router = APIRouter(prefix="/revisions", tags=["revisions"])


class RevisionPostReq(BaseModel):
    html: str = ""
    reason: str = ""


@router.get("/{article_id}")
async def list_revisions(article_id: str):
    """列出某篇文章的快照元数据(不含 html),新的在前。"""
    return success({"revisions": revisions_store.list_revisions(article_id)})


@router.get("/{article_id}/{rev_id}")
async def get_revision(article_id: str, rev_id: str):
    """取一份完整快照(含 html);不存在 -> 404。"""
    rev = revisions_store.get_revision(article_id, rev_id)
    if rev is None:
        raise AppError(code=404, message="快照不存在")
    return success(rev)


@router.post("/{article_id}")
async def add_revision(article_id: str, req: RevisionPostReq):
    """落一份快照(前端/编排层用),返回 rev_id。"""
    rev_id = revisions_store.add_revision(article_id, req.html, req.reason)
    return success({"rev_id": rev_id})
