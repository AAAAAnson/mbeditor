"""MBDoc file-based storage.

MBDocs are persisted as individual JSON files under
``data/mbdocs/<id>.json``. This mirrors the pattern used by
``article_service`` for the legacy article model — no database
dependency, easy to inspect and back up.

Path safety: ``MBDoc.id`` is already constrained to ``[A-Za-z0-9_-]+``
by the Pydantic schema, so untrusted input cannot escape the base dir.
"""
from pathlib import Path
from typing import List, Optional

from app.core.config import settings
from app.models.mbdoc import MBDoc


class MBDocNotFoundError(Exception):
    def __init__(self, mbdoc_id: str):
        self.mbdoc_id = mbdoc_id
        super().__init__(f"MBDoc not found: {mbdoc_id!r}")


class MBDocStorage:
    """File-based persistence for MBDoc objects.

    Each document is stored as one JSON file under ``base_dir``. The
    directory is created on first write if it does not exist.
    """

    def __init__(self, base_dir: Optional[Path] = None):
        if base_dir is None:
            base_dir = Path(settings.MBDOCS_DIR)
        self.base_dir = Path(base_dir)

    def _path_for(self, mbdoc_id: str) -> Path:
        return self.base_dir / f"{mbdoc_id}.json"

    def _ensure_dir(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, doc: MBDoc) -> None:
        self._ensure_dir()
        path = self._path_for(doc.id)
        path.write_text(doc.model_dump_json(indent=2), encoding="utf-8")

    def get(self, mbdoc_id: str) -> MBDoc:
        path = self._path_for(mbdoc_id)
        if not path.exists():
            raise MBDocNotFoundError(mbdoc_id)
        return MBDoc.model_validate_json(path.read_text(encoding="utf-8"))

    def delete(self, mbdoc_id: str) -> None:
        path = self._path_for(mbdoc_id)
        if not path.exists():
            raise MBDocNotFoundError(mbdoc_id)
        path.unlink()

    def list_ids(self) -> List[str]:
        if not self.base_dir.exists():
            return []
        return [p.stem for p in self.base_dir.glob("*.json")]
