# backend/app/services/article_author.py
"""五工序编排:立意->行文->制版->自检->核验->收尾。逐段 emit SSE 帧 str。

emit 收一条已序列化好的 SSE 帧(sse_events.* 产物)。本函数永不抛到端点:
所有 LLM* / 异常都转成 error_event 下发后 return。真流式由端点用线程桥实现
(见 agent_generate.py),本函数只需顺序调 emit。
"""
from __future__ import annotations

from typing import Callable, Optional

from app.core.config import settings
from app.services import aigc_label, content_safety, layout_composer
from app.services.context_engine import SaddleInput, build_saddle_prompt
from app.services.llm.base import build_provider
from app.services.llm.errors import (
    LLMConnectionError, LLMQuotaExceeded, LLMRateLimited, LLMRefusal,
    LLMSchemaMismatch, LLMServerError, LLMTimeout, LLMTruncated, LLMUnavailable,
)
from app.services.llm.provider_store import LLMProviderConfig, resolve_spec
from app.services.prompt_templates.schema import get_template
from app.services.rewrite_prompt import build_rewrite_messages, parse_title_variants
from app.services.sse_events import (
    done_event, error_event, rewrite_done_event, stage_event, title_event,
    token_event,
)
from app.services.svg_validator import validate_html

Emit = Callable[[str], None]

# tone -> 排版模板 id(契约圣经 §6.1)。未命中 -> 文艺手札兜底。
_TONE_TO_TEMPLATE: dict[str, str] = {
    "温柔治愈": "tpl_literary",
    "干货利落": "tpl_biz_minimal",
    "俏皮带梗": "tpl_vibrant",
    "克制高级": "tpl_magazine",
}
_DEFAULT_TEMPLATE = "tpl_literary"

# (异常类, ErrorCode, 默认中文)。isinstance 顺序匹配——更具体的在前。
_LLM_TO_CODE: tuple[tuple[type, str, str], ...] = (
    (LLMUnavailable,     "no_provider",     "还没配置模型 key,填一个就能开始"),
    # H4:余额不足(402)专项文案——指向充值;code 复用既有闭集(不新增
    # AgentErrorCode,SSE/chat 帧契约零改),绝不落「格式不符/重试」引导。
    (LLMQuotaExceeded,   "stream_error",    "AI 平台余额不足,请到服务商控制台充值后再试"),
    (LLMTimeout,         "llm_timeout",     "AI 生成超时,换个说法或重试"),
    (LLMRateLimited,     "llm_rate_limit",  "AI 接口限流,稍后再试"),
    (LLMRefusal,         "llm_refusal",     "AI 拒绝了该请求"),
    (LLMTruncated,       "validate_failed", "AI 输出被截断,已拦截"),
    (LLMSchemaMismatch,  "validate_failed", "AI 输出格式不符,已拦截"),
    (LLMServerError,     "stream_error",    "AI 服务端错误,稍后再试"),
    (LLMConnectionError, "stream_error",    "AI 服务连接失败,稍后再试"),
)


def map_llm_error(exc: Exception) -> tuple[str, str]:
    """LLM* -> (code, 中文message)。未知 -> ('stream_error', 通用语)。"""
    for exc_type, code, msg in _LLM_TO_CODE:
        if isinstance(exc, exc_type):
            if isinstance(exc, LLMRefusal) and getattr(exc, "category", ""):
                msg = f"AI 拒绝了该请求（{exc.category}）"
            return code, msg
    return "stream_error", "AI 服务暂时不可用,请稍后再试"


def _template_id_for(tone: str) -> str:
    return _TONE_TO_TEMPLATE.get(tone, _DEFAULT_TEMPLATE)


def _split_title_body(markdown: str) -> tuple[str, str]:
    """从行文 Markdown 首个 `# ` 行抽标题;无则取首句前 24 字。返回 (title, markdown)。"""
    for line in markdown.splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip(), markdown
    first = next((l.strip() for l in markdown.splitlines() if l.strip()), "")
    return (first[:24] or "未命名"), markdown


