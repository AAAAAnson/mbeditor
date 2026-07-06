import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.response import success
from app.models.mbdoc import MBDoc
from app.services import publish_adapter
from app.services.article_to_mbdoc import article_to_mbdoc, mbdoc_to_article
from app.services.legacy_render_pipeline import preview_html, process_for_wechat as _process_for_wechat
from app.services.mbdoc_store import load_mbdoc
from app.services.render_for_wechat import render_for_wechat
from app.services.block_registry import RenderContext

router = APIRouter(prefix="/publish", tags=["publish"])


class PreviewReq(BaseModel):
    html: str
    css: str = ""
    profile: str = "wechat"


class ProcessForCopyReq(BaseModel):
    html: str
    css: str = ""
    # appid/appsecret 只在需要把图片上传到公众号素材库时才用。没传或为空字符串
    # 时后端会跳过上传步骤，返回仅做本地净化 + CSS inline 的 HTML。
    appid: str = ""
    appsecret: str = ""
    profile: str = "wechat"


class MBDocPreviewReq(BaseModel):
    """Preview request for MBDoc document."""
    doc_id: str
    profile: str = "wechat"


class MBDocProcessForCopyReq(BaseModel):
    """Process for copy request for MBDoc document."""
    doc_id: str
    appid: str = ""
    appsecret: str = ""
    profile: str = "wechat"


class ImportHtmlReq(BaseModel):
    """Reverse-import an HTML article into an MBDoc."""
    article_id: str
    title: str = ""
    html: str = ""
    css: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""
    mode: str = "html"
    markdown: str = ""
    profile: str = "wechat"


@router.post("/import-html")
async def import_html(req: ImportHtmlReq):
    """Reverse-import an HTML article into an MBDoc block document.

    Returns the MBDoc JSON. Malicious markup (scripts, on* handlers,
    javascript:/data: URLs) is stripped/dropped during import rather than
    causing a 500 — the endpoint always returns 200 for parseable input.
    """
    try:
        doc = article_to_mbdoc(
            article_id=req.article_id,
            title=req.title,
            html=req.html,
            css=req.css,
            markdown=req.markdown,
            mode=req.mode,
            author=req.author,
            digest=req.digest,
            cover=req.cover,
        )
    except ValueError as exc:
        # Bad article_id (path separators / unicode) etc.
        raise HTTPException(status_code=400, detail=str(exc))
    return success(doc.model_dump(mode="json"))


@router.post("/preview")
async def preview_wechat(req: PreviewReq):
    return success({"html": preview_html(req.html, req.css, profile=req.profile)})


@router.post("/process-for-copy")
async def process_html_for_copy(req: ProcessForCopyReq):
    # ``process_html_for_copy`` performs blocking sync-httpx image fetches inside
    # ``inline_images_as_data_uris``; calling it directly would stall the asyncio
    # event loop for the duration of every <img> download. Offload to the default
    # thread-pool executor — same pattern the ``/wechat/draft`` route uses for its
    # sync work.
    #
    # Note: no Playwright rasterize step anymore. WeChat-safe SVG is authored
    # correctly up-front; ``validate_html`` runs inside the adapter and its
    # report is returned to the caller. The frontend is responsible for hard-
    # gating on ``report.issues`` — backend only reports, never blocks.
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: publish_adapter.process_html_for_copy(
            req.html, req.css, appid=req.appid, appsecret=req.appsecret,
            profile=req.profile,
        ),
    )
    return success({"html": result["html"], "report": result["report"]})


@router.post("/mbdoc/preview")
async def preview_mbdoc(req: MBDocPreviewReq):
    """Preview an MBDoc document."""
    doc = load_mbdoc(req.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {req.doc_id} not found")

    # Render MBDoc to HTML using the new render pipeline. The profile rides on
    # the RenderContext so the inner HtmlRenderer sanitize pass agrees with the
    # outer legacy preview pass (avoids the double-sanitize trap).
    ctx = RenderContext(upload_images=False, profile=req.profile)
    html = render_for_wechat(doc, ctx)

    # Also generate legacy preview for compatibility
    legacy_html = preview_html(html, profile=req.profile)

    return success({
        "html": legacy_html,
        "raw_html": html,
        "block_count": len(doc.blocks),
    })


@router.post("/mbdoc/process-for-copy")
async def process_mbdoc_for_copy(req: MBDocProcessForCopyReq):
    """Process an MBDoc document for copying to clipboard."""
    doc = load_mbdoc(req.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {req.doc_id} not found")
    
    # Render MBDoc to HTML
    ctx = RenderContext(upload_images=False, profile=req.profile)
    html = render_for_wechat(doc, ctx)

    # Process through the legacy pipeline for WeChat compatibility
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: publish_adapter.process_html_for_copy(
            html, "", appid=req.appid, appsecret=req.appsecret,
            profile=req.profile,
        ),
    )
    return success({"html": result["html"], "report": result["report"]})
