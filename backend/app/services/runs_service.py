from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.services import article_service
from app.services.wechat_service import load_config

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _normalize_text(value: str) -> str:
    return _WS_RE.sub(" ", value).strip()


def _html_to_text(value: str) -> str:
    return _normalize_text(_HTML_TAG_RE.sub(" ", value))


def _body_text(article: dict[str, Any]) -> str:
    markdown = _normalize_text(article.get("markdown", ""))
    html_text = _html_to_text(article.get("html", ""))
    if article.get("mode") == "markdown":
        return markdown or html_text
    return html_text or markdown


def _status_for(*, has_body: bool, wechat_ready: bool) -> tuple[str, str, str, int]:
    if not has_body:
        return ("empty", "空稿件", "暂无正文内容", 20)
    if not wechat_ready:
        return ("draft", "待配置", "正文已就绪，待配置公众号", 72)
    return ("ready", "可投递", "可进入预览与投递链路", 100)


def _publish_event(*, has_body: bool, wechat_ready: bool) -> tuple[str, str]:
    if not has_body:
        return ("warning", "发布链路未就绪 · 当前稿件还没有正文内容")
    if not wechat_ready:
        return ("warning", "发布链路未就绪 · 公众号 AppID / AppSecret 尚未配置")
    return ("fact", "发布链路可用 · 可调用 /api/v1/publish/process 与 /draft")


def _record_for(article: dict[str, Any], *, wechat_ready: bool) -> dict[str, Any]:
    article_id = article["id"]
    html = article.get("html", "")
    markdown = article.get("markdown", "")
    body_text = _body_text(article)
    has_body = bool(body_text)
    status, status_label, step_label, readiness_pct = _status_for(
        has_body=has_body,
        wechat_ready=wechat_ready,
    )
    publish_event_kind, publish_event_text = _publish_event(
        has_body=has_body,
        wechat_ready=wechat_ready,
    )
    created_at = article.get("created_at") or datetime.now(timezone.utc).isoformat()
    updated_at = article.get("updated_at") or created_at

    return {
        "id": article_id,
        "kind": "article_activity",
        "source": f"articles/{article_id}.json",
        "article_id": article_id,
        "article_title": article.get("title", "Untitled"),
        "mode": article.get("mode", "html"),
        "status": status,
        "status_label": status_label,
        "step_label": step_label,
        "readiness_pct": readiness_pct,
        "started_at": created_at,
        "updated_at": updated_at,
        "body_chars": len(body_text),
        "html_chars": len(html),
        "markdown_chars": len(markdown),
        "has_cover": bool(article.get("cover")),
        "has_author": bool(article.get("author")),
        "has_digest": bool(article.get("digest")),
        "capabilities": {
            "pause": False,
            "command": False,
            "live_terminal": False,
            "preview": has_body,
            "publish": has_body and wechat_ready,
        },
        "events": [
            {
                "ts": created_at,
                "kind": "meta",
                "text": f"record source · articles/{article_id}.json",
            },
            {
                "ts": created_at,
                "kind": "fact",
                "text": f"稿件创建 · mode={article.get('mode', 'html')}",
            },
            {
                "ts": updated_at,
                "kind": "fact",
                "text": (
                    f"最近更新 · body={len(body_text)} chars · "
                    f"html={len(html)} · markdown={len(markdown)}"
                ),
            },
            {
                "ts": updated_at,
                "kind": "fact" if article.get("cover") else "warning",
                "text": (
                    "封面已设置"
                    if article.get("cover")
                    else "封面未设置 · 发布时将回退到默认封面策略"
                ),
            },
            {
                "ts": updated_at,
                "kind": "fact" if article.get("author") or article.get("digest") else "meta",
                "text": (
                    "发布补充信息已填写"
                    if article.get("author") or article.get("digest")
                    else "作者 / 摘要仍为空 · 当前后端会允许空值投递"
                ),
            },
            {
                "ts": updated_at,
                "kind": publish_event_kind,
                "text": publish_event_text,
            },
            {
                "ts": updated_at,
                "kind": "warning",
                "text": "控制台当前为只读活动台 · 后端尚未持久化暂停、指令和实时终端流",
            },
        ],
    }


def list_runs(limit: int = 20) -> dict[str, Any]:
    config = load_config()
    wechat_ready = bool(config.get("appid") and config.get("appsecret"))
    summaries = article_service.list_articles()[:limit]
    items = [
        _record_for(article_service.get_article(summary["id"]), wechat_ready=wechat_ready)
        for summary in summaries
    ]

    return {
        "mode": "read_only_activity",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "notice": (
            "当前控制台展示的是从已保存稿件推导出的真实活动记录。"
            "暂停、下指令、实时终端流尚未由后端持久化。"
        ),
        "summary": {
            "total": len(items),
            "ready": sum(1 for item in items if item["status"] == "ready"),
            "draft": sum(1 for item in items if item["status"] == "draft"),
            "empty": sum(1 for item in items if item["status"] == "empty"),
            "wechat_configured": wechat_ready,
        },
        "capabilities": {
            "data_source": "derived_article_activity",
            "persisted_runs": False,
            "pause": False,
            "command": False,
            "live_terminal": False,
        },
        "items": items,
    }
