from app.services import media_uploader, wechat_publisher


def test_extract_source_url_prefers_comment():
    html = '<!-- source_url:https://example.com/a --><a href="https://example.com/b">x</a>'
    assert wechat_publisher.extract_source_url(html) == "https://example.com/a"


def test_extract_source_url_falls_back_to_anchor():
    html = '<section><a href="https://example.com/b">x</a></section>'
    assert wechat_publisher.extract_source_url(html) == "https://example.com/b"


def test_create_article_draft_delegates_to_wechat_service(monkeypatch):
    calls = {}

    def fake_create_draft(**kwargs):
        calls["kwargs"] = kwargs
        return {"media_id": "draft-1"}

    monkeypatch.setattr(
        "app.services.wechat_publisher.wechat_service.create_draft",
        fake_create_draft,
    )

    article = {"title": "T", "author": "A", "digest": "D"}
    result = wechat_publisher.create_article_draft(
        article=article,
        processed_html="<p>x</p>",
        thumb_media_id="thumb-1",
        source_url="https://example.com",
        author="",
        digest="",
    )

    assert result == {"media_id": "draft-1"}
    assert calls["kwargs"]["title"] == "T"
    assert calls["kwargs"]["html"] == "<p>x</p>"
    assert calls["kwargs"]["thumb_media_id"] == "thumb-1"
    assert calls["kwargs"]["content_source_url"] == "https://example.com"


def test_process_article_images_delegates_to_wechat_service(monkeypatch):
    calls = {}

    def fake_process(html: str, images_dir: str) -> str:
        calls["args"] = (html, images_dir)
        return "<section>done</section>"

    monkeypatch.setattr(
        "app.services.media_uploader.wechat_service.process_html_images",
        fake_process,
    )

    result = media_uploader.process_article_images("<p>x</p>")
    assert result == "<section>done</section>"
    assert calls["args"][0] == "<p>x</p>"
