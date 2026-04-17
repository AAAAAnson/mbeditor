import asyncio
import pytest

from app.api.v1.publish import (
    PreviewReq,
    PublishDraftReq,
    process_html_for_copy,
    preview_wechat,
    process_article,
    publish_draft,
)


def test_preview_route_delegates_to_publish_adapter(monkeypatch):
    calls = {}

    def fake_preview(html: str, css: str = "") -> str:
        calls["args"] = (html, css)
        return "<section>preview</section>"

    monkeypatch.setattr(
        "app.api.v1.publish.publish_adapter.preview_html",
        fake_preview,
    )

    resp = asyncio.run(
        preview_wechat(PreviewReq(html="<p>Hello</p>", css="p { color: red; }"))
    )

    assert resp["data"]["html"] == "<section>preview</section>"
    assert calls["args"] == ("<p>Hello</p>", "p { color: red; }")


def test_process_route_delegates_to_publish_adapter(monkeypatch):
    calls = {}

    def fake_process(article_id: str) -> str:
        calls["article_id"] = article_id
        return "<section>processed</section>"

    monkeypatch.setattr(
        "app.api.v1.publish.publish_adapter.process_article_html",
        fake_process,
    )

    resp = asyncio.run(
        process_article(PublishDraftReq(article_id="article-1", author="", digest=""))
    )

    assert resp["data"]["html"] == "<section>processed</section>"
    assert calls["article_id"] == "article-1"


def test_draft_route_delegates_to_publish_adapter(monkeypatch):
    calls = {}

    def fake_publish(article_id: str, author: str, digest: str) -> dict:
        calls["args"] = (article_id, author, digest)
        return {"media_id": "draft-1"}

    monkeypatch.setattr(
        "app.api.v1.publish.publish_adapter.publish_draft_sync",
        fake_publish,
    )

    resp = asyncio.run(
        publish_draft(PublishDraftReq(article_id="article-2", author="A", digest="D"))
    )

    assert resp["data"] == {"media_id": "draft-1"}
    assert calls["args"] == ("article-2", "A", "D")


def test_process_for_copy_route_delegates_to_publish_adapter(monkeypatch):
    calls = {}

    def fake_process(html: str, css: str = "") -> str:
        calls["args"] = (html, css)
        return "<section>copy</section>"

    monkeypatch.setattr(
        "app.api.v1.publish.publish_adapter.process_html_for_copy",
        fake_process,
    )

    resp = asyncio.run(
        process_html_for_copy(PreviewReq(html="<p>Hello</p>", css="p { color: red; }"))
    )

    assert resp["data"]["html"] == "<section>copy</section>"
    assert calls["args"] == ("<p>Hello</p>", "p { color: red; }")


def test_publish_adapter_process_article_uses_shared_pipeline(monkeypatch):
    calls = {}

    monkeypatch.setattr(
        "app.services.publish_adapter.article_service.get_article",
        lambda article_id: {
            "id": article_id,
            "html": "<p>Hello</p>",
            "css": "p { color: red; }",
        },
    )

    def fake_process(html: str, css: str = "") -> str:
        calls["pipeline"] = (html, css)
        return "<section>processed</section>"

    def fake_images(html: str) -> str:
        calls["images"] = html
        return "<section>uploaded</section>"

    monkeypatch.setattr(
        "app.services.publish_adapter.process_for_wechat",
        fake_process,
    )
    monkeypatch.setattr(
        "app.services.publish_adapter.process_article_images",
        fake_images,
    )

    from app.services import publish_adapter

    result = publish_adapter.process_article_html("article-3")

    assert result == "<section>uploaded</section>"
    assert calls["pipeline"] == ("<p>Hello</p>", "p { color: red; }")
    assert calls["images"] == "<section>processed</section>"


def test_publish_adapter_process_html_for_copy_requires_config(monkeypatch):
    monkeypatch.setattr(
        "app.services.publish_adapter.load_config",
        lambda: {"appid": "", "appsecret": ""},
    )

    from app.services import publish_adapter

    with pytest.raises(Exception) as exc_info:
        publish_adapter.process_html_for_copy("<p>Hello</p>", "")

    assert "not configured" in str(exc_info.value)


def test_publish_adapter_process_html_for_copy_uses_shared_pipeline(monkeypatch):
    calls = {}

    monkeypatch.setattr(
        "app.services.publish_adapter.load_config",
        lambda: {"appid": "wx123", "appsecret": "secret"},
    )

    def fake_process(html: str, css: str = "") -> str:
        calls["pipeline"] = (html, css)
        return "<section>processed</section>"

    def fake_images(html: str) -> str:
        calls["images"] = html
        return "<section>uploaded</section>"

    monkeypatch.setattr(
        "app.services.publish_adapter.process_for_wechat",
        fake_process,
    )
    monkeypatch.setattr(
        "app.services.publish_adapter.process_article_images",
        fake_images,
    )

    from app.services import publish_adapter

    result = publish_adapter.process_html_for_copy("<p>Hello</p>", "p { color: red; }")

    assert result == "<section>uploaded</section>"
    assert calls["pipeline"] == ("<p>Hello</p>", "p { color: red; }")
    assert calls["images"] == "<section>processed</section>"
