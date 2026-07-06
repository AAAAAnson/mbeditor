# backend/app/services/prompt_templates/builtin/misc_intents.py
"""五意图内置模板:选题灵感 / 标题生成 / 改写换语气 / 摘要 / 封面文案。

与 article_draft 的正文两件套合起来凑满 spec §5.5 的七意图。结构化输出
(选题/封面文案)给 output_schema,供 provider.call_structured 走 json_object。
"""
from __future__ import annotations

from app.services.prompt_templates.schema import FewShot, PromptTemplate

# 选题灵感:产出若干候选选题(结构化)。
TOPIC_IDEAS = PromptTemplate(
    id="topic_ideas_v1",
    version=1,
    intent="选题灵感",
    stage="立意",
    scene="给定领域/受众 → 几个可写的选题角度",
    role="公众号选题策划",
    head_rules=[
        "你是公众号选题策划,据用户给的领域与受众产出可立即开写的选题。",
        "每个选题要有差异化角度,避免大而空;贴近受众真实关切。",
    ],
    middle_guidance=[
        "优先「小切口+强共鸣」,而非宏大叙事。",
    ],
    tail_format=[
        "只输出 JSON,形如 {\"topics\":[{\"title\":\"...\",\"angle\":\"...\"}]}。",
        "topics 给 3–5 条,title 不超过 20 字,angle 一句话说清切入点。",
    ],
    output_mode="structured",
    output_schema={
        "type": "object",
        "properties": {
            "topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "angle": {"type": "string"},
                    },
                    "required": ["title", "angle"],
                },
            }
        },
        "required": ["topics"],
    },
)

# 标题生成:给正文/意图产出多个候选标题(纯文本,逐行)。
TITLE_GEN = PromptTemplate(
    id="title_gen_v1",
    version=1,
    intent="标题生成",
    stage="行文",
    scene="据正文或意图产出多个候选标题",
    role="公众号标题手",
    head_rules=[
        "你是公众号标题手,产出既准确又有点击欲的中文标题。",
        "不做标题党、不浮夸承诺;每条不超过 24 字。",
    ],
    middle_guidance=[
        "可混用:利益点式 / 悬念式 / 数字式 / 共鸣式,覆盖不同风格。",
    ],
    few_shots=[
        FewShot(
            user="正文讲周末带娃去海洋馆的治愈感",
            assistant="海洋馆里的两小时,我把手机收了起来",
        ),
    ],
    tail_format=[
        "只输出标题,每行一个,5 条;不要编号、不要引号、不要解释。",
    ],
    output_mode="text",
)

# 改写换语气:保持信息不变,切换语气。
REWRITE_TONE = PromptTemplate(
    id="rewrite_tone_v1",
    version=1,
    intent="改写换语气",
    stage="行文",
    scene="原文 + 目标语气 → 同义改写",
    role="文字润色师",
    head_rules=[
        "你是文字润色师,在不改变事实与核心信息的前提下改写为目标语气。",
        "保持原文段落结构与 Markdown 标记;不增删关键信息。",
    ],
    middle_guidance=[
        "目标语气体现在句式、用词、情绪浓度,而非堆砌语气词。",
    ],
    tail_format=[
        "只输出改写后的正文,不要解释、不要前后缀、不要代码围栏。",
    ],
    output_mode="markdown",
)

# 摘要:压缩为短摘要(纯文本)。
SUMMARIZE = PromptTemplate(
    id="summarize_v1",
    version=1,
    intent="摘要",
    stage="自检",
    scene="长正文 → 一段话摘要(用于导语/分享语)",
    role="编辑",
    head_rules=[
        "你是编辑,把正文压成一段不超过 80 字的中文摘要,覆盖核心信息。",
        "不加入正文没有的事实;不喊口号;读起来像导语。",
    ],
    tail_format=[
        "只输出摘要正文本身,一段,不超过 80 字,不要换行、不要引号。",
    ],
    output_mode="text",
)

# 封面文案:封面主副标(结构化)。
COVER_COPY = PromptTemplate(
    id="cover_copy_v1",
    version=1,
    intent="封面文案",
    stage="制版",
    scene="据标题/正文产出封面主标 + 副标",
    role="封面文案师",
    head_rules=[
        "你是封面文案师,产出适合公众号封面图的主标题与副标题。",
        "主标抓眼球、不超过 12 字;副标补充信息、不超过 20 字。",
    ],
    tail_format=[
        "只输出 JSON,形如 {\"main\":\"...\",\"sub\":\"...\"}。",
    ],
    output_mode="structured",
    output_schema={
        "type": "object",
        "properties": {
            "main": {"type": "string"},
            "sub": {"type": "string"},
        },
        "required": ["main", "sub"],
    },
)

TEMPLATES: list[PromptTemplate] = [
    TOPIC_IDEAS,
    TITLE_GEN,
    REWRITE_TONE,
    SUMMARIZE,
    COVER_COPY,
]
