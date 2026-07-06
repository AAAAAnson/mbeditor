"""MBDoc file-based storage service.

持久化惯例照 ``app.services.revisions_store``(2026-07-05 惯例债修复,
API 面/模型零改):数据目录惰性解析 ``<APP_DATA_DIR>/mbdocs``、原子写
(tmp + os.replace)+ chmod 0600、损坏文件降级。
"""
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from app.core.exceptions import AppError
from app.models.mbdoc import MBDoc

logger = logging.getLogger(__name__)


def _data_dir() -> Path:
    """Resolve storage directory lazily (read APP_DATA_DIR each call)."""
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data") / "mbdocs"


def _doc_path(doc_id: str) -> Path:
    """Get file path for a document."""
    return _data_dir() / f"{doc_id}.json"


def save_mbdoc(doc: MBDoc) -> None:
    """Save MBDoc to file (atomic write: tmp + os.replace + chmod 0600)."""
    path = _doc_path(doc.id)
    tmp = path.with_suffix(".json.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
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
        logger.error("写入 mbdocs/%s.json 失败: %s", doc.id, exc)
        raise AppError(
            code=500,
            message="写入文档失败,请检查数据卷是否已挂载且可写",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    logger.info("Saved MBDoc %s", doc.id)


def load_mbdoc(doc_id: str) -> Optional[MBDoc]:
    """Load MBDoc from file."""
    path = _doc_path(doc_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return MBDoc.model_validate(data)
    except Exception as e:
        logger.error("Failed to load MBDoc %s: %s", doc_id, e)
        return None


def delete_mbdoc(doc_id: str) -> bool:
    """Delete MBDoc file."""
    path = _doc_path(doc_id)
    if not path.exists():
        return False
    path.unlink()
    logger.info("Deleted MBDoc %s", doc_id)
    return True


def list_mbdocs() -> List[dict]:
    """List all MBDoc documents (summary only)."""
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    docs = []
    for path in d.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            docs.append({
                "id": data.get("id", path.stem),
                "title": data.get("meta", {}).get("title", ""),
                "author": data.get("meta", {}).get("author", ""),
                "block_count": len(data.get("blocks", [])),
            })
        except Exception as e:
            logger.warning("Skipping invalid MBDoc %s: %s", path.name, e)
    return docs
