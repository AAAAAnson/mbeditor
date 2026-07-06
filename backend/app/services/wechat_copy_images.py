"""Inline every fetchable ``<img>`` in outgoing HTML as a base64 data URI.

Why data URIs, specifically, on the "复制富文本 → 粘到公众号后台" path?
---------------------------------------------------------------------
WeChat's paste handler running in the user's browser on
``mp.weixin.qq.com`` will, for any ``<img src="data:image/...;base64,...">``
in the pasted HTML, upload those inline bytes directly to ``mmbiz.qpic.cn``
and rewrite the ``src`` in one shot. No external fetch from WeChat's servers
is involved, so data URIs bypass every failure mode of URL-based rehost:

* third-party domains WeChat refuses to crawl ("拉取图片数据失败")
* LAN-only imgbed URLs that the browser can reach but WeChat's servers
  cannot (or vice-versa, depending on where the user opened the editor)
* SSL / rate-limit / CORS mismatches between our VPS imgbed and WeChat
* WeChat tightening its paste-rehost policy on arbitrary domains

By the time HTML leaves ``process_html_for_copy`` every image is self-
contained. The clipboard payload is then big but portable — paste into
mp.weixin.qq.com, paste into Word, paste into another WeChat editor, all
work the same way.

Contrast with :mod:`app.services.local_imgbed_service`
------------------------------------------------------
The imgbed rewrites ``<img src>`` to a hosted URL on our NAS / VPS.
That lowers the clipboard payload size but *relies* on WeChat's paste
handler resolving the URL later; which it does inconsistently. The imgbed
module is kept for ``publish_draft_sync`` (draft API needs some reachable
URL in ``article.content``) but must not be used on the copy path.
"""
from __future__ import annotations

import base64
import logging
import re
from typing import Dict

import httpx

logger = logging.getLogger(__name__)

# Per-image cap so one runaway asset can't balloon the clipboard payload
# past what mp.weixin.qq.com's paste handler will accept. 6 MB is well
# above any practical hero image (JPEG @ 2000 px wide) but small enough
# that an inlined 20-image article still fits in ~120 MB of HTML.
_MAX_INLINE_BYTES = 6 * 1024 * 1024

# Content-type fallback when the server returns something useless like
# ``application/octet-stream`` or omits the header entirely. ``image/png``
# is universally decodable by browsers and WeChat's paste handler.
_DEFAULT_MIME = "image/png"

# Rewrites are anchored to <img> tags. A bare `src="..."` scan over the
# whole document also matches the literal text `src="..."` appearing in
# article PROSE (tutorials/code samples) and the src of <video>/<iframe>
# tags — rewriting prose corrupts visible text, and fetching arbitrary
# non-image URLs wastes time and inlines garbage.
_IMG_TAG_RE = re.compile(r'<img\b[^>]*>', re.IGNORECASE)
_SRC_RE = re.compile(r'src="([^"]+)"')


def inline_images_as_data_uris(html: str) -> str:
    """Rewrite every external ``<img src>`` in *html* to a data URI.

    * ``data:`` sources are passed through unchanged (already inline).
    * Non-HTTP sources (``wx://``, ``//cdn/...``, empty, relative, …) are
      passed through unchanged — we won't guess how to fetch them.
    * HTTP(S) sources are fetched once (per distinct URL within *html*)
      and rewritten to ``data:<mime>;base64,<payload>``.
    * Per-image failures (network error, non-200, oversize, decode) leave
      the original ``src`` in place and log a warning. One bad image must
      not lose the whole article.

    Runs synchronously via ``httpx``; callers on the asyncio event loop
    (``/publish/process-for-copy``) must dispatch through ``run_in_executor``.
    """
    cache: Dict[str, str] = {}

    def rewrite(match: "re.Match[str]") -> str:
        src = match.group(1)
        if src.startswith("data:"):
            return match.group(0)
        if not (src.startswith("http://") or src.startswith("https://")):
            return match.group(0)

        cached = cache.get(src)
        if cached is not None:
            # Failed fetches cache the original src so duplicate dead URLs
            # don't retry serially (up to 20s timeout each).
            if cached == src:
                return match.group(0)
            return f'src="{cached}"'

        try:
            resp = httpx.get(
                src,
                timeout=20,
                headers={"User-Agent": "Mozilla/5.0"},
                follow_redirects=True,
            )
            resp.raise_for_status()
            content = resp.content
            if len(content) > _MAX_INLINE_BYTES:
                logger.warning(
                    "inline_images_as_data_uris: %s is %d bytes, exceeds cap %d — "
                    "leaving src unchanged",
                    src[:80], len(content), _MAX_INLINE_BYTES,
                )
                cache[src] = src  # don't re-download the oversize asset
                return match.group(0)
            mime = (
                (resp.headers.get("content-type") or "").split(";")[0].strip()
                or _DEFAULT_MIME
            )
            b64 = base64.b64encode(content).decode("ascii")
            data_uri = f"data:{mime};base64,{b64}"
            cache[src] = data_uri
            return f'src="{data_uri}"'
        except Exception as exc:  # noqa: BLE001 — per-image degrade
            logger.warning(
                "inline_images_as_data_uris: failed to fetch %s: %s",
                src[:80], exc,
            )
            cache[src] = src  # negative-cache: skip retries for this URL
            return match.group(0)

    def rewrite_img_tag(tag_match: "re.Match[str]") -> str:
        return _SRC_RE.sub(rewrite, tag_match.group(0))

    return _IMG_TAG_RE.sub(rewrite_img_tag, html)
