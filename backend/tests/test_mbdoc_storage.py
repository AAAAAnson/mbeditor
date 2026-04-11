"""Tests for MBDoc file-based storage."""
import json
import pytest
from pathlib import Path

from app.models.mbdoc import MBDoc, MBDocMeta, HeadingBlock
from app.services.mbdoc_storage import MBDocStorage, MBDocNotFoundError


@pytest.fixture
def storage(tmp_path: Path) -> MBDocStorage:
    return MBDocStorage(base_dir=tmp_path / "mbdocs")


def test_create_and_get(storage: MBDocStorage):
    doc = MBDoc(
        id="d1",
        meta=MBDocMeta(title="T"),
        blocks=[HeadingBlock(id="h1", level=1, text="H")],
    )
    storage.save(doc)
    loaded = storage.get("d1")
    assert loaded.id == "d1"
    assert loaded.meta.title == "T"
    assert len(loaded.blocks) == 1


def test_get_missing_raises(storage: MBDocStorage):
    with pytest.raises(MBDocNotFoundError):
        storage.get("nonexistent")


def test_update_overwrites(storage: MBDocStorage):
    doc1 = MBDoc(id="d1", meta=MBDocMeta(title="v1"))
    storage.save(doc1)
    doc2 = MBDoc(id="d1", meta=MBDocMeta(title="v2"))
    storage.save(doc2)
    loaded = storage.get("d1")
    assert loaded.meta.title == "v2"


def test_delete(storage: MBDocStorage):
    doc = MBDoc(id="d1", meta=MBDocMeta(title="T"))
    storage.save(doc)
    storage.delete("d1")
    with pytest.raises(MBDocNotFoundError):
        storage.get("d1")


def test_delete_missing_raises(storage: MBDocStorage):
    with pytest.raises(MBDocNotFoundError):
        storage.delete("nonexistent")


def test_list_ids_empty(storage: MBDocStorage):
    assert storage.list_ids() == []


def test_list_ids(storage: MBDocStorage):
    storage.save(MBDoc(id="a", meta=MBDocMeta(title="A")))
    storage.save(MBDoc(id="b", meta=MBDocMeta(title="B")))
    assert sorted(storage.list_ids()) == ["a", "b"]


def test_storage_creates_directory(tmp_path: Path):
    target = tmp_path / "nested" / "mbdocs"
    assert not target.exists()
    storage = MBDocStorage(base_dir=target)
    storage.save(MBDoc(id="x", meta=MBDocMeta(title="X")))
    assert target.is_dir()


def test_stored_file_is_valid_json(storage: MBDocStorage):
    doc = MBDoc(id="d1", meta=MBDocMeta(title="T"))
    storage.save(doc)
    path = storage._path_for("d1")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["id"] == "d1"


def test_default_base_dir_uses_settings(monkeypatch, tmp_path):
    """When no base_dir is passed, MBDocStorage uses settings.MBDOCS_DIR."""
    from app.core import config as config_mod
    monkeypatch.setattr(config_mod.settings, "MBDOCS_DIR", str(tmp_path / "from_settings"))
    storage = MBDocStorage()
    storage.save(MBDoc(id="d1", meta=MBDocMeta(title="T")))
    assert (tmp_path / "from_settings" / "d1.json").exists()
