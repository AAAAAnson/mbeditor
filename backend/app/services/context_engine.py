# backend/app/services/context_engine.py
"""马鞍(saddle)prompt 拼装。硬约束在头尾驼峰,软料在谷底,超预算从谷底砍。

砍序固定 历史 -> 素材 -> few_shots -> 品牌(SaddleInput 字段对应:
history -> user_material -> few_shots -> brand_traits)。头尾驼峰永不裁。
token 估算与 agent_svg_prompt.system_prompt_word_count 同口径:
中文字 1/个 + ASCII [A-Za-z0-9_]+ 词 1/个。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.prompt_templates.schema import FewShot

_CJK_RE = re.compile(r"[一-鿿]")
_ASCII_WORD_RE = re.compile(r"[A-Za-z0-9_]+")


@dataclass
class SaddleInput:
    head_rules: list[str]                          # 头驼峰硬约束(微信白名单摘要[仅美化意图]/字数/语气/广告法警示)
    tail_format: list[str]                         # 尾驼峰硬约束(输出格式)
    brand_traits: str = ""                         # 谷底:品牌音色(倒数第 4 被砍)
    few_shots: list[FewShot] = field(default_factory=list)  # 谷底:示例
    user_material: str = ""                        # 谷底:用户贴的素材/voice_sample
    history: str = ""                              # 谷底:历史(最先砍)
    token_budget: int = 6000                       # 中文近似 token 预算


@dataclass
class SaddlePrompt:
    system: str        # 头驼峰 head_rules + 尾驼峰 tail_format 合成的系统提示
    user: str          # 谷底软料 + 实际意图合成的用户消息
    dropped: list[str] # 被裁掉的谷底段名(供测试断言裁剪顺序)


def estimate_tokens(text: str) -> int:
    """中文按字数近似:中文字 1/个 + ASCII 词 1/个。与 svg prompt 同口径。"""
    chinese = len(_CJK_RE.findall(text))
    ascii_words = len(_ASCII_WORD_RE.findall(text))
    return chinese + ascii_words


# —— 谷底段名常量:与 SaddleInput 字段、裁剪顺序一一对应 ——
# 砍序(从先到后):历史 -> 素材 -> few_shots -> 品牌。
_VALLEY_ORDER: tuple[str, ...] = ("history", "user_material", "few_shots", "brand_traits")

# 谷底段在 user 文本里的中文小标题(渲染用)。
_VALLEY_LABELS: dict[str, str] = {
    "brand_traits": "【品牌音色】",
    "few_shots": "【参考示例】",
    "user_material": "【素材】",
    "history": "【历史】",
}

# user 文本里谷底各段的渲染顺序(品牌在前、历史在后,阅读顺序;与裁剪顺序无关)。
_VALLEY_RENDER_ORDER: tuple[str, ...] = ("brand_traits", "few_shots", "user_material", "history")

_INTENT_TAIL = "请据以上信息开始写作。"


def _render_few_shots(few_shots: list[FewShot]) -> str:
    """few_shots 渲染成「示例N:输入/输出」块。空列表 -> 空串。"""
    if not few_shots:
        return ""
    blocks = []
    for i, fs in enumerate(few_shots, 1):
        blocks.append(f"示例{i}:\n输入:{fs.user}\n输出:{fs.assistant}")
    return "\n\n".join(blocks)


def _valley_segment(name: str, saddle: SaddleInput) -> str:
    """取某谷底段的原始文本(few_shots 特殊渲染)。空 -> 空串。"""
    if name == "few_shots":
        return _render_few_shots(saddle.few_shots)
    return getattr(saddle, name) or ""


def _compose_system(saddle: SaddleInput) -> str:
    """头驼峰 head_rules + 尾驼峰 tail_format 合成 system(永不裁)。"""
    parts = list(saddle.head_rules) + list(saddle.tail_format)
    return "\n".join(parts)


def _compose_user(saddle: SaddleInput, dropped: set[str]) -> str:
    """谷底各段(未被 dropped 的)按阅读顺序渲染 + 意图尾巴。"""
    chunks: list[str] = []
    for name in _VALLEY_RENDER_ORDER:
        if name in dropped:
            continue
        seg = _valley_segment(name, saddle)
        if seg:
            chunks.append(f"{_VALLEY_LABELS[name]}\n{seg}")
    chunks.append(_INTENT_TAIL)
    return "\n\n".join(chunks)


def build_saddle_prompt(saddle: SaddleInput) -> SaddlePrompt:
    """拼马鞍。先全量组装,超 token_budget 则按 历史->素材->few_shots->品牌 顺序
    从谷底逐段丢弃,直到落入预算;头尾驼峰(硬约束)永不裁。返回 SaddlePrompt。
    """
    system = _compose_system(saddle)
    dropped: list[str] = []

    def total_tokens(u: str) -> int:
        # system(头尾驼峰)计入总预算,但永不被裁——只裁谷底来腾预算。
        return estimate_tokens(system) + estimate_tokens(u)

    user = _compose_user(saddle, set(dropped))
    # 谷底按固定砍序逐段丢弃,直到落入预算或谷底砍空。
    for name in _VALLEY_ORDER:
        if total_tokens(user) <= saddle.token_budget:
            break
        # 空段(没东西可砍)跳过不记,保证 dropped 反映实际内容裁剪 + 砍序前缀连续。
        if not _valley_segment(name, saddle):
            continue
        dropped.append(name)
        user = _compose_user(saddle, set(dropped))

    return SaddlePrompt(system=system, user=user, dropped=dropped)
