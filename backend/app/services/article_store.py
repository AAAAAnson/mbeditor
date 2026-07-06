"""文章主存储(``<APP_DATA_DIR>/articles/<article_id>.json``)。

持久化惯例照 ``app.services.revisions_store``(上游又照 credentials):
原子写(tmp + os.replace)、chmod 0600、数据目录惰性解析、损坏文件降级。
差异点:

- 每篇文章一个 json 文件,形状 ``{"version": 1, "article": {..., "deleted_at": null}}``;
- LWW 冲突:存量存在且(base_updated_at 为 None 或 存量.updated_at >
  base_updated_at)→ 先把存量 html 落 revisions(reason="conflict")再接受
  写入,返回 conflict_rev_id(不弹窗不阻断,updated_at 采用客户端提交值);
- 软删除(deleted_at)+ restore + purge(purge 连带删 ``revisions_<id>.json``);
- article_id 进文件名 -> 严格净化防路径穿越(``^[A-Za-z0-9_-]+$`` 且 ≤64)。
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from app.core.exceptions import AppError
from app.services import revisions_store

logger = logging.getLogger(__name__)

MAX_ARTICLE_ID_LEN = 64

_ARTICLE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# 摘要字段(list_articles 返回;html/css/js/markdown 等大字段绝不进列表)
_SUMMARY_KEYS = ("id", "title", "mode", "cover", "created_at", "updated_at", "deleted_at")


def _data_dir() -> Path:
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _articles_dir() -> Path:
    return _data_dir() / "articles"


def _validate_article_id(article_id: str) -> str:
    """净化文章 id:只允许 [A-Za-z0-9_-] 且 ≤64,否则 400(防路径穿越)。"""
    aid = (article_id or "").strip()
    if not aid or len(aid) > MAX_ARTICLE_ID_LEN or not _ARTICLE_ID_RE.match(aid):
        raise AppError(code=400, message="非法文章 id(只允许字母、数字、下划线、连字符,不超过 64 位)")
    return aid


def _file_path(aid: str) -> Path:
    return _articles_dir() / f"{aid}.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load(aid: str) -> dict | None:
    """读单篇文章文件;缺失/损坏/形状不对 -> None(降级,不炸)。"""
    path = _file_path(aid)
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("articles/%s.json 已损坏,按不存在处理", aid)
        return None
    if not isinstance(data, dict):
        return None
    article = data.get("article")
    if not isinstance(article, dict) or not isinstance(article.get("id"), str):
        return None
    article.setdefault("deleted_at", None)
    return article


def _save(aid: str, article: dict) -> None:
    """原子写(tmp + os.replace)+ chmod 0600,失败抛 AppError 500。"""
    path = _file_path(aid)
    tmp = path.with_suffix(".json.tmp")
    data = {"version": 1, "article": article}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, path)
    except OSError as exc:
        try:
            tmp.unlink()
        except OSError:
            pass
        logger.error("写入 articles/%s.json 失败: %s", aid, exc)
        raise AppError(
            code=500,
            message="写入文章失败,请检查数据卷是否已挂载且可写",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def upsert_article(article: dict, base_updated_at: str | None) -> tuple[dict, str | None]:
    """全量 upsert;LWW 冲突时先把存量 html 落 conflict 快照。

    返回 (存后 article, conflict_rev_id|None)。updated_at 采用客户端提交值
    (客户端是编辑时刻真源);软删态(deleted_at)由服务端保留,PUT 不冲掉。
    """
    aid = _validate_article_id(str(article.get("id") or ""))
    existing = _load(aid)

    conflict_rev_id: str | None = None
    if existing is not None and (
        base_updated_at is None or str(existing.get("updated_at") or "") > base_updated_at
    ):
        conflict_rev_id = revisions_store.add_revision(
            aid, str(existing.get("html") or ""), "conflict"
        )

    stored = dict(article)
    stored["id"] = aid
    if "deleted_at" not in stored:
        stored["deleted_at"] = existing.get("deleted_at") if existing else None
    _save(aid, stored)
    return stored, conflict_rev_id


def get_article(article_id: str) -> dict | None:
    """取全文;不存在/损坏返回 None。"""
    aid = _validate_article_id(article_id)
    return _load(aid)


def list_articles(include_deleted: bool = False) -> list[dict]:
    """摘要列表(不含 html/css/js/markdown),updated_at 新的在前;损坏跳过。"""
    d = _articles_dir()
    items: list[dict] = []
    try:
        paths = sorted(d.glob("*.json"))
    except OSError:
        return []
    for path in paths:
        article = _load(path.stem)
        if article is None:
            continue
        if not include_deleted and article.get("deleted_at"):
            continue
        items.append({k: article.get(k) for k in _SUMMARY_KEYS})
    items.sort(key=lambda a: str(a.get("updated_at") or ""), reverse=True)
    return items


def _require(aid: str) -> dict:
    article = _load(aid)
    if article is None:
        raise AppError(code=404, message="文章不存在")
    return article


def soft_delete(article_id: str) -> dict:
    """软删:标 deleted_at=now;不存在 404。"""
    aid = _validate_article_id(article_id)
    article = _require(aid)
    article["deleted_at"] = _now_iso()
    _save(aid, article)
    return article


def restore_article(article_id: str) -> dict:
    """恢复软删:清 deleted_at;不存在 404。"""
    aid = _validate_article_id(article_id)
    article = _require(aid)
    article["deleted_at"] = None
    _save(aid, article)
    return article


def purge_article(article_id: str) -> None:
    """真删文章文件 + 连带删 ``revisions_<id>.json``;不存在 404。"""
    aid = _validate_article_id(article_id)
    # 损坏文件 _load 会降级 None,但只要文件还在就允许 purge(否则磁盘留永久孤儿)
    if _load(aid) is None and not _file_path(aid).exists():
        raise AppError(code=404, message="文章不存在")
    try:
        _file_path(aid).unlink()
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.error("删除 articles/%s.json 失败: %s", aid, exc)
        raise AppError(code=500, message="删除文章失败,请稍后重试") from exc
    rev_path = _data_dir() / f"revisions_{aid}.json"
    try:
        rev_path.unlink()
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.warning("删除 revisions_%s.json 失败: %s", aid, exc)
