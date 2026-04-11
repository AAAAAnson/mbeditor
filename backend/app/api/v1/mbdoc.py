"""REST API for MBDoc CRUD + rendering.

This router is the HTTP surface for the MBDoc block-based document
model. It exposes the canonical rendering entry point
(``render_for_wechat``) through an ``/{id}/render`` endpoint so CLI
and AI Agent callers can produce WeChat-compatible HTML without
opening a browser.

The legacy ``/articles`` endpoint continues to run in parallel and is
not affected by anything in this module. The two paths will be unified
in Stage 6.
"""
from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.core.response import success
from app.models.mbdoc import MBDoc
from app.services.block_registry import RenderContext
from app.services.mbdoc_storage import MBDocNotFoundError, MBDocStorage
from app.services.render_for_wechat import render_for_wechat


router = APIRouter(prefix="/mbdoc", tags=["mbdoc"])


def _storage() -> MBDocStorage:
    return MBDocStorage()


@router.post("")
async def create_mbdoc(doc: MBDoc):
    """Create or replace an MBDoc. Idempotent by id."""
    _storage().save(doc)
    return success(doc.model_dump())


@router.get("")
async def list_mbdocs():
    storage = _storage()
    summaries: List[dict] = []
    for mid in storage.list_ids():
        try:
            d = storage.get(mid)
        except MBDocNotFoundError:
            # Race: file was deleted between list_ids() and get().
            continue
        summaries.append({"id": d.id, "title": d.meta.title})
    return success(summaries)


@router.get("/{mbdoc_id}")
async def get_mbdoc(mbdoc_id: str):
    try:
        doc = _storage().get(mbdoc_id)
    except MBDocNotFoundError:
        raise HTTPException(status_code=404, detail=f"MBDoc not found: {mbdoc_id}")
    return success(doc.model_dump())


@router.put("/{mbdoc_id}")
async def update_mbdoc(mbdoc_id: str, doc: MBDoc):
    if doc.id != mbdoc_id:
        raise HTTPException(
            status_code=400,
            detail=f"MBDoc id mismatch: path={mbdoc_id!r} body={doc.id!r}",
        )
    _storage().save(doc)
    return success(doc.model_dump())


@router.delete("/{mbdoc_id}")
async def delete_mbdoc(mbdoc_id: str):
    try:
        _storage().delete(mbdoc_id)
    except MBDocNotFoundError:
        raise HTTPException(status_code=404, detail=f"MBDoc not found: {mbdoc_id}")
    return success({"id": mbdoc_id})


@router.post("/{mbdoc_id}/render")
async def render_mbdoc(
    mbdoc_id: str,
    upload_images: bool = Query(
        default=False,
        description="When true, renderers should swap image src to WeChat CDN URLs.",
    ),
):
    """Render an MBDoc to final HTML.

    Stage 1: ``upload_images`` is accepted but no real uploader is wired.
    Text-only docs yield identical HTML for both values. Stage 3 adds
    the real uploader for image blocks.
    """
    try:
        doc = _storage().get(mbdoc_id)
    except MBDocNotFoundError:
        raise HTTPException(status_code=404, detail=f"MBDoc not found: {mbdoc_id}")

    ctx = RenderContext(upload_images=upload_images, image_uploader=None)
    html = render_for_wechat(doc, ctx)
    return success({"html": html, "uploaded_images": upload_images})
