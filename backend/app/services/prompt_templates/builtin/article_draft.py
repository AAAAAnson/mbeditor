# backend/app/services/prompt_templates/builtin/article_draft.py
"""「正文起草」+「正文终稿」内置模板。

article_author 行文工序据 tone 选「正文起草」生成首版;「正文终稿」用于
二次精修(去重、收尾、节奏校准)。马鞍:硬约束(字数/语气/广告法/微信安全)
进 head_rules+tail_format 两驼峰,软引导/示例进谷底。
"""
from __future__ import annotations

from app.services.prompt_templates.schema import FewShot, PromptTemplate

# 微信公众号正文写作的硬约束摘要——头驼峰。广告法只警示不硬切(spec §8)。
_WECHAT_BODY_RULES: list[str] = [
    "你是资深公众号主笔,为中文读者写一篇可直接排版发布的推文正文。",
    "正文用 Markdown:一级标题用 `# `,小节用 `## `,段落之间空一行。",
    "全篇 700–1100 字;开头两句必须抓人,不要寒暄、不要复述标题。",
    "口语、具体、有画面;少用形容词堆叠;全文感叹号不超过 2 个。",
    "不编造数据、人名、引文;不确定的事实用模糊表述而非杜撰。",
    "避免「最/第一/唯一/国家级」等《广告法》敏感绝对化用语(仅警示,可改写规避)。",
]

# 输出格式硬约束——尾驼峰。
_BODY_TAIL_FORMAT: list[str] = [
    "只输出正文本身,不要解释、不要前后缀、不要包代码围栏。",
    "首行必须是 `# 标题`(一行,不超过 24 字),其后空一行再写正文。",
]

DRAFT_BODY = PromptTemplate(
    id="draft_body_v1",
    version=1,
    intent="正文起草",
    stage="行文",
    scene="一句话意图 + 受众 + 调子 → 整篇正文首版",
    role="资深公众号主笔",
    head_rules=_WECHAT_BODY_RULES,
    middle_guidance=[
        "先在心里搭三段式骨架(由头→展开→收束),再落笔,避免流水账。",
        "结合给定受众调整称呼与举例;结合给定调子调整句式与情绪浓度。",
    ],
    few_shots=[
        FewShot(
            user="意图:整理旧书架翻到十年前的笔记;受众:生活同好;调子:温柔治愈",
            assistant=(
                "# 十年前那本笔记,替我记得我早忘了的事\n\n"
                "纸页比记忆诚实。翻到第三页,我才想起那年冬天自己究竟在怕什么——"
                "字迹潦草得像在赶时间,却把当时的犹豫一笔笔留了下来……"
            ),
        ),
    ],
    tail_format=_BODY_TAIL_FORMAT,
    output_mode="markdown",
)

FINAL_BODY = PromptTemplate(
    id="final_body_v1",
    version=1,
    intent="正文终稿",
    stage="行文",
    scene="对已有草稿做精修:去重、强化收尾、校准节奏",
    role="资深公众号主笔(终稿校订)",
    head_rules=[
        "你在为一篇已成形的公众号草稿做终稿校订,保持原意与主标题不变。",
        "删冗余、并重复;让开头更钩人、结尾更落地(给读者一个动作或回味)。",
        "保持 Markdown 结构(`# `/`## `/空行段落);全篇字数浮动不超过原稿 ±15%。",
        "避免《广告法》绝对化用语(仅警示)。",
    ],
    middle_guidance=[
        "逐段问:这句删了读者会不会损失信息?会就留,不会就删。",
        "结尾避免「让我们」式空喊,落到一个具体的小动作或一句留白。",
    ],
    tail_format=_BODY_TAIL_FORMAT,
    output_mode="markdown",
)

# 本模块导出的模板(供 builtin/__init__.py 聚合)。
TEMPLATES: list[PromptTemplate] = [DRAFT_BODY, FINAL_BODY]
