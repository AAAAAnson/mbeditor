from fastapi import APIRouter, UploadFile, File

from app.core.response import success
from app.services import image_service

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    content = await file.read()
    record = image_service.upload_image(file.filename or "image.png", content)
    return success(record)


@router.get("")
async def list_images():
    return success(image_service.list_images())


@router.delete("/{image_id}")
async def delete_image(image_id: str):
    image_service.delete_image(image_id)
    return success(message="deleted")
