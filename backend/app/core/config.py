from pydantic_settings import BaseSettings


APP_VERSION = "3.0.0"
GITHUB_REPO = "AAAAAnson/mbeditor"


class Settings(BaseSettings):
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024
    IMAGES_DIR: str = "/app/data/images"
    ARTICLES_DIR: str = "/app/data/articles"
    CONFIG_FILE: str = "/app/data/config.json"

    model_config = {"env_prefix": ""}


settings = Settings()
