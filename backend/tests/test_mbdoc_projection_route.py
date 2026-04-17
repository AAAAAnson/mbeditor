import asyncio

from app.api.v1 import mbdoc as mbdoc_api


def test_project_article_to_mbdoc_returns_projected_doc(monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.mbdoc.article_service.get_article",
        lambda article_id: {
            "id": article_id,
            "title": "Projected",
            "mode": "html",
            "html": "<p>Hello</p>",
            "css": "",
            "author": "Anson",
            "digest": "Digest",
            "cover": "",
        },
    )

    response = asyncio.run(mbdoc_api.project_article_to_mbdoc("a1", persist=False))
    assert response["data"]["id"] == "a1"
    assert response["data"]["meta"]["title"] == "Projected"
    assert response["data"]["blocks"][0]["type"] == "html"
    assert response["data"]["projection"]["editability"] == "reversible"
    assert response["data"]["projection"]["editableBlockIds"] == ["content_html"]


def test_project_article_to_mbdoc_persists_when_requested(monkeypatch):
    calls = {}

    monkeypatch.setattr(
        "app.api.v1.mbdoc.article_service.get_article",
        lambda article_id: {
            "id": article_id,
            "title": "Projected",
            "mode": "markdown",
            "markdown": "# Hello",
        },
    )

    class _FakeStorage:
        def save(self, doc):
            calls["saved_id"] = doc.id

    monkeypatch.setattr("app.api.v1.mbdoc._storage", lambda: _FakeStorage())

    response = asyncio.run(mbdoc_api.project_article_to_mbdoc("a2", persist=True))
    assert response["data"]["id"] == "a2"
    assert calls["saved_id"] == "a2"
    assert response["data"]["projection"]["editableBlockIds"] == ["content_markdown"]


def test_render_projected_article_as_mbdoc(monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.mbdoc.article_service.get_article",
        lambda article_id: {
            "id": article_id,
            "title": "Projected",
            "mode": "markdown",
            "markdown": "# Hello",
        },
    )

    response = asyncio.run(
        mbdoc_api.render_projected_article_as_mbdoc("a3", upload_images=False)
    )
    assert response["data"]["projected"] is True
    assert "Hello" in response["data"]["html"]


def test_render_projected_article_payload_as_mbdoc_uses_payload():
    req = mbdoc_api.ArticleProjectionReq(
        id="a4",
        title="Payload",
        mode="html",
        html='<p><img src="/images/hero.png" alt="Hero" width="320" height="200"></p>',
        css="",
    )

    response = asyncio.run(
        mbdoc_api.render_projected_article_payload_as_mbdoc(req, upload_images=False)
    )
    assert response["data"]["projected"] is True
    assert 'src="/images/hero.png"' in response["data"]["html"]


def test_render_projected_article_payload_as_mbdoc_uploads_images(monkeypatch):
    from app.core import config as config_mod

    images_dir = config_mod.settings.IMAGES_DIR
    import pathlib
    import tempfile

    temp_root = pathlib.Path(tempfile.mkdtemp())
    local_images = temp_root / "images"
    local_images.mkdir()
    (local_images / "hero.png").write_bytes(b"fake-image")
    monkeypatch.setattr(config_mod.settings, "IMAGES_DIR", str(local_images))
    monkeypatch.setattr(
        "app.api.v1.mbdoc.upload_image_to_wechat",
        lambda image_bytes, filename: f"https://cdn.example/{filename}",
    )
    req = mbdoc_api.ArticleProjectionReq(
        id="a5",
        title="Payload",
        mode="html",
        html='<p><img src="/images/hero.png" alt="Inline"></p>',
        css="",
    )

    response = asyncio.run(
        mbdoc_api.render_projected_article_payload_as_mbdoc(req, upload_images=True)
    )
    assert response["data"]["projected"] is True
    assert 'src="https://cdn.example/hero.png"' in response["data"]["html"]


def test_publish_projected_article_payload_as_mbdoc(monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.mbdoc.resolve_cover_media_id",
        lambda article, processed_html: "thumb-1",
    )
    monkeypatch.setattr(
        "app.api.v1.mbdoc.extract_source_url",
        lambda raw_html: "https://example.com/source",
    )
    monkeypatch.setattr(
        "app.api.v1.mbdoc.create_article_draft",
        lambda **kwargs: {"media_id": "draft-1", "title": kwargs["article"]["title"]},
    )

    req = mbdoc_api.ArticleProjectionReq(
        id="a6",
        title="Publish Me",
        mode="markdown",
        markdown="# Hello",
        author="Anson",
        digest="Digest",
    )

    response = asyncio.run(mbdoc_api.publish_projected_article_payload_as_mbdoc(req))
    assert response["data"]["media_id"] == "draft-1"
    assert response["data"]["title"] == "Publish Me"
