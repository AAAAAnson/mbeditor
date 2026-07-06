# backend/tests/test_brand_voice_store.py
"""音色档案存储(data/brand_voices.json)。单档案、无账号。镜像 credentials 持久化。"""
import json

import pytest

from app.core.exceptions import AppError
from app.services import brand_voice_store as bv
from app.services.brand_voice_store import BrandVoice, VoiceTraits


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def test_save_load_roundtrip():
    voice = BrandVoice(
        updated_at="2026-06-15T00:00:00Z",
        source_excerpt="旧文前 200 字…",
        traits=VoiceTraits(
            tone="温柔治愈",
            signatures=["愿你被世界温柔以待"],
            cadence="短句多",
            banned_words=["最", "第一"],
        ),
    )
    bv.save(voice)
    got = bv.load()
    assert got is not None
    assert got.updated_at == "2026-06-15T00:00:00Z"
    assert got.source_excerpt == "旧文前 200 字…"
    assert got.traits.tone == "温柔治愈"
    assert got.traits.signatures == ["愿你被世界温柔以待"]
    assert got.traits.cadence == "短句多"
    assert got.traits.banned_words == ["最", "第一"]


def test_load_missing_returns_none():
    assert bv.load() is None


def test_persisted_file_shape(tmp_path):
    bv.save(BrandVoice(updated_at="t", traits=VoiceTraits(tone="干货利落")))
    raw = json.loads((tmp_path / "brand_voices.json").read_text(encoding="utf-8"))
    assert raw["version"] == 1
    assert raw["updated_at"] == "t"
    assert raw["traits"]["tone"] == "干货利落"
    assert raw["traits"]["signatures"] == []


def test_corrupt_file_degrades_to_none(tmp_path):
    (tmp_path / "brand_voices.json").write_text("{not json", encoding="utf-8")
    assert bv.load() is None


def test_clear_is_idempotent():
    bv.clear()  # nothing written -> no raise
    bv.save(BrandVoice(traits=VoiceTraits(tone="x")))
    bv.clear()
    assert bv.load() is None


def test_readonly_volume_raises_apperror(tmp_path, monkeypatch):
    missing = tmp_path / "nope" / "deeper"
    monkeypatch.setenv("APP_DATA_DIR", str(missing))
    (tmp_path / "nope").write_text("x", encoding="utf-8")
    with pytest.raises(AppError):
        bv.save(BrandVoice(traits=VoiceTraits(tone="x")))


def test_default_traits_are_empty():
    t = VoiceTraits()
    assert t.tone == ""
    assert t.signatures == []
    assert t.cadence == ""
    assert t.banned_words == []


class _FakeProvider:
    """Minimal stand-in for LLMProvider.call_structured."""

    def __init__(self, result: dict):
        self._result = result
        self.calls: list[tuple[str, str, dict]] = []

    def call_structured(self, system: str, user: str, schema: dict) -> dict:
        self.calls.append((system, user, schema))
        return self._result


def test_extract_voice_traits_builds_brandvoice():
    fake = _FakeProvider({
        "tone": "温柔治愈",
        "signatures": ["愿你被温柔以待"],
        "cadence": "短句多",
        "banned_words": ["最"],
    })
    sample = "这是一段很长的旧文，" * 40  # > 200 chars
    voice = bv.extract_voice_traits(sample, provider=fake)
    assert isinstance(voice, BrandVoice)
    assert voice.traits.tone == "温柔治愈"
    assert voice.traits.signatures == ["愿你被温柔以待"]
    assert voice.traits.banned_words == ["最"]
    # source_excerpt 截前 200 字。
    assert voice.source_excerpt == sample[:200]
    assert len(voice.source_excerpt) == 200
    assert voice.updated_at  # 非空时间戳
    # 单次 LLM 调用,结构化 schema 含四 traits 字段。
    assert len(fake.calls) == 1
    _, user, schema = fake.calls[0]
    assert sample[:200] in user
    assert set(schema.get("properties", {})) >= {"tone", "signatures", "cadence", "banned_words"}


def test_extract_voice_traits_tolerates_partial_result():
    fake = _FakeProvider({"tone": "干货利落"})  # 缺字段 -> 用默认
    voice = bv.extract_voice_traits("短样本", provider=fake)
    assert voice.traits.tone == "干货利落"
    assert voice.traits.signatures == []
    assert voice.traits.cadence == ""
    assert voice.traits.banned_words == []
    assert voice.source_excerpt == "短样本"  # 短于 200 字原样


def test_extract_voice_traits_blank_sample_raises():
    fake = _FakeProvider({"tone": "x"})
    with pytest.raises(AppError):
        bv.extract_voice_traits("   ", provider=fake)
    assert fake.calls == []  # 空样本不浪费一次 LLM 调用
