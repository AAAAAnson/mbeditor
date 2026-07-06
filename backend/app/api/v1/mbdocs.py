"""MBDoc CRUD API endpoints."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.response import success
from app.models.mbdoc import Block, MBDoc, MBDocMeta
from app.services.mbdoc_store import delete_mbdoc, list_mbdocs, load_mbdoc, save_mbdoc

router = APIRouter(prefix="/mbdocs", tags=["mbdocs"])


class MBDocCreateRequest(BaseModel):
    """Request to create a new MBDoc."""
    title: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""
    blocks: List[Block] = []


class MBDocUpdateRequest(BaseModel):
    """Request to update an MBDoc."""
    title: Optional[str] = None
    author: Optional[str] = None
    digest: Optional[str] = None
    cover: Optional[str] = None
    blocks: Optional[List[Block]] = None


@router.get("")
async def list_documents():
    """List all MBDoc documents."""
    docs = list_mbdocs()
    return success(docs)


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get a single MBDoc by ID."""
    doc = load_mbdoc(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return success(doc.model_dump())


@router.post("")
async def create_document(req: MBDocCreateRequest):
    """Create a new MBDoc."""
    doc_id = uuid.uuid4().hex[:8]

    doc = MBDoc(
        id=doc_id,
        meta=MBDocMeta(
            title=req.title,
            author=req.author,
            digest=req.digest,
            cover=req.cover,
        ),
        blocks=req.blocks,
    )

    save_mbdoc(doc)
    return success(doc.model_dump())


@router.put("/{doc_id}")
async def update_document(doc_id: str, req: MBDocUpdateRequest):
    """Update an existing MBDoc."""
    doc = load_mbdoc(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    if req.title is not None:
        doc.meta.title = req.title
    if req.author is not None:
        doc.meta.author = req.author
    if req.digest is not None:
        doc.meta.digest = req.digest
    if req.cover is not None:
        doc.meta.cover = req.cover
    if req.blocks is not None:
        doc.blocks = req.blocks

    save_mbdoc(doc)
    return success(doc.model_dump())


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete an MBDoc."""
    if not delete_mbdoc(doc_id):
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return success({"deleted": True, "id": doc_id})
