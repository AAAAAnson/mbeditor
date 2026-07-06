# backend/app/services/content_safety.py
"""内容安全 hook(默认关)。

第一刀只内置「可插拔 provider 接口 + 阿里云/腾讯天御占位适配」,不接真实云。
开关 CONTENT_SAFETY_ENABLED 默认 false:review() 直接放行(BYOK 自托管者
按需自接合规云)。开启后,未注册 provider 时 fail-open(放行 + label="error")
以免误杀首篇体验;高风险裁决 -> blocked=True,article_author 据此 emit
error_event("safety_block")。绝不抛到端点。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.core.config import settings

# 裁决标签三态。"pass" 放行;"block" 高风险拦截;"error" 审核不可用(fail-open 放行)。
SafetyLabel = str  # "pass" | "block" | "error"


@dataclass(frozen=True)
class SafetyVerdict:
    """单次文本审核结果。blocked=True 时 article_author emit safety_block 并拦 done。"""
    blocked: bool
    label: SafetyLabel = "pass"
    message: str = ""          # 中文,可直接展示(blocked 时非空)
    category: str = ""         # 命中类目(色情/暴恐/政治…),provider 给则透传


# provider 签名:吃正文纯文本,吐裁决。注册多个则按注册序短路(首个 block 即停)。
SafetyProvider = Callable[[str], SafetyVerdict]

_PROVIDERS: list[SafetyProvider] = []


def register_provider(provider: SafetyProvider) -> None:
    """注册一个审核 provider(自托管者在启动钩子里接阿里云/天御实现)。"""
    _PROVIDERS.append(provider)


def reset_providers() -> None:
    """清空已注册 provider(测试隔离用)。"""
    _PROVIDERS.clear()


def review(text: str) -> SafetyVerdict:
    """审核正文。开关关 -> 放行;无 provider -> fail-open;命中高风险 -> blocked。"""
    if not settings.CONTENT_SAFETY_ENABLED:
        return SafetyVerdict(blocked=False, label="pass")
    if not _PROVIDERS:
        # 开了开关却没接 provider:fail-open,不毁首篇体验。
        return SafetyVerdict(blocked=False, label="error")
    for provider in _PROVIDERS:
        try:
            verdict = provider(text)
        except Exception:  # noqa: BLE001 — provider 抛错一律 fail-open
            return SafetyVerdict(blocked=False, label="error")
        if verdict.blocked:
            return verdict
    return SafetyVerdict(blocked=False, label="pass")


# —— 占位适配器(第一刀不发网络请求;自托管者填实)——
# 形状刻意贴合两云的「批量文本审核」返回:label + 命中类目。接真实云时,把
# 内部实现换成调用对应 SDK/HTTP 即可,review() 编排逻辑无需改。


def make_aliyun_provider(*, access_key: str, secret: str) -> SafetyProvider:
    """阿里云内容安全(green)文本审核占位。

    未配 key -> 放行(label="pass")。接真实云:在此函数内调
    aliyunsdkgreen 的 TextScan,把 suggestion=="block" 映射成 blocked=True。
    """

    def _provider(text: str) -> SafetyVerdict:
        if not (access_key and secret):
            return SafetyVerdict(blocked=False, label="pass")
        # 占位:配了 key 也暂不真实调用,放行并标 error 提示「适配器待实现」。
        return SafetyVerdict(blocked=False, label="error",
                             message="阿里云内容安全适配器待实现")

    return _provider


def make_tianyu_provider(*, secret_id: str, secret_key: str) -> SafetyProvider:
    """腾讯天御(TMS)文本审核占位。

    未配 key -> 放行。接真实云:在此函数内调天御 TextModeration,把
    EvilFlag!=0 / Suggestion=="Block" 映射成 blocked=True + category。
    """

    def _provider(text: str) -> SafetyVerdict:
        if not (secret_id and secret_key):
            return SafetyVerdict(blocked=False, label="pass")
        return SafetyVerdict(blocked=False, label="error",
                             message="腾讯天御内容安全适配器待实现")

    return _provider
