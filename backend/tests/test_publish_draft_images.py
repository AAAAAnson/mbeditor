"""The draft-API path must offload images to WeChat mmbiz, not the LAN imgbed.

WeChat's servers can't fetch LAN imgbed URLs, and leaving base64 images inline
blows past WeChat's ~1MB draft-content limit ("content size out of limit"). So
``publish_draft_sync`` routes images through ``wechat_service.process_html_images``
(media/uploadimg via the configured gateway), yielding small mmbiz URLs.
"""
from app.services import publish_adapter, wechat_service


def test_publish_draft_offloads_images_to_wechat_mmbiz(monkeypatch):
    captured = {}

    # Keep the html identity through sanitize so we can assert on image handling.
    monkeypatch.setattr(
        publish_adapter, "process_for_wechat",
        lambda html, css, profile="wechat": html,
    )

    # mmbiz offloader: rewrite the base64 data URI to an mmbiz URL.
    def fake_process_html_images(html, *, appid, appsecret):
        captured["creds"] = (appid, appsecret)
        return (
            html.replace("data:image/png;base64,AAAA", "https://mmbiz.qpic.cn/uploaded"),
            [],
        )

    monkeypatch.setattr(wechat_service, "process_html_images", fake_process_html_images)

    def fake_create_draft(*, appid, appsecret, title, html, **kw):
        captured["html"] = html
        return {"media_id": "mid-1"}

    monkeypatch.setattr(wechat_service, "create_draft", fake_create_draft)

    # The imgbed offloader must NOT be used by the draft path anymore.
    from app.services import local_imgbed_service
    monkeypatch.setattr(
        local_imgbed_service, "process_html_images_via_imgbed",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("draft must not use imgbed")),
    )

    article = {"title": "t", "html": '<img src="data:image/png;base64,AAAA">', "css": ""}
    res = publish_adapter.publish_draft_sync(article, "wxA", "sek")

    assert res["media_id"] == "mid-1"
    # Images offloaded to mmbiz; no base64 left in the content sent to WeChat.
    assert "data:image/png;base64,AAAA" not in captured["html"]
    assert "mmbiz.qpic.cn/uploaded" in captured["html"]
    assert captured["creds"] == ("wxA", "sek")
    # H7:失败清单为空时也必须带上(加法字段)
    assert res["image_failures"] == []


def test_publish_draft_passes_through_image_failures(monkeypatch):
    """H7:process_html_images 的失败清单必须透传到 publish_draft_sync 结果。"""
    monkeypatch.setattr(
        publish_adapter, "process_for_wechat",
        lambda html, css, profile="wechat": html,
    )
    failures = [{"src": "http://img.example.com/a.png", "reason": "图床防盗链"}]
    monkeypatch.setattr(
        wechat_service, "process_html_images",
        lambda html, *, appid, appsecret: (html, failures),
    )
    monkeypatch.setattr(
        wechat_service, "create_draft",
        lambda **kw: {"media_id": "mid-2"},
    )
    res = publish_adapter.publish_draft_sync({"title": "t", "html": "<p>x</p>", "css": ""}, "wxA", "sek")
    assert res["media_id"] == "mid-2"
    assert res["image_failures"] == failures
