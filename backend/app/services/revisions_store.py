"""按文章存 append-only HTML 快照(``<APP_DATA_DIR>/revisions_<article_id>.json``)。

持久化惯例照 ``app.services.credentials``:原子写(tmp + os.replace)、
chmod 0600、数据目录惰性解析、损坏文件降级为空。差异点:

- html 可到 1MB 级 -> **每篇文章一个 json 文件**,不用全库单文件;
- 每篇上限 50 份,超则丢最旧(append-only 轮转);
- rev_id 确定性(``rev_{seq}``,seq 持久化递增,轮转后不复用);
- article_id 直接进文件名 -> 严格净化防路径穿越(只允许 [A-Za-z0-9_-])。
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

MAX_REVISIONS = 50

_ARTICLE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _data_dir() -> Path:
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _validate_article_id(article_id: str) -> str:
    """净化文章 id:只允许 [A-Za-z0-9_-],否则 400(防路径穿越)。"""
    aid = (article_id or "").strip()
    if not aid or not _ARTICLE_ID_RE.match(aid):
        raise AppError(code=400, message="非法文章 id(只允许字母、数字、下划线、连字符)")
    return aid


def _file_path(aid: str) -> Path:
    return _data_dir() / f"revisions_{aid}.json"


def _empty() -> dict:
    return {"version": 1, "next_seq": 1, "revisions": []}


def _load(aid: str) -> dict:
    """读单篇快照文件;缺失/损坏/形状不对 -> 空结构(降级,不炸)。"""
    path = _file_path(aid)
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return _empty()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("revisions_%s.json 已损坏,按空处理", aid)
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    revisions = data.get("revisions")
    if not isinstance(revisions, list):
        return _empty()
    clean = [
        r for r in revisions
        if isinstance(r, dict) and isinstance(r.get("rev_id"), str)
    ]
    next_seq = data.get("next_seq")
    if not isinstance(next_seq, int) or next_seq < 1:
        next_seq = len(clean) + 1
    return {"version": 1, "next_seq": next_seq, "revisions": clean}


def _save(aid: str, data: dict) -> None:
    """原子写(tmp + os.replace)+ chmod 0600,失败抛 AppError 500。"""
    path = _file_path(aid)
    tmp = path.with_suffix(".json.tmp")
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
        raise AppError(
            code=500,
            message=f"写入快照失败,请检查数据卷 {path.parent} 是否已挂载且可写: {exc}",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def add_revision(article_id: str, html: str, reason: str) -> str:
    """追加一份快照,返回其 rev_id;超上限丢最旧(seq 不复用)。"""
    aid = _validate_article_id(article_id)
    data = _load(aid)
    seq = data["next_seq"]
    rev_id = f"rev_{seq}"
    data["revisions"].append({
        "rev_id": rev_id,
        "ts": time.time(),
        "reason": str(reason or ""),
        "html": str(html or ""),
    })
    if len(data["revisions"]) > MAX_REVISIONS:
        data["revisions"] = data["revisions"][-MAX_REVISIONS:]
    data["next_seq"] = seq + 1
    _save(aid, data)
    return rev_id


def list_revisions(article_id: str) -> list[dict]:
    """列出元数据(rev_id/ts/reason,**不含 html**),新的在前。"""
    aid = _validate_article_id(article_id)
    revisions = _load(aid)["revisions"]
    return [
        {"rev_id": r["rev_id"], "ts": r.get("ts"), "reason": r.get("reason", "")}
        for r in reversed(revisions)
    ]


def get_revision(article_id: str, rev_id: str) -> dict | None:
    """取完整快照(含 html);不存在返回 None。"""
    aid = _validate_article_id(article_id)
    for r in _load(aid)["revisions"]:
        if r["rev_id"] == rev_id:
            return {
                "rev_id": r["rev_id"],
                "ts": r.get("ts"),
                "reason": r.get("reason", ""),
                "html": r.get("html", ""),
            }
    return None
