from fastapi import APIRouter

from app.api.v1.articles import router as articles_router
from app.api.v1.images import router as images_router
from app.api.v1.wechat import router as wechat_router
from app.api.v1.publish import router as publish_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(articles_router)
api_router.include_router(images_router)
api_router.include_router(wechat_router)
api_router.include_router(publish_router)
