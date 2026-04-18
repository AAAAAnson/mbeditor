from fastapi import APIRouter, Query

from app.core.response import success
from app.services import runs_service

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
async def list_runs(limit: int = Query(20, ge=1, le=100)):
    return success(runs_service.list_runs(limit=limit))
