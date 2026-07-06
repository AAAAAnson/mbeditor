"""article_store 测试(``app.services.article_store``)。

契约照 revisions_store 惯例:``<APP_DATA_DIR>/articles/<id>.json`` 每篇一文件、
原子写(tmp + os.replace + chmod 0600)、损坏降级、id 白名单防路径穿越
(``^[A-Za-z0-9_-]+$`` 且 ≤64,非法抛 AppError 400)。

LWW:存量存在且(base_updated_at 为 None 或 存量.updated_at > base_updated_at)
→ 先落 revisions(reason="conflict")再写入并返回 conflict_rev_id;
否则直接写。updated_at 采用客户端提交值。
"""
import json

import pytest

from app.core.exceptions import AppError
from app.services import article_store as store
from app.services import revisions_store


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def _art(aid="a1", **over):
    art = {
        "id": aid,
        "title": "标题",
        "mode": "html",
        "html": "<p>正文</p>",
        "css": "p{color:red}",
        "js": "",
        "markdown": "",
        "author": "作者",
        "digest": "摘要",
        "cover": "",
        "created_at": "2026-07-01T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z",
    }
    art.update(over)
    return art


# ---------- roundtrip / upsert ----------

def test_upsert_then_get_roundtrip():
    saved, conflict = store.upsert_article(_art(), base_updated_at=None)
    assert conflict is None  # 无存量,base=None 不触发冲突
    got = store.get_article("a1")
    assert got is not None
    assert got["id"] == "a1"
    assert got["html"] == "<p>正文</p>"
    assert got["title"] == "标题"
    assert got["deleted_at"] is None
    assert saved["id"] == "a1"


def test_upsert_updates_existing_with_matching_base():
    store.upsert_article(_art(updated_at="2026-07-05T00:00:00.000Z"), None)
    updated, conflict = store.upsert_article(
        _art(html="<p>新</p>", updated_at="2026-07-05T01:00:00.000Z"),
        base_updated_at="2026-07-05T00:00:00.000Z",
    )
    assert conflict is None
    assert store.get_article("a1")["html"] == "<p>新</p>"
    # updated_at 采用客户端提交值
    assert store.get_article("a1")["updated_at"] == "2026-07-05T01:00:00.000Z"


def test_file_shape_on_disk(tmp_path):
    store.upsert_article(_art(), None)
    path = tmp_path / "articles" / "a1.json"
    assert path.exists()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["version"] == 1
    assert data["article"]["id"] == "a1"
    assert data["article"]["deleted_at"] is None
    # 原子写:不留 tmp 残骸
    assert list((tmp_path / "articles").glob("*.tmp")) == []


def test_get_missing_returns_none():
    assert store.get_article("nope") is None


# ---------- list 摘要 ----------

def test_list_summary_excludes_large_fields():
    store.upsert_article(_art("a1"), None)
    store.upsert_article(_art("a2", title="乙"), None)
    items = store.list_articles(include_deleted=False)
    assert {i["id"] for i in items} == {"a1", "a2"}
    for i in items:
        for banned in ("html", "css", "js", "markdown"):
            assert banned not in i
        for key in ("id", "title", "mode", "cover", "created_at", "updated_at", "deleted_at"):
            assert key in i


def test_list_include_deleted_filter():
    store.upsert_article(_art("a1"), None)
    store.upsert_article(_art("a2"), None)
    store.soft_delete("a2")
    live = store.list_articles(include_deleted=False)
    assert [i["id"] for i in live] == ["a1"]
    everything = store.list_articles(include_deleted=True)
    assert {i["id"] for i in everything} == {"a1", "a2"}
    deleted = next(i for i in everything if i["id"] == "a2")
    assert deleted["deleted_at"]


# ---------- 软删 / restore / purge ----------

def test_soft_delete_sets_deleted_at_and_restore_clears():
    store.upsert_article(_art(), None)
    art = store.soft_delete("a1")
    assert art["deleted_at"]
    assert store.get_article("a1")["deleted_at"]
    restored = store.restore_article("a1")
    assert restored["deleted_at"] is None
    assert store.get_article("a1")["deleted_at"] is None