def generate_article(
    intent: str,
    audience: str,
    tone: str,
    *,
    voice_sample: str = "",
    use_brand_voice: bool = True,
    provider_override: Optional[LLMProviderConfig] = None,
    emit: Emit,
) -> None:
    """跑完五工序,每个里程碑调 emit 下发一条 SSE 帧。永不抛到端点。"""
    # 1) provider 就绪检查
    spec = resolve_spec(provider_override)
    provider = build_provider(spec)
    if not provider.is_available():
        emit(error_event("no_provider", "还没配置模型 key,填一个就能开始"))
        return

    # 2) 立意:选模板
    emit(stage_event("立意", "active"))
    template_id = _template_id_for(tone)
    try:
        tpl = get_template("正文起草")
    except Exception:
        tpl = None
    emit(stage_event("立意", "done", f"调子：{tone or '默认'}"))

    # 3) 行文:拼马鞍 -> 流式
    emit(stage_event("行文", "active"))
    head_rules = list(tpl.head_rules) if tpl else []
    tail_format = list(tpl.tail_format) if tpl else []
    head_rules.append(f"目标受众：{audience or '泛读'}；调子：{tone or '自然'}。")
    brand_traits = ""
    if use_brand_voice:
        try:
            from app.services import brand_voice_store
            voice = brand_voice_store.load()
            if voice is not None:
                brand_traits = voice.traits.tone
        except Exception:
            brand_traits = ""
    saddle = build_saddle_prompt(SaddleInput(
        head_rules=head_rules,
        tail_format=tail_format or ["用 Markdown，首行 `# 标题`，正文分段。"],
        brand_traits=brand_traits,
        few_shots=list(tpl.few_shots) if tpl else [],
        user_material=voice_sample,
    ))
    user_msg = saddle.user + ("\n\n写作主题：" + intent if intent else "")

    # 行文流式:provider 不发 title 事件时(国产 OpenAI 兼容 / Claude 现都只流
    # 正文 token),缓冲首行、抽出 `# 标题`(无 # 取首句前 24 字)后**于首个 token
    # 前** emit title,再放出缓冲的 token——保证「生成剧场」标题先出。首行迟迟不
    # 来(无换行的超长首行)则 80 字封顶兜底,不把整条流憋到末尾。所有 char 仍逐字
    # emit(body_parts 全量收集,token 计数 == 正文长度)。
    title_sent = False
    body_parts: list[str] = []
    pending: list[str] = []  # 标题未定前缓冲的首行 token

    def _flush_pending() -> None:
        for ch in pending:
            emit(token_event(ch))
        pending.clear()

    def _emit_title_from_line(line: str) -> None:
        s = line.strip()
        text = (s[2:].strip() if s.startswith("# ") else s[:24]) or "未命名"
        emit(title_event(text))

    try:
        for ev in provider.stream_text(saddle.system, [{"role": "user", "content": user_msg}]):
            if ev.kind == "title" and not title_sent:
                emit(title_event(ev.text))
                title_sent = True
                _flush_pending()
            elif ev.kind == "token":
                body_parts.append(ev.text)
                if title_sent:
                    emit(token_event(ev.text))
                    continue
                pending.append(ev.text)
                buffered = "".join(pending)
                nl = buffered.find("\n")
                if nl != -1 or len(buffered) > 80:
                    _emit_title_from_line(buffered[:nl] if nl != -1 else buffered)
                    title_sent = True
                    _flush_pending()
    except Exception as exc:
        code, msg = map_llm_error(exc)
        emit(error_event(code, msg))
        return

    if not title_sent:  # 流结束仍无标题(极短/无换行正文)——兜底抽取并放出缓冲
        title_fallback, _ = _split_title_body("".join(body_parts))
        emit(title_event(title_fallback))
        title_sent = True
        _flush_pending()

    markdown = "".join(body_parts)
    title, markdown = _split_title_body(markdown)
    emit(stage_event("行文", "done", f"约 {len(markdown)} 字"))

    # 4) 制版:套排版模板
    emit(stage_event("制版", "active"))
    html = layout_composer.compose(markdown, template_id=template_id)
    emit(stage_event("制版", "done"))

    # 5) 自检:svg_validator,有 issue 时降级纯净排版(<=1 次降级,不硬切毁体验)
    emit(stage_event("自检", "active"))
    report = validate_html(html)
    if report["issues"]:
        html = layout_composer.compose_plain(markdown)
        report = validate_html(html)
        if report["issues"]:
            # 纯净排版仍不过(理论不可达)——硬切,绝不泄漏未过闸内容。
            emit(error_event("validate_failed", "排版自检未通过,已拦截"))
            return
    emit(stage_event("自检", "done", f"{len(report['warnings'])} 处提示"))

    # 6) 核验:内容安全(默认关)
    emit(stage_event("核验", "active"))
    verdict = content_safety.review(markdown)
    if verdict.blocked:
        emit(error_event("safety_block", verdict.message or "内容含违规风险，换个说法"))
        return
    emit(stage_event("核验", "done"))

    # 7) 收尾:AIGC 标识(默认关)-> done
    html, markdown, aigc = aigc_label.apply(html, markdown)
    emit(done_event(html=html, markdown=markdown, report=report, aigc=aigc))


# ── AI 修改闭环(/agent/rewrite)────────────────────────────────────────────


