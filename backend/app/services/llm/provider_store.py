# backend/app/services/llm/provider_store.py
"""BYOK provider 配置存储(data/llm_provider.json)。

镜像 gateway.py / credentials.py 的持久化:原子写(tmp + os.replace)、
chmod 600、惰性 data-dir。api_key 只写不回显;redacted() 永不返回 key。
取值优先级在 resolve_spec():请求带的 > 存储 > env。
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from app.core.config import settings
from app.core.exceptions import AppError
from app.services.llm.base import ModelSpec

logger = logging.getLogger(__name__)
_CONFIG_FILENAME = "llm_provider.json"


class LLMProviderConfig(BaseModel):
    provider: str = "openai_compat"          # "openai_compat" | "anthropic"
    base_url: str = ""
    model: str = ""
    api_key: str = ""                         # 只写不回显


def _data_dir() -> Path:
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _config_path() -> Path:
    return _data_dir() / _CONFIG_FILENAME


def load() -> Optional[LLMProviderConfig]:
    """读 llm_provider.json;缺失/损坏 -> None(降级到 env)。"""
    path = _config_path()
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("llm_provider.json is corrupt; degrading to env")
        return None
    if not isinstance(data, dict):
        return None
    return LLMProviderConfig(
        provider=str(data.get("provider", "") or "openai_compat"),
        base_url=str(data.get("base_url", "") or ""),
        model=str(data.get("model", "") or ""),
        api_key=str(data.get("api_key", "") or ""),
    )


def save(cfg: LLMProviderConfig) -> None:
    """原子写 + chmod 600。data 卷不可写 -> AppError(500, 可读中文)。"""
    path = _config_path()
    payload = {
        "version": 1,
        "provider": cfg.provider,
        "base_url": cfg.base_url,
        "model": cfg.model,
        "api_key": cfg.api_key,
    }
    tmp = path.with_suffix(".json.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, path)
    except OSError as exc:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise AppError(
            code=500,
            message=f"写入模型配置失败,请检查数据卷 {path.parent} 是否已挂载且可写: {exc}",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def clear() -> None:
    """删除 llm_provider.json(幂等)。"""
    try:
        _config_path().unlink()
    except (FileNotFoundError, OSError):
        pass


def redacted() -> dict:
    """设置页视图:返回 provider/base_url/model + keyConfigured 布尔,绝不返回 key。"""
    cfg = load()
    if cfg is None:
        return {
            "provider": settings.LLM_PROVIDER,
            "base_url": settings.LLM_BASE_URL,
            "model": settings.LLM_MODEL,
            "keyConfigured": bool(settings.LLM_API_KEY),
            "source": "env",
        }
    return {
        "provider": cfg.provider,
        "base_url": cfg.base_url,
        "model": cfg.model,
        "keyConfigured": bool(cfg.api_key),
        "source": "stored",
    }


def resolve_spec(req: Optional[LLMProviderConfig] = None) -> ModelSpec:
    """取值优先级:请求带的 > 存储 > env。逐字段独立 fallback(非整体)。

    每字段 coalesce:req.<f> 非空 -> 存储.<f> 非空 -> env。最终组装 ModelSpec。
    """
    stored = load()

    def pick(field: str, env_val: str) -> str:
        if req is not None and getattr(req, field):
            return getattr(req, field)
        if stored is not None and getattr(stored, field):
            return getattr(stored, field)
        return env_val

    return ModelSpec(
        provider=pick("provider", settings.LLM_PROVIDER),
        base_url=pick("base_url", settings.LLM_BASE_URL),
        model=pick("model", settings.LLM_MODEL),
        api_key=pick("api_key", settings.LLM_API_KEY),
    )
