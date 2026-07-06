from typing import Optional

from pydantic_settings import BaseSettings


APP_VERSION = "6.0.0"
GITHUB_REPO = "AAAAAnson/mbeditor"


class Settings(BaseSettings):
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024
    CORS_ALLOWED_ORIGINS: str = "http://localhost:7073,http://127.0.0.1:7073"

    # Claude / Anthropic LLM integration (P1-4). Key is env-only; never
    # hardcoded or logged. When ANTHROPIC_API_KEY is unset the agent SVG
    # author falls back to the deterministic template stub.
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-opus-4-8"
    ANTHROPIC_TIMEOUT: float = 30.0

    # BYOK LLM config (env fallback; web config takes precedence via
    # provider_store.resolve_spec). Platform keys stay env-only.
    LLM_PROVIDER: str = "openai_compat"   # "openai_compat" | "anthropic"
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""
    LLM_API_KEY: str = ""
    # Compliance hooks default OFF (article_author gates on these).
    CONTENT_SAFETY_ENABLED: bool = False
    AIGC_LABEL_ENABLED: bool = False

    model_config = {"env_prefix": ""}


settings = Settings()