def _ready_provider(provider_override: Optional[LLMProviderConfig], emit: Emit):
    """resolve+build,不可用则 emit no_provider 并返回 None。"""
    spec = resolve_spec(provider_override)
    provider = build_provider(spec)
    if not provider.is_available():
        emit(error_event("no_provider", "还没配置模型 key,填一个就能开始"))
        return None
    return provider


def rewrite_text(
    scope: str,
    *,
    selected_text: str = "",
    instruction: str = "",
    title: str = "",
    article_text: str = "",
    provider_override: Optional[LLMProviderConfig] = None,
    emit: Emit,
) -> None:
    """轻量改写(block/digest/title)。永不抛到端点。

    block/digest:token* -> rewrite_done(text 为权威全文)。
    title:不发 token,单发 rewrite_done(variants 恰位候选)。
    """
    provider = _ready_provider(provider_override, emit)
    if provider is None:
        return
    system, user = build_rewrite_messages(
        scope=scope, selected_text=selected_text, instruction=instruction,
        title=title, article_text=article_text,
    )
    parts: list[str] = []
    try:
        for ev in provider.stream_text(system, [{"role": "user", "content": user}]):
            if ev.kind != "token":
                continue
            parts.append(ev.text)
            if scope != "title":
                emit(token_event(ev.text))
    except Exception as exc:
        code, msg = map_llm_error(exc)
        emit(error_event(code, msg))
        return
    text = "".join(parts).strip()
    if scope == "title":
        emit(rewrite_done_event("", parse_title_variants(text)))
    else:
        emit(rewrite_done_event(text, []))


def rewrite_article(
    *,
    article_text: str,
    instruction: str = "",
    tone: str = "",
    provider_override: Optional[LLMProviderConfig] = None,
    emit: Emit,
) -> None:
    """整篇改写(换调子/缩长度)。帧序列与 generate_article 同构
    (stage/title/token/done),生成层 UI 可复用;html 同样过 svg_validator
    与内容安全闸。永不抛到端点。
    """
    provider = _ready_provider(provider_override, emit)
    if provider is None:
        return

    emit(stage_event("立意", "active"))
    template_id = _template_id_for(tone)
    emit(stage_event("立意", "done", f"调子：{tone or '保持原样'}"))

    emit(stage_event("行文", "active"))
    system, user = build_rewrite_messages(
        scope="article", instruction=instruction, article_text=article_text,
        tone=tone,
    )
    # 与 generate_article 同款「标题先行」缓冲:首行(或 80 字)抽标题后放行 token。
    title_sent = False
    body_parts: list[str] = []
    pending: list[str] = []

    def _flush_pending() -> None:
        for ch in pending:
            emit(token_event(ch))
        pending.clear()

    try:
        for ev in provider.stream_text(system, [{"role": "user", "content": user}]):
            if ev.kind == "title" and not title_sent:
                emit(title_event(ev.text))
                title_sent = True
                _flush_pending()
            elif ev.kind == "token":
                body_parts.append(ev.text)
                if title_sent:
                    emit(token_event(ev.text))
                    continue
                pending.append(ev.text)
                buffered = "".join(pending)
                nl = buffered.find("\n")
                if nl != -1 or len(buffered) > 80:
                    line = buffered[:nl] if nl != -1 else buffered
                    s = line.strip()
                    emit(title_event((s[2:].strip() if s.startswith("# ") else s[:24]) or "未命名"))
                    title_sent = True
                    _flush_pending()
    except Exception as exc:
        code, msg = map_llm_error(exc)
        emit(error_event(code, msg))
        return

    if not title_sent:
        title_fallback, _ = _split_title_body("".join(body_parts))
        emit(title_event(title_fallback))
        _flush_pending()

    markdown = "".join(body_parts)
    _, markdown = _split_title_body(markdown)
    emit(stage_event("行文", "done", f"约 {len(markdown)} 字"))

    emit(stage_event("制版", "active"))
    html = layout_composer.compose(markdown, template_id=template_id)
    emit(stage_event("制版", "done"))

    emit(stage_event("自检", "active"))
    report = validate_html(html)
    if report["issues"]:
        html = layout_composer.compose_plain(markdown)
        report = validate_html(html)
        if report["issues"]:
            emit(error_event("validate_failed", "排版自检未通过,已拦截"))
            return
    emit(stage_event("自检", "done", f"{len(report['warnings'])} 处提示"))

    emit(stage_event("核验", "active"))
    verdict = content_safety.review(markdown)
    if verdict.blocked:
        emit(error_event("safety_block", verdict.message or "内容含违规风险，换个说法"))
        return
    emit(stage_event("核验", "done"))

    html, markdown, aigc = aigc_label.apply(html, markdown)
    emit(done_event(html=html, markdown=markdown, report=report, aigc=aigc))
