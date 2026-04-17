import pytest

from app.models.mbdoc import MBDoc, MBDocMeta, RasterBlock, SvgBlock
from app.services.block_registry import BlockRegistry, RenderContext
from app.services.raster_worker import RasterRenderError
from app.services.render_for_wechat import render_for_wechat
from app.services.renderers.svg_renderer import SvgValidationError


def test_registry_default_uses_real_svg_and_raster_renderers():
    registry = BlockRegistry.default()
    assert registry.find(SvgBlock(id="svg1", source="<svg viewBox='0 0 10 10'></svg>").type).__class__.__name__ == "SvgRenderer"
    assert registry.find(
        RasterBlock(id="r1", html="<div>Card</div>", css="div{color:red;}", width=640).type
    ).__class__.__name__ == "RasterRenderer"


def test_svg_renderer_preserves_safe_inline_svg():
    doc = MBDoc(
        id="d-svg",
        meta=MBDocMeta(title="SVG"),
        blocks=[
            SvgBlock(
                id="svg1",
                source=(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
                    '<rect x="2" y="2" width="20" height="20" rx="4" fill="#e8553a"/>'
                    '<text x="12" y="14" text-anchor="middle" font-size="8" fill="#ffffff">Hi</text>'
                    "</svg>"
                ),
            )
        ],
    )
    html = render_for_wechat(doc, RenderContext())
    assert "<svg" in html
    assert "<rect" in html
    assert "Hi" in html
    assert "stub" not in html.lower()


def test_raster_renderer_emits_non_stub_markup():
    from app.services.renderers import raster_renderer as raster_renderer_mod

    original = raster_renderer_mod.render_raster_png
    raster_renderer_mod.render_raster_png = lambda block: b"fake-png"
    try:
        doc = MBDoc(
            id="d-raster",
            meta=MBDocMeta(title="Raster"),
            blocks=[
                RasterBlock(
                    id="r1",
                    html='<div><strong>Raster fallback</strong><p>Grid-like card</p></div>',
                    css="div{padding:24px;background:#fff7ed;border:1px solid #fdba74;border-radius:16px;}",
                    width=640,
                )
            ],
        )
        html = render_for_wechat(doc, RenderContext())
    finally:
        raster_renderer_mod.render_raster_png = original
    assert "<img" in html
    assert "data:image/png;base64" in html
    assert "max-width:640px" in html
    assert "stub" not in html.lower()


def test_raster_renderer_publish_without_uploader_raises(monkeypatch):
    from app.services.renderers import raster_renderer as raster_renderer_mod

    monkeypatch.setattr(raster_renderer_mod, "render_raster_png", lambda block: b"fake-png")

    doc = MBDoc(
        id="d-raster-pub",
        meta=MBDocMeta(title="T"),
        blocks=[RasterBlock(id="r1", html="<div>x</div>", css="", width=320)],
    )
    with pytest.raises(RasterRenderError, match="requires an image_uploader"):
        render_for_wechat(doc, RenderContext(upload_images=True))


def test_raster_renderer_publish_routes_through_uploader(monkeypatch):
    from app.services.renderers import raster_renderer as raster_renderer_mod

    recorded: dict = {}

    def _fake_png(block):
        recorded["width"] = block.width
        return b"\x89PNG-FAKE"

    def _fake_uploader(png_bytes: bytes, filename: str) -> str:
        recorded["bytes"] = png_bytes
        recorded["filename"] = filename
        return "https://mmbiz.qpic.cn/raster-cdn.png"

    monkeypatch.setattr(raster_renderer_mod, "render_raster_png", _fake_png)

    doc = MBDoc(
        id="d-raster-cdn",
        meta=MBDocMeta(title="T"),
        blocks=[RasterBlock(id="r1", html="<div>x</div>", css="", width=480)],
    )
    html = render_for_wechat(
        doc,
        RenderContext(upload_images=True, image_uploader=_fake_uploader),
    )

    assert "data:image/png;base64" not in html, "publish html must not carry data: URL"
    assert 'src="https://mmbiz.qpic.cn/raster-cdn.png"' in html
    assert recorded["bytes"] == b"\x89PNG-FAKE"
    assert recorded["filename"].startswith("raster-")
    assert recorded["filename"].endswith(".png")
    assert recorded["width"] == 480


def test_svg_renderer_allows_remote_image_href_in_preview():
    doc = MBDoc(
        id="d-svg-preview",
        meta=MBDocMeta(title="T"),
        blocks=[
            SvgBlock(
                id="s1",
                source=(
                    '<svg xmlns="http://www.w3.org/2000/svg" '
                    'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
                    '<image href="https://example.com/a.png" width="10" height="10"/>'
                    "</svg>"
                ),
            )
        ],
    )
    html = render_for_wechat(doc, RenderContext(upload_images=False))
    assert "<image" in html
    assert "https://example.com/a.png" in html


def test_svg_renderer_rejects_remote_image_href_at_publish():
    doc = MBDoc(
        id="d-svg-pub",
        meta=MBDocMeta(title="T"),
        blocks=[
            SvgBlock(
                id="s1",
                source=(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
                    '<image href="https://example.com/a.png" width="10" height="10"/>'
                    "</svg>"
                ),
            )
        ],
    )
    with pytest.raises(SvgValidationError, match="remote href"):
        render_for_wechat(doc, RenderContext(upload_images=True))


def test_svg_renderer_rejects_xlink_remote_image_href_at_publish():
    doc = MBDoc(
        id="d-svg-xlink",
        meta=MBDocMeta(title="T"),
        blocks=[
            SvgBlock(
                id="s1",
                source=(
                    '<svg xmlns="http://www.w3.org/2000/svg" '
                    'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
                    '<image xlink:href="http://cdn.example/a.png" width="10" height="10"/>'
                    "</svg>"
                ),
            )
        ],
    )
    with pytest.raises(SvgValidationError, match="remote href"):
        render_for_wechat(doc, RenderContext(upload_images=True))


def test_svg_renderer_allows_svg_level_href_on_use_element():
    """Only <image> remote href is rejected; non-image <use href="#..."> is separately banned by id rule."""
    doc = MBDoc(
        id="d-svg-plain",
        meta=MBDocMeta(title="T"),
        blocks=[
            SvgBlock(
                id="s1",
                source=(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
                    '<circle cx="8" cy="8" r="6" fill="#e8553a"/>'
                    "</svg>"
                ),
            )
        ],
    )
    html_preview = render_for_wechat(doc, RenderContext(upload_images=False))
    html_publish = render_for_wechat(
        doc,
        RenderContext(upload_images=True, image_uploader=lambda b, n: "x"),
    )
    assert html_preview == html_publish
