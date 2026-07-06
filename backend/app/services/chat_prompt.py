# backend/app/services/chat_prompt.py
"""/agent/chat 的 system prompt 构造(T0 能力清单,批4,spec §5)。

能力清单正文在 ``prompt_templates/agent_capabilities.md``(必死清单 + 合法能力
词表摘要 + 设计原则 + 旧 5 套版式灵感参考 + 工作纪律),本模块只负责读盘
(启动后缓存)并拼上角色/流程头。纯函数、无网络 IO。
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_CAPABILITIES_PATH = (
    Path(__file__).resolve().parent / "prompt_templates" / "agent_capabilities.md"
)

# 角色 + 会话流程头(工具协议由 provider 侧的 tools 定义承载,这里只讲纪律)。
_ROLE_HEADER = """你是公众号文章的排版与改稿助手,通过工具直接修改一篇已排版的文章。
文章被切成顺序块(block),你用工具按块 id 读写;系统会对每次写入自动做微信合规清洗,
并在工具返回值里给出 repairs(已等价修补)与 violations(被剥除项 + 中文修复指令 fix_hint)。
所有面向用户的回复用纯中文口语:对话正文里禁止出现任何 HTML 标签、隐藏元素或
markdown 记号(星号/井号/反引号等),HTML 只能作为工具调用的参数传入,绝不写进
对话正文;动手前先说一句你打算怎么改,改完用一两句话总结。

下面是微信排版的硬约束与工作方式,必须遵守:
"""


@lru_cache(maxsize=1)
def load_agent_capabilities() -> str:
    """读能力清单 markdown(进程内缓存;文件随包分发,读失败即部署损坏,直接抛)。"""
    return _CAPABILITIES_PATH.read_text(encoding="utf-8")


# 对话文案纪律(P2 批1):对话正文纯中文口语,禁 HTML/markdown 记号,改文章一律走工具。
_CONVERSATION_STYLE = """

【对话回复纪律】对话回复只用纯中文口语,禁止输出 HTML 标签或 markdown 记号
(`**`、`##`、反引号等);要改文章一律用工具,不要把 HTML 贴进对话正文。
"""


def build_chat_system_prompt() -> str:
    """/agent/chat 的完整 system prompt:角色头 + T0 能力清单 + 对话文案纪律。"""
    return _ROLE_HEADER + "\n" + load_agent_capabilities() + _CONVERSATION_STYLE
