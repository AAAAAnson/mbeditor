import json

import pytest
from fastapi.testclient import TestClient

from app.services import article_service


@pytest.fixture(autouse=True)
def _isolate_storage(tmp_path, monkeypatch):
    from app.core import config as config_mod

    articles_dir = tmp_path / "articles"
    images_dir = tmp_path / "images"
    mbdocs_dir = tmp_path / "mbdocs"
    articles_dir.mkdir()
    images_dir.mkdir()
    mbdocs_dir.mkdir()
    monkeypatch.setattr(config_mod.settings, "ARTICLES_DIR", str(articles_dir))
    monkeypatch.setattr(config_mod.settings, "IMAGES_DIR", str(images_dir))
    monkeypatch.setattr(config_mod.settings, "MBDOCS_DIR", str(mbdocs_dir))
    monkeypatch.setattr(config_mod.settings, "CONFIG_FILE", str(tmp_path / "config.json"))
    yield


@pytest.fixture
def client(_isolate_storage) -> TestClient:
    from app.main import app

    return TestClient(app)


def test_runs_empty_state_is_truthful(client: TestClient):
    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200

    body = resp.json()
    assert body["code"] == 0
    data = body["data"]
    assert data["mode"] == "read_only_activity"
    assert data["items"] == []
    assert data["summary"]["total"] == 0
    assert data["summary"]["wechat_configured"] is False
    assert data["capabilities"]["persisted_runs"] is False
    assert data["capabilities"]["pause"] is False
    assert data["capabilities"]["command"] is False
    assert data["capabilities"]["live_terminal"] is False


def test_runs_derive_empty_and_draft_records(client: TestClient):
    empty_article = article_service.create_article("Empty Shell", "html")
    draft_article = article_service.create_article("Ready Body", "markdown")
    article_service.update_article(
        draft_article["id"],
        {"markdown": "# Hello\n\nMBEditor control room"},
    )

    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]

    by_id = {item["article_id"]: item for item in items}
    assert by_id[empty_article["id"]]["status"] == "empty"
    assert by_id[empty_article["id"]]["capabilities"]["publish"] is False

    draft = by_id[draft_article["id"]]
    assert draft["status"] == "draft"
    assert draft["step_label"] == "正文已就绪，待配置公众号"
    assert draft["body_chars"] > 0
    assert draft["capabilities"]["preview"] is True
    assert draft["capabilities"]["publish"] is False
    assert any("只读活动台" in event["text"] for event in draft["events"])


def test_runs_report_ready_when_wechat_config_exists(client: TestClient, tmp_path):
    article = article_service.create_article("Publish Me", "html")
    article_service.update_article(
        article["id"],
        {"html": "<h1>Hello</h1><p>World</p>", "cover": "/images/cover.png"},
    )
    (tmp_path / "config.json").write_text(
        json.dumps({"appid": "wx-demo", "appsecret": "secret"}, ensure_ascii=False),
        encoding="utf-8",
    )

    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    payload = resp.json()["data"]
    record = payload["items"][0]

    assert payload["summary"]["wechat_configured"] is True
    assert record["status"] == "ready"
    assert record["capabilities"]["publish"] is True
    assert any("/api/v1/publish/process" in event["text"] for event in record["events"])
