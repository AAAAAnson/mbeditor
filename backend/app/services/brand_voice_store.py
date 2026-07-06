# backend/app/services/brand_voice_store.py
"""音色档案存储(data/brand_voices.json)。单档案、无账号。

学一次 -> 持久化 -> 每篇由 context_engine 注入马鞍中间谷底。镜像 credentials.py
持久化(原子写 + chmod 600)。
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)
_CONFIG_FILENAME = "brand_voices.json"


class VoiceTraits(BaseModel):
    tone: str = ""                                          # 语气总述
    signatures: list[str] = Field(default_factory=list)    # 标志性措辞/口头禅
    cadence: str = ""                                      # 节奏(长短句)
    banned_words: list[str] = Field(default_factory=list)  # 个人忌用词


class BrandVoice(BaseModel):
    updated_at: str = ""
    source_excerpt: str = ""                               # 旧文摘录(前 200 字)
    traits: VoiceTraits = Field(default_factory=VoiceTraits)


def _data_dir() -> Path:
    return Path(os.environ.get("APP_DATA_DIR") or "/app/data")


def _config_path() -> Path:
    return _data_dir() / _CONFIG_FILENAME


def load() -> Optional[BrandVoice]:
    """读 brand_voices.json;缺失/损坏 -> None。"""
    path = _config_path()
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("brand_voices.json is corrupt; ignoring")
        return None
    if not isinstance(data, dict):
        return None
    try:
        return BrandVoice.model_validate(data)
    except Exception:  # noqa: BLE001 - any schema drift -> treat as absent
        logger.warning("brand_voices.json shape invalid; ignoring")
        return None


def save(voice: BrandVoice) -> None:
    """原子写 + chmod 600。data 卷不可写 -> AppError。"""
    path = _config_path()
    payload = {"version": 1, **voice.model_dump()}
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
            message=f"写入音色档案失败,请检查数据卷 {path.parent} 是否已挂载且可写: {exc}",
        ) from exc
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def clear() -> None:
    """清空音色档案(幂等删文件)。"""
    try:
        _config_path().unlink()
    except (FileNotFoundError, OSError):
        pass


# 音色 traits 抽取的结构化 schema(VoiceTraits 四字段)。
_VOICE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "tone": {"type": "string"},
        "signatures": {"type": "array", "items": {"type": "string"}},
        "cadence": {"type": "string"},
        "banned_words": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tone", "signatures", "cadence", "banned_words"],
    "additionalProperties": False,
}

_VOICE_SYSTEM = (
    "你是中文公众号编辑的音色分析师。读用户贴的旧文,提炼其个人写作音色:"
    "tone(语气总述,如「温柔治愈」)、signatures(标志性措辞/口头禅,数组)、"
    "cadence(句子节奏,如「短句多」)、banned_words(明显个人忌用词,数组,没有则空)。"
    "只输出 JSON,不要解释。"
)


def extract_voice_traits(sample: str, *, provider) -> BrandVoice:
    """贴旧文 -> 调一次 LLM 抽 traits -> 组 BrandVoice(不落盘,调用方决定 save)。

    Args:
        sample: 用户贴的旧文全文。
        provider: 实现 ``call_structured(system, user, schema)`` 的 LLMProvider。

    Raises:
        AppError: 样本为空(不浪费一次 LLM 调用)。
        LLM*: provider 内部失败原样上抛(调用方映射成 SSE error)。
    """
    sample = (sample or "").strip()
    if not sample:
        raise AppError(code=400, message="请先贴一段旧文,才能学习你的音色")
    excerpt = sample[:200]
    user = f"旧文如下,请提炼音色:\n\n{sample}"
    data = provider.call_structured(_VOICE_SYSTEM, user, _VOICE_SCHEMA)
    traits = VoiceTraits(
        tone=str(data.get("tone", "") or ""),
        signatures=[str(s) for s in (data.get("signatures") or []) if isinstance(s, str)],
        cadence=str(data.get("cadence", "") or ""),
        banned_words=[str(w) for w in (data.get("banned_words") or []) if isinstance(w, str)],
    )
    return BrandVoice(
        updated_at=datetime.now(timezone.utc).isoformat(),
        source_excerpt=excerpt,
        traits=traits,
    )
