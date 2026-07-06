import re
import time
from typing import Callable

import httpx

from app.core.exceptions import AppError
from app.services import credentials, gateway

# 微信 API 接入。传输层由 ``app/services/gateway.py`` 决定(可插拔):
# 默认直连 api.weixin.qq.com;存有网关配置(具名卷 gateway.json)或 env
# WECHAT_API_BASE 时改走固定 IP 网关(复用现成的 wechat-api-proxy:Caddy 自签 TLS +
# Bearer token + 原样转发微信),以满足公众号 IP 白名单——微信看到的来源 IP =
# 网关服务器 IP。每次调用经 ``gateway.resolve()`` 取当前传输(base_url + httpx_kwargs),
# 不再在导入时冻结成模块常量,使网页配置可在运行时生效。
# 仅微信 API 走网关;process_html_images 抓取文章图片仍直连,不经网关。

# appid -> {"access_token": str, "expires_at": float}
_token_cache: dict[str, dict] = {}

# H6:微信 errcode → 中文可行动文案。只收常见、有把握的码,其余走兜底
# (保留原始 errcode/errmsg)。注意:40001/42001/40014 同时也是
# ``_is_invalid_credential`` 的 token 刷新重试三码——重试机制不受本表影响,
# 本表只负责「重试用尽后」抛给用户的文案。文案不写任何具体 IP。
_ERRCODE_MESSAGES: dict[int, str] = {
    40164: (
        "公众号 IP 白名单未放行:请登录公众号后台 → 设置与开发 → 安全中心 → "
        "IP 白名单,把发布服务器出口 IP 加入白名单后重试"
    ),
    45009: "接口调用次数超限(微信频控),请稍后再试",
    45002: "内容超出微信长度限制,请精简后重试",
    40001: "AppID 或 AppSecret 不正确,请到公众号后台核对",
    40013: "AppID 或 AppSecret 不正确,请到公众号后台核对",
    40125: "AppID 或 AppSecret 不正确,请到公众号后台核对",
    42001: "access_token 已过期,请重试",
    40007: "素材 media_id 不存在或已过期",
    41005: "缺少多媒体文件数据",
}


def _wechat_error_message(err_label: str, data: dict) -> str:
    """把微信错误响应统一转成「{err_label}:{中文可行动文案}」。"""
    errcode = data.get("errcode")
    mapped = _ERRCODE_MESSAGES.get(errcode) if isinstance(errcode, int) else None
    if mapped is None:
        mapped = f"微信接口返回错误(errcode {errcode}):{data.get('errmsg', 'unknown')}"
    return f"{err_label}:{mapped}"


def _wechat_post(url: str, **kwargs) -> dict:
    """HTTP 层防线:微信侧 HTTP 4xx/5xx、网络错误、非 JSON body 都收敛成
    AppError(502, 中文),不让原生异常逃逸成 HTTP 500 英文裸奔。
    AppError 仍走 HTTP 200 信封,信封机制零改。"""
    try:
        resp = httpx.post(url, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise AppError(
            code=502,
            message=f"微信接口请求失败(HTTP {e.response.status_code}),请稍后再试",
        )
    except httpx.HTTPError:
        raise AppError(code=502, message="微信接口请求失败,请稍后再试")
    except ValueError:
        raise AppError(code=502, message="微信接口响应异常,请稍后再试")


def get_access_token(*, appid: str, appsecret: str, force_refresh: bool = False) -> str:
    """Fetch access_token via stable_token. Cache is keyed by appid.

    appsecret resolution: request value wins; else the stored per-appid secret
    (``credentials.json``); else a 400. This lets saved accounts publish without
    re-sending the secret on every call (it lives server-side in the volume).
    """
    appid = (appid or "").strip()
    appsecret = (appsecret or "").strip()
    if not appsecret:
        appsecret = credentials.get_secret(appid) or ""
    if not appid or not appsecret:
        raise AppError(code=400, message="未配置公众号 AppID/AppSecret")

    entry = _token_cache.get(appid)
    if not force_refresh and entry and entry["access_token"] and time.time() < entry["expires_at"]:
        return entry["access_token"]

    t = gateway.resolve()
    data = _wechat_post(
        f"{t.base_url}/cgi-bin/stable_token",
        json={
            "grant_type": "client_credential",
            "appid": appid,
            "secret": appsecret,
            "force_refresh": force_refresh,
        },
        timeout=10,
        **t.httpx_kwargs(),
    )
    if "access_token" not in data:
        raise AppError(code=500, message=_wechat_error_message("微信凭证获取失败", data))

    _token_cache[appid] = {
        "access_token": data["access_token"],
        "expires_at": time.time() + data.get("expires_in", 7200) - 300,
    }
    return _token_cache[appid]["access_token"]


def _is_invalid_credential(data: dict) -> bool:
    return data.get("errcode") in (40001, 42001, 40014)


def _post_with_token_retry(
    path_fmt: str,
    *,
    appid: str,
    appsecret: str,
    files=None,
    json_body=None,
    success_key: str,
    err_label: str,
    timeout: int = 30,
) -> dict:
    for attempt in (0, 1):
        token = get_access_token(appid=appid, appsecret=appsecret, force_refresh=(attempt == 1))
        t = gateway.resolve()
        # Only the path carries ``{token}``; never run base_url through .format
        # (a gateway base containing a literal brace would otherwise raise).
        url = t.base_url + path_fmt.format(token=token)
        if files is not None:
            data = _wechat_post(url, files=files, timeout=timeout, **t.httpx_kwargs())
        else:
            data = _wechat_post(url, json=json_body, timeout=timeout, **t.httpx_kwargs())
        if success_key in data:
            return data
        if attempt == 0 and _is_invalid_credential(data):
            _token_cache.pop(appid, None)
            continue
        raise AppError(code=500, message=_wechat_error_message(err_label, data))
    raise AppError(code=500, message=f"{err_label}:重试已用尽,请稍后再试")


def upload_image_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "/cgi-bin/media/uploadimg?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/png")},
        success_key="url",
        err_label="微信图片上传失败",
    )
    return data["url"]


