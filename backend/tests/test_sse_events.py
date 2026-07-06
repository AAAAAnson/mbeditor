"""5 型 SSE 帧构造器:格式(data: ...\\n\\n)、字段名、中文不转义、紧凑分隔。"""
from __future__ import annotations

import json

from app.services.sse_events import (
    done_event,
    error_event,
    stage_event,
    title_event,
    token_event,
)


def _payload(frame: str) -> dict:
    assert frame.startswith("data: ")
    assert frame.endswith("\n\n")
    return json.loads(frame[len("data: "):].rstrip("\n"))


def test_stage_event_shape():
    p = _payload(stage_event("立意", "active", "约 820 字"))
    assert p == {"type": "stage", "stage": "立意", "status": "active", "desc": "约 820 字"}


def test_stage_event_default_desc_empty():
    p = _payload(stage_event("行文", "done"))
    assert p["desc"] == ""


def test_title_event_shape():
    assert _payload(title_event("海洋馆")) == {"type": "title", "text": "海洋馆"}


def test_token_event_shape():
    assert _payload(token_event("上")) == {"type": "token", "text": "上"}


def test_done_event_shape():
    report = {"issues": [], "warnings": [], "stats": {"chars": 820}}
    p = _payload(done_event("<section></section>", "# 标题", report, True))
    assert p["type"] == "done"
    assert p["html"] == "<section></section>"
    assert p["markdown"] == "# 标题"
    assert p["report"] == report
    assert p["aigc"] is True


def test_error_event_shape():
    p = _payload(error_event("no_provider", "还没配置模型 key"))
    assert p == {"type": "error", "code": "no_provider", "message": "还没配置模型 key"}


def test_chinese_not_escaped_and_compact():
    frame = title_event("温柔治愈")
    # ensure_ascii=False -> 中文原样;separators=(",",":") -> 无多余空格。
    assert "温柔治愈" in frame
    assert ", " not in frame and '": ' not in frame
