from app.services import legacy_render_pipeline


def test_process_for_wechat_runs_inline_then_sanitize(monkeypatch):
    calls = []

    def fake_inline(html: str, css: str = "") -> str:
        calls.append(("inline", html, css))
        return "<section>inlined</section>"

    def fake_sanitize(html: str) -> str:
        calls.append(("sanitize", html))
        return "<section>sanitized</section>"

    monkeypatch.setattr(
        "app.services.legacy_render_pipeline.inline_css",
        fake_inline,
    )
    monkeypatch.setattr(
        "app.services.legacy_render_pipeline.sanitize_for_wechat",
        fake_sanitize,
    )

    result = legacy_render_pipeline.process_for_wechat("<p>Hello</p>", "p { color: red; }")

    assert result == "<section>sanitized</section>"
    assert calls == [
        ("inline", "<p>Hello</p>", "p { color: red; }"),
        ("sanitize", "<section>inlined</section>"),
    ]


def test_preview_html_is_an_alias_of_shared_pipeline(monkeypatch):
    calls = {}

    def fake_process(html: str, css: str = "") -> str:
        calls["args"] = (html, css)
        return "<section>preview</section>"

    monkeypatch.setattr(
        "app.services.legacy_render_pipeline.process_for_wechat",
        fake_process,
    )

    result = legacy_render_pipeline.preview_html("<p>Hello</p>", "p { color: red; }")

    assert result == "<section>preview</section>"
    assert calls["args"] == ("<p>Hello</p>", "p { color: red; }")