def upload_thumb_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "/cgi-bin/material/add_material?access_token={token}&type=thumb",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/jpeg")},
        success_key="media_id",
        err_label="微信封面上传失败",
    )
    return data["media_id"]


def _convert_to_png(img_bytes: bytes, filename: str) -> tuple[bytes, str]:
    lower = filename.lower()
    if lower.endswith((".webp", ".svg", ".bmp", ".tiff")):
        try:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(img_bytes))
            img = img.convert("RGBA") if img.mode in ("RGBA", "P") else img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue(), filename.rsplit(".", 1)[0] + ".png"
        except Exception:
            pass
    return img_bytes, filename


def _image_failure_reason(e: Exception) -> str:
    """把单张图片失败的异常收敛成中文简述(不泄漏内部路径/堆栈)。"""
    if isinstance(e, httpx.HTTPStatusError):
        return f"图片源返回 HTTP {e.response.status_code}(常见原因:图床防盗链)"
    if isinstance(e, AppError):
        return e.message  # 上传侧已是中文可行动文案
    if isinstance(e, httpx.HTTPError):
        return "图片下载失败(网络错误或图床不可达)"
    return "图片处理失败"


def process_html_images(html: str, *, appid: str, appsecret: str) -> tuple[str, list[dict]]:
    """Upload remote / data-URI images referenced in HTML to WeChat CDN.

    Local `/images/...` paths no longer exist in the stateless backend, so
    only `http(s)://` and `data:image/...` srcs are rewritten.

    Returns ``(html, failures)``:失败的图片原样保留 src(行为不变),同时
    进 ``failures``(每项 ``{"src": 截断80字, "reason": 中文简述}``),让上层
    把「草稿成功但图会裂」明示给用户,不再静默吞。
    """
    import logging
    logger = logging.getLogger(__name__)
    seen: dict[str, str] = {}
    failures: list[dict] = []

    def replace_src(match: re.Match) -> str:
        src = match.group(1)
        if "mmbiz.qpic.cn" in src:
            return match.group(0)
        if src in seen:
            return f'src="{seen[src]}"'

        if src.startswith("http"):
            try:
                resp = httpx.get(
                    src, timeout=20,
                    headers={"User-Agent": "Mozilla/5.0"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                fname = src.split("/")[-1].split("?")[0] or "image.png"
                img_bytes, fname = _convert_to_png(resp.content, fname)
                wx_url = upload_image_to_wechat(img_bytes, fname, appid=appid, appsecret=appsecret)
                seen[src] = wx_url
                return f'src="{wx_url}"'
            except Exception as e:
                logger.warning("Failed to upload image %s: %s", src[:80], e)
                failures.append({"src": src[:80], "reason": _image_failure_reason(e)})
                return match.group(0)

        if src.startswith("data:image/"):
            try:
                import base64 as b64mod
                header, b64data = src.split(",", 1)
                mime = header.split(";")[0].removeprefix("data:")
                ext = mime.split("/")[-1].replace("jpeg", "jpg").replace("svg+xml", "svg")
                img_bytes = b64mod.b64decode(b64data)
                fname = f"inline_image.{ext}"
                img_bytes, fname = _convert_to_png(img_bytes, fname)
                wx_url = upload_image_to_wechat(img_bytes, fname, appid=appid, appsecret=appsecret)
                seen[src] = wx_url
                return f'src="{wx_url}"'
            except Exception as e:
                logger.warning("Failed to upload base64 image: %s", e)
                failures.append({"src": src[:80], "reason": _image_failure_reason(e)})
                return match.group(0)

        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, html), failures


def _generate_default_cover(title: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGB", (900, 383), color=(30, 30, 30))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    except (OSError, IOError):
        font = ImageFont.load_default()
    display_title = title[:20] + "..." if len(title) > 20 else title
    bbox = draw.textbbox((0, 0), display_title, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((900 - tw) / 2, 150), display_title, fill=(240, 237, 230), font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def create_draft(
    *,
    appid: str,
    appsecret: str,
    title: str,
    html: str,
    author: str = "",
    digest: str = "",
    thumb_media_id: str = "",
    content_source_url: str = "",
) -> dict:
    if not thumb_media_id:
        cover_bytes = _generate_default_cover(title)
        thumb_media_id = upload_thumb_to_wechat(cover_bytes, "auto_cover.jpg", appid=appid, appsecret=appsecret)

    article = {
        "title": title,
        "author": author,
        "digest": digest,
        "content": html,
        "thumb_media_id": thumb_media_id,
        "content_source_url": content_source_url,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }

    data = _post_with_token_retry(
        "/cgi-bin/draft/add?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        json_body={"articles": [article]},
        success_key="media_id",
        err_label="微信草稿创建失败",
    )
    return {"media_id": data["media_id"]}


def get_draft(media_id: str, *, appid: str, appsecret: str) -> dict:
    """回读草稿箱内容：POST /cgi-bin/draft/get。

    返回微信原样的草稿 dict，关键字段为 ``news_item``（图文条目数组），
    其中 ``news_item[0]["content"]`` 即微信服务端清洗后存储的正文 HTML。
    复用 ``_post_with_token_retry`` 的令牌刷新模式，与 ``create_draft`` 风格一致。
    """
    return _post_with_token_retry(
        "/cgi-bin/draft/get?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        json_body={"media_id": media_id},
        success_key="news_item",
        err_label="微信草稿读取失败",
    )


def delete_draft(media_id: str, *, appid: str, appsecret: str) -> None:
    """删除草稿：POST /cgi-bin/draft/delete。

    成功响应为 ``{"errcode": 0, ...}``，没有正向成功键，因此不走
    ``_post_with_token_retry``（它以 ``success_key in data`` 判定成功），
    自行处理令牌刷新：与 ``_post_with_token_retry`` 同样的 attempt 0/1 模式，
    遇无效凭证清缓存后强制刷新重试。
    """
    for attempt in (0, 1):
        token = get_access_token(appid=appid, appsecret=appsecret, force_refresh=(attempt == 1))
        t = gateway.resolve()
        url = f"{t.base_url}/cgi-bin/draft/delete?access_token={token}"
        data = _wechat_post(url, json={"media_id": media_id}, timeout=30, **t.httpx_kwargs())
        if data.get("errcode") == 0:
            return
        if attempt == 0 and _is_invalid_credential(data):
            _token_cache.pop(appid, None)
            continue
        raise AppError(code=500, message=_wechat_error_message("微信草稿删除失败", data))
    raise AppError(code=500, message="微信草稿删除失败:重试已用尽,请稍后再试")


def delete_material(media_id: str, *, appid: str, appsecret: str) -> None:
    """删除永久素材：POST /cgi-bin/material/del_material。

    与 ``delete_draft`` 同理，成功响应只有 ``{"errcode": 0}`` 没有正向成功键，
    自行处理令牌刷新重试。用于清理 ``upload_thumb_to_wechat`` 产生的封面素材。
    """
    for attempt in (0, 1):
        token = get_access_token(appid=appid, appsecret=appsecret, force_refresh=(attempt == 1))
        t = gateway.resolve()
        url = f"{t.base_url}/cgi-bin/material/del_material?access_token={token}"
        data = _wechat_post(url, json={"media_id": media_id}, timeout=30, **t.httpx_kwargs())
        if data.get("errcode") == 0:
            return
        if attempt == 0 and _is_invalid_credential(data):
            _token_cache.pop(appid, None)
            continue
        raise AppError(code=500, message=_wechat_error_message("微信素材删除失败", data))
    raise AppError(code=500, message="微信素材删除失败:重试已用尽,请稍后再试")
