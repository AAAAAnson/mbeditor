"""Unit coverage for :mod:`app.services.wechat_copy_images`.

Mocks ``httpx.get`` so no network is touched — the point of the function
under test is to consume arbitrary URLs and flatten them to data URIs, so
tests have to exercise success, failure, and passthrough paths without
actually hitting any server.
"""
from __future__ import annotations

import base64
from typing import Any, Dict

import pytest

from app.services import wechat_copy_images


class _FakeResp:
    def __init__(
        self,
        *,
        content: bytes = b"",
        headers: Dict[str, str] | None = None,
    ) -> None:
        self.content = content
        self.headers = headers or {}

    def raise_for_status(self) -> None:  # pragma: no cover — trivial
        return None


def _install_fake_get(
    monkeypatch: pytest.MonkeyPatch, responses: Dict[str, _FakeResp]
) -> list[str]:
    calls: list[str] = []

    def fake_get(url, timeout, headers, follow_redirects):
        calls.append(url)
        if url not in responses:
            raise AssertionError(f"unexpected fetch: {url}")
        return responses[url]

    monkeypatch.setattr(wechat_copy_images.httpx, "get", fake_get)
    return calls


def test_data_uri_passes_through_without_fetch(monkeypatch):
    # No stub at all: any httpx.get call would blow up with AttributeError.
    data_uri = "data:image/png;base64,AAAA"
    html = f'<img src="{data_uri}">'
    out = wechat_copy_images.inline_images_as_data_uris(html)
    assert out == html


def test_http_url_is_rewritten_to_data_uri(monkeypatch):
    payload = b"\x89PNG\r\n\x1a\nfake"
    _install_fake_get(
        monkeypatch,
        {
            "https://cdn.example.com/pic.png": _FakeResp(
                content=payload, headers={"content-type": "image/png"}
            ),
        },
    )

    html = '<img src="https://cdn.example.com/pic.png">'
    out = wechat_copy_images.inline_images_as_data_uris(html)
    expected_b64 = base64.b64encode(payload).decode("ascii")
    assert f'src="data:image/png;base64,{expected_b64}"' in out
    assert "cdn.example.com" not in out


def test_missing_content_type_falls_back_to_default(monkeypatch):
    _install_fake_get(
        monkeypatch,
        {"http://x/y": _FakeResp(content=b"abc", headers={})},
    )

    out = wechat_copy_images.inline_images_as_data_uris('<img src="http://x/y">')
    # No content-type → default image/png
    assert 'src="data:image/png;base64,' in out


def test_content_type_with_params_is_trimmed(monkeypatch):
    _install_fake_get(
        monkeypatch,
        {
            "http://x/y": _FakeResp(
                content=b"abc",
                headers={"content-type": "image/jpeg; charset=binary"},
            )
        },
    )

    out = wechat_copy_images.inline_images_as_data_uris('<img src="http://x/y">')
    assert 'src="data:image/jpeg;base64,' in out


def test_duplicate_src_fetched_once(monkeypatch):
    calls = _install_fake_get(
        monkeypatch,
        {
            "http://x/dup.png": _FakeResp(
                content=b"dup", headers={"content-type": "image/png"}
            )
        },
    )

    html = '<img src="http://x/dup.png"><img src="http://x/dup.png">'
    out = wechat_copy_images.inline_images_as_data_uris(html)
    expected_b64 = base64.b64encode(b"dup").decode("ascii")
    assert out.count(f"data:image/png;base64,{expected_b64}") == 2
    assert calls == ["http://x/dup.png"]


def test_fetch_failure_preserves_original_src(monkeypatch):
    def boom(url, timeout, headers, follow_redirects):
        raise RuntimeError("network down")

    monkeypatch.setattr(wechat_copy_images.httpx, "get", boom)
    html = '<img src="https://broken.example.com/404.png">'
    out = wechat_copy_images.inline_images_as_data_uris(html)
    assert out == html  # unchanged — degrade so user still sees HTML


def test_oversize_response_preserves_original_src(monkeypatch):
    big = b"\0" * (wechat_copy_images._MAX_INLINE_BYTES + 1)
    _install_fake_get(
        monkeypatch,
        {
            "http://x/huge.png": _FakeResp(
                content=big, headers={"content-type": "image/png"}
            )
        },
    )

    html = '<img src="http://x/huge.png">'
    out = wechat_copy_images.inline_images_as_data_uris(html)
    assert out == html  # skipped because oversize


def test_non_http_src_left_alone(monkeypatch):
    # A relative URL, a wx:// URL, and an empty src must all pass through.
    # httpx.get must not be called.
    def explode(*a, **k):
        raise AssertionError("non-http src must not be fetched")

    monkeypatch.setattr(wechat_copy_images.httpx, "get", explode)

    html = (
        '<img src="/static/local.png">'
        '<img src="wx://foo/bar">'
        '<img src="">'
    )
    out = wechat_copy_images.inline_images_as_data_uris(html)
    assert out == html


def test_mixed_payload_processes_each_kind_correctly(monkeypatch):
    _install_fake_get(
        monkeypatch,
        {
            "https://cdn.example.com/a.png": _FakeResp(
                content=b"a", headers={"content-type": "image/png"}
            )
        },
    )

    html = (
        '<img src="data:image/gif;base64,AAAA">'     # passthrough
        '<img src="https://cdn.example.com/a.png">'   # rewritten
        '<img src="/local/only.png">'                # passthrough
    )
    out = wechat_copy_images.inline_images_as_data_uris(html)
    # passthroughs untouched
    assert 'src="data:image/gif;base64,AAAA"' in out
    assert 'src="/local/only.png"' in out
    # external rewritten
    expected_b64 = base64.b64encode(b"a").decode("ascii")
    assert f'src="data:image/png;base64,{expected_b64}"' in out
    assert "cdn.example.com" not in out
