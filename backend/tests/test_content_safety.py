# backend/tests/test_content_safety.py
"""内容安全 hook(app.services.content_safety)单测。

契约:CONTENT_SAFETY_ENABLED 默认 false -> review() 永远放行(blocked=False);
开启后由可插拔 provider 给裁决,高风险 -> blocked=True(article_author 据此 emit safety_block)。
"""
import pytest

from app.services import content_safety as cs


@pytest.fixture(autouse=True)
def _safety_off(monkeypatch):
    # 显式钉死默认关,隔离环境变量污染。
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", False)
    yield


def test_disabled_passes_any_text():
    verdict = cs.review("买它最便宜全网第一保证治愈百病")
    assert verdict.blocked is False
    assert verdict.label == "pass"
    assert verdict.message == ""


def test_enabled_no_provider_fails_open(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()
    verdict = cs.review("任意文本")
    assert verdict.blocked is False
    assert verdict.label == "error"          # fail-open:审核不可用但放行
    assert verdict.message == ""


def test_enabled_provider_blocks_high_risk(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()

    def _hit(_text: str) -> cs.SafetyVerdict:
        return cs.SafetyVerdict(blocked=True, label="block",
                                message="内容含违规风险，换个说法", category="politics")

    cs.register_provider(_hit)
    verdict = cs.review("敏感内容")
    assert verdict.blocked is True
    assert verdict.label == "block"
    assert verdict.category == "politics"
    assert "换个说法" in verdict.message


def test_enabled_first_block_short_circuits(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()
    calls: list[str] = []

    def _first(_t: str) -> cs.SafetyVerdict:
        calls.append("first")
        return cs.SafetyVerdict(blocked=True, label="block", message="拦")

    def _second(_t: str) -> cs.SafetyVerdict:
        calls.append("second")
        return cs.SafetyVerdict(blocked=False, label="pass")

    cs.register_provider(_first)
    cs.register_provider(_second)
    verdict = cs.review("x")
    assert verdict.blocked is True
    assert calls == ["first"]                # 首个 block 即短路,第二个不跑


def test_provider_exception_fails_open(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()

    def _boom(_t: str) -> cs.SafetyVerdict:
        raise RuntimeError("云接口超时")

    cs.register_provider(_boom)
    verdict = cs.review("x")
    assert verdict.blocked is False          # provider 抛错也 fail-open
    assert verdict.label == "error"


def test_aliyun_stub_provider_passes_by_default(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()
    cs.register_provider(cs.make_aliyun_provider(access_key="", secret=""))
    verdict = cs.review("任意正文")
    assert verdict.blocked is False          # 占位未配 key -> 放行
    assert verdict.label == "pass"


def test_tianyu_stub_provider_passes_by_default(monkeypatch):
    monkeypatch.setattr(cs.settings, "CONTENT_SAFETY_ENABLED", True)
    cs.reset_providers()
    cs.register_provider(cs.make_tianyu_provider(secret_id="", secret_key=""))
    verdict = cs.review("任意正文")
    assert verdict.blocked is False
    assert verdict.label == "pass"
