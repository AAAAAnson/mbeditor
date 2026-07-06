"""revisions_store 测试(``app.services.revisions_store``)。

契约照 credentials 存储惯例:APP_DATA_DIR 下每篇文章一个
``revisions_<article_id>.json``、原子写、损坏降级为空;append-only 快照
上限 50 份超则丢最旧;rev_id 确定性(rev_{seq},轮转后不复用);
article_id 净化防路径穿越(只允许 [A-Za-z0-9_-],非法抛 AppError 400)。
"""
import json

import pytest

from app.core.exceptions import AppError
from app.services import revisions_store as rev


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def test_add_then_get_roundtrip():
    rid = rev.add_revision("a1", "<p>甲</p>", "chat_turn")
    got = rev.get_revision("a1", rid)
    assert got is not None
    assert got["rev_id"] == rid
    assert got["html"] == "<p>甲</p>"
    assert got["reason"] == "chat_turn"
    assert isinstance(got["ts"], float)


def test_rev_ids_deterministic_sequence():
    r1 = rev.add_revision("a1", "<p>1</p>", "chat_turn")
    r2 = rev.add_revision("a1", "<p>2</p>", "ai_adopt")
    assert r1 == "rev_1"
    assert r2 == "rev_2"


def test_list_returns_metadata_without_html_newest_first():
    rev.add_revision("a1", "<p>老</p>", "chat_turn")
    rev.add_revision("a1", "<p>新</p>", "ai_adopt")
    metas = rev.list_revisions("a1")
    assert [m["rev_id"] for m in metas] == ["rev_2", "rev_1"]
    for m in metas:
        assert "html" not in m
        assert set(m) == {"rev_id", "ts", "reason"}


def test_cap_50_drops_oldest_and_never_reuses_ids():
    for i in range(55):
        rev.add_revision("a1", f"<p>{i}</p>", "chat_turn")
    metas = rev.list_revisions("a1")
    assert len(metas) == 50
    assert metas[0]["rev_id"] == "rev_55"
    assert metas[-1]["rev_id"] == "rev_6"
    assert rev.get_revision("a1", "rev_1") is None  # 最旧已轮转丢弃


def test_get_missing_returns_none():
    assert rev.get_revision("a1", "rev_99") is None
    rev.add_revision("a1", "<p>x</p>", "chat_turn")
    assert rev.get_revision("a1", "rev_99") is None


def test_articles_isolated_per_file(tmp_path):
    rev.add_revision("aaa", "<p>A</p>", "chat_turn")
    rev.add_revision("bbb", "<p>B</p>", "chat_turn")
    assert (tmp_path / "revisions_aaa.json").exists()
    assert (tmp_path / "revisions_bbb.json").exists()
    assert rev.get_revision("aaa", "rev_1")["html"] == "<p>A</p>"
    assert rev.get_revision("bbb", "rev_1")["html"] == "<p>B</p>"


@pytest.mark.parametrize("bad", ["", "  ", "../evil", "a/b", "a\\b", "a.b", "a b", "a:b"])
def test_invalid_article_id_raises_400(bad):
    with pytest.raises(AppError) as ei:
        rev.add_revision(bad, "<p>x</p>", "chat_turn")
    assert ei.value.code == 400
    with pytest.raises(AppError):
        rev.list_revisions(bad)
    with pytest.raises(AppError):
        rev.get_revision(bad, "rev_1")


def test_corrupt_file_degrades_then_recovers(tmp_path):
    (tmp_path / "revisions_a1.json").write_text("{not json", encoding="utf-8")
    assert rev.list_revisions("a1") == []
    rid = rev.add_revision("a1", "<p>新</p>", "chat_turn")
    assert rev.get_revision("a1", rid)["html"] == "<p>新</p>"


def test_file_shape_on_disk(tmp_path):
    rev.add_revision("a1", "<p>x</p>", "chat_turn")
    data = json.loads((tmp_path / "revisions_a1.json").read_text(encoding="utf-8"))
    assert data["version"] == 1
    assert isinstance(data["revisions"], list)
    assert data["revisions"][0]["rev_id"] == "rev_1"
