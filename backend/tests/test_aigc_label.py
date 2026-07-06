# backend/tests/test_aigc_label.py
"""AIGC 标识注入(app.services.aigc_label)单测。

契约:AIGC_LABEL_ENABLED 默认 false -> apply() 原样返回 + flag=False;
开启后注显式文末标识 + 隐式 HTML 元数据注释,flag=True。
"""
import re

import pytest

from app.services import aigc_label


@pytest.fixture(autouse=True)
def _label_off(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", False)
    yield


def test_disabled_returns_untouched():
    html_in = "<section><p>正文</p></section>"
    md_in = "# 标题\n\n正文"
    html_out, md_out, flag = aigc_label.apply(html_in, md_in)
    assert html_out == html_in
    assert md_out == md_in
    assert flag is False


def test_enabled_appends_explicit_html_notice(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    html_in = "<section><p>正文</p></section>"
    html_out, _md, flag = aigc_label.apply(html_in, "正文")
    assert flag is True
    assert html_in in html_out                          # 原文保留在前
    assert "本文由 AI 辅助生成" in html_out
    assert html_out.index("本文由 AI 辅助生成") > html_out.index("正文")  # 追加在文末


def test_enabled_appends_explicit_markdown_notice(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    _html, md_out, flag = aigc_label.apply("<p>x</p>", "# 标题\n\n正文")
    assert flag is True
    assert md_out.startswith("# 标题\n\n正文")
    assert md_out.rstrip().endswith("本文由 AI 辅助生成")


def test_enabled_idempotent_no_double_notice(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    html_once, md_once, _ = aigc_label.apply("<p>正文</p>", "正文")
    html_twice, md_twice, _ = aigc_label.apply(html_once, md_once)
    assert html_twice.count("本文由 AI 辅助生成") == 1     # 二次注入不重复
    assert md_twice.count("本文由 AI 辅助生成") == 1


def test_enabled_embeds_implicit_html_metadata(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    html_out, _md, _flag = aigc_label.apply("<section><p>正文</p></section>", "正文")
    assert html_out.startswith("<!-- aigc:")
    assert "provider=mbeditor" in html_out
    assert re.search(r"id=[0-9a-f]{12}", html_out)       # 12 位内容编号(hex)


def test_implicit_content_id_is_deterministic(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    a, _, _ = aigc_label.apply("<p>同样正文</p>", "同样正文")
    b, _, _ = aigc_label.apply("<p>同样正文</p>", "同样正文")
    id_a = re.search(r"id=([0-9a-f]{12})", a).group(1)
    id_b = re.search(r"id=([0-9a-f]{12})", b).group(1)
    assert id_a == id_b                                  # 同输入同编号
    c, _, _ = aigc_label.apply("<p>不同正文</p>", "不同正文")
    id_c = re.search(r"id=([0-9a-f]{12})", c).group(1)
    assert id_c != id_a                                  # 不同输入不同编号


def test_implicit_idempotent_no_double_comment(monkeypatch):
    monkeypatch.setattr(aigc_label.settings, "AIGC_LABEL_ENABLED", True)
    once, md_once, _ = aigc_label.apply("<p>正文</p>", "正文")
    twice, _md, _ = aigc_label.apply(once, md_once)
    assert twice.count("<!-- aigc:") == 1                # 二次不重复注释
