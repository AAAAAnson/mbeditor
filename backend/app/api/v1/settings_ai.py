# backend/app/api/v1/settings_ai.py
"""BYOK LLM provider 配置 + 品牌音色 设置端点。

同源、无鉴权(开源单实例)。密钥只写不回显:PUT 收 api_key,GET 只报
keyConfigured。镜像 settings.py / credentials.py 范式。
"""
from __future__ import annotations

import dataclasses

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.exceptions import AppError
from app.core.response import success
from app.services import brand_voice_store as bv
from app.services.llm import build_provider, provider_store
from app.services.llm.errors import (
    LLMConnectionError,
    LLMError,
    LLMQuotaExceeded,
    LLMRateLimited,
    LLMTimeout,
    LLMTruncated,
    LLMUnavailable,
)

router = APIRouter(prefix="/settings", tags=["settings"])


class LlmPutReq(BaseModel):
    provider: str = "openai_compat"
    base_url: str = ""
    model: str = ""
    # None 保留已存 key,"" 清除,非空设置。
    api_key: str | None = None


class LlmTestReq(BaseModel):
    provider: str = ""
    base_url: str = ""
    model: str = ""
    api_key: str | None = None


class VoicePutReq(BaseModel):
    sample: str = ""


def _voice_view() -> dict:
    voice = bv.load()
    if voice is None:
        return {"configured": False, "traits": None, "updated_at": "", "source_excerpt": ""}
    return {
        "configured": True,
        "traits": voice.traits.model_dump(),
        "updated_at": voice.updated_at,
        "source_excerpt": voice.source_excerpt,
    }


# --- BYOK provider ----------------------------------------------------------
@router.get("/llm")
async def get_llm():
    """Redacted view(provider/base_url/model/keyConfigured/source);never returns key."""
    return success(provider_store.redacted())


@router.put("/llm")
async def put_llm(req: LlmPutReq):
    """Set/keep/clear BYOK config. api_key None=keep, ""=clear, else set."""
    existing = provider_store.load()
    if req.api_key is None:
        api_key = existing.api_key if existing else ""
    else:
        api_key = req.api_key
    cfg = provider_store.LLMProviderConfig(
        provider=(req.provider or "openai_compat").strip(),
        base_url=(req.base_url or "").strip(),
        model=(req.model or "").strip(),
        api_key=api_key,
    )
    provider_store.save(cfg)
    return success(provider_store.redacted())


@router.post("/llm/test")
def test_llm(req: LlmTestReq):
    # sync def:FastAPI 自动丢 threadpool,同步探针不阻塞事件循环(SSE 流不受影响)。
    """Build a spec from pending form values(blank -> stored/env)and REALLY probe it.

    H4 真测通:配置完整时真发一次最小 call_text(短超时防向导卡死),按异常
    类型归因 -> {ok, detail, code}(code 是加法字段:quota/auth/network/other,
    ok:true 不带 code)。配置不完整仍走旧短路,响应形状只加字段。
    """
    pending = provider_store.LLMProviderConfig(
        provider=(req.provider or "").strip(),
        base_url=(req.base_url or "").strip(),
        model=(req.model or "").strip(),
        api_key=(req.api_key or "").strip() if req.api_key is not None else "",
    )
    spec = provider_store.resolve_spec(pending)
    try:
        # 短超时:探活用,不给默认 60s 拖死向导。
        prov = build_provider(dataclasses.replace(spec, timeout=15.0))
    except Exception:  # noqa: BLE001 - unknown provider / bad spec
        return success({"ok": False, "detail": "未知的 provider 或配置不完整。", "code": "other"})
    if not prov.is_available():
        return success({
            "ok": False,
            "detail": "缺少 key / base_url / model,暂不可用。",
            "code": "other",
        })
    try:
        # max_tokens 给足 256:anthropic call_text 带 adaptive thinking,
        # 太小会被 400 拒或截断;截断(LLMTruncated)本身即证明密钥可用连通。
        prov.call_text("你是连通性探针,请只回复「ok」。", "hi", max_tokens=256)
    except LLMTruncated:
        return success({"ok": True, "detail": "连接成功,密钥可用。"})
    except LLMRateLimited:
        return success({
            "ok": False,
            "detail": "AI 服务限流,稍等片刻再试。",
            "code": "network",
        })
    except LLMQuotaExceeded:
        return success({
            "ok": False,
            "detail": "余额不足,去服务商控制台充值后再试。",
            "code": "quota",
        })
    except LLMUnavailable:
        return success({
            "ok": False,
            "detail": "密钥无效或未授权,请检查 API Key。",
            "code": "auth",
        })
    except (LLMTimeout, LLMConnectionError):
        return success({
            "ok": False,
            "detail": "连不上 AI 服务,请检查网络或接口地址后重试。",
            "code": "network",
        })
    except LLMError:
        return success({
            "ok": False,
            "detail": "连接测试没通过,请检查模型与配置后再试。",
            "code": "other",
        })
    except Exception:  # noqa: BLE001 - 未知异常兜底,不给 500 打断向导
        return success({
            "ok": False,
            "detail": "连接测试没通过,请检查模型与配置后再试。",
            "code": "other",
        })
    return success({"ok": True, "detail": "连接成功,密钥可用。"})


# --- brand voice ------------------------------------------------------------
@router.get("/voice")
async def get_voice():
    return success(_voice_view())


@router.put("/voice")
async def put_voice(req: VoicePutReq):
    """贴旧文 -> 调一次 LLM 抽 traits -> 落盘。空样本 / 未配 key / LLM 失败均给可读错误。"""
    sample = (req.sample or "").strip()
    if not sample:
        raise AppError(code=400, message="请先贴一段旧文,才能学习你的音色")
    spec = provider_store.resolve_spec(None)
    prov = build_provider(spec)
    if not prov.is_available():
        raise AppError(code=400, message="请先在「AI 引擎」配置模型 key,再学习音色")
    try:
        voice = bv.extract_voice_traits(sample, provider=prov)
    except LLMError:
        raise AppError(code=502, message="学习音色时 AI 调用失败,请稍后重试或检查模型配置")
    bv.save(voice)
    return success(_voice_view())


@router.delete("/voice")
async def delete_voice():
    bv.clear()
    return success(_voice_view())