def test_upsert_preserves_deleted_at():
    store.upsert_article(_art(), None)
    store.soft_delete("a1")
    store.upsert_article(
        _art(html="<p>改</p>", updated_at="2026-07-06T00:00:00.000Z"),
        base_updated_at=store.get_article("a1")["updated_at"],
    )
    assert store.get_article("a1")["deleted_at"]  # 软删态不被 PUT 冲掉


def test_purge_removes_article_and_revisions_file(tmp_path):
    store.upsert_article(_art(), None)
    revisions_store.add_revision("a1", "<p>旧</p>", "chat_turn")
    assert (tmp_path / "articles" / "a1.json").exists()
    assert (tmp_path / "revisions_a1.json").exists()
    store.purge_article("a1")
    assert not (tmp_path / "articles" / "a1.json").exists()
    assert not (tmp_path / "revisions_a1.json").exists()
    assert store.get_article("a1") is None


def test_soft_delete_restore_purge_missing_raise_404():
    for fn in (store.soft_delete, store.restore_article, store.purge_article):
        with pytest.raises(AppError) as ei:
            fn("nope")
        assert ei.value.code == 404


# ---------- LWW 三分支 ----------

def test_lww_no_existing_no_conflict():
    _, conflict = store.upsert_article(_art(), base_updated_at=None)
    assert conflict is None
    assert revisions_store.list_revisions("a1") == []


def test_lww_base_matches_no_conflict():
    store.upsert_article(_art(updated_at="T1"), None)
    _, conflict = store.upsert_article(_art(updated_at="T2"), base_updated_at="T1")
    assert conflict is None
    assert revisions_store.list_revisions("a1") == []


def test_lww_conflict_snapshots_loser_html():
    store.upsert_article(_art(html="<p>服务端版</p>", updated_at="2026-07-05T02:00:00.000Z"), None)
    _, conflict = store.upsert_article(
        _art(html="<p>客户端版</p>", updated_at="2026-07-05T03:00:00.000Z"),
        base_updated_at="2026-07-05T01:00:00.000Z",  # 比存量旧 → 冲突
    )
    assert conflict is not None
    metas = revisions_store.list_revisions("a1")
    assert len(metas) == 1
    assert metas[0]["rev_id"] == conflict
    assert metas[0]["reason"] == "conflict"
    assert revisions_store.get_revision("a1", conflict)["html"] == "<p>服务端版</p>"
    # 写入仍被接受(LWW 不阻断)
    assert store.get_article("a1")["html"] == "<p>客户端版</p>"


def test_lww_none_base_with_existing_conflicts():
    store.upsert_article(_art(html="<p>老</p>"), None)
    _, conflict = store.upsert_article(_art(html="<p>新</p>"), base_updated_at=None)
    assert conflict is not None
    assert revisions_store.get_revision("a1", conflict)["html"] == "<p>老</p>"


# ---------- id 白名单 ----------

@pytest.mark.parametrize("bad", ["", "  ", "../evil", "a/b", "a\\b", "a.b", "a b", "a:b", "x" * 65])
def test_invalid_article_id_raises_400(bad):
    with pytest.raises(AppError) as ei:
        store.upsert_article(_art(bad), None)
    assert ei.value.code == 400
    with pytest.raises(AppError):
        store.get_article(bad)
    with pytest.raises(AppError):
        store.soft_delete(bad)
    with pytest.raises(AppError):
        store.purge_article(bad)


# ---------- 损坏降级 ----------

def test_corrupt_file_degrades(tmp_path):
    d = tmp_path / "articles"
    d.mkdir(parents=True)
    (d / "a1.json").write_text("{not json", encoding="utf-8")
    assert store.get_article("a1") is None
    assert store.list_articles(include_deleted=True) == []  # 损坏跳过
    # 覆写恢复
    store.upsert_article(_art(), None)
    assert store.get_article("a1")["html"] == "<p>正文</p>"


def test_corrupt_file_can_be_purged(tmp_path):
    """损坏文件 _load 降级 None,但只要文件在就允许 purge(不留磁盘孤儿)。"""
    d = tmp_path / "articles"
    d.mkdir(parents=True)
    (d / "a1.json").write_text("{not json", encoding="utf-8")
    store.purge_article("a1")
    assert not (d / "a1.json").exists()
