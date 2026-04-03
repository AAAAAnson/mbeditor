from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.response import fail


class AppError(Exception):
    def __init__(self, code: int = 1, message: str = "error"):
        self.code = code
        self.message = message
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=200,
            content=fail(code=exc.code, message=exc.message),
        )

    @app.exception_handler(Exception)
    async def global_error_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content=fail(code=500, message=str(exc)),
        )
