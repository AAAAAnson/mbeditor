import json
import re
import time
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

_token_cache: dict = {"access_token": "", "expires_at": 0}
_wx_image_cache: dict[str, str] = {}  # local_path -> wechat_url


def _config_path() -> Path:
    return Path(settings.CONFIG_FILE)


def load_config() -> dict:
    path = _config_path()
    if not path.exists():
        return {"appid": "", "appsecret": ""}
    return json.loads(path.read_text(encoding="utf-8"))


def save_config(appid: str, appsecret: str) -> dict:
    config = {"appid": appid, "appsecret": appsecret}
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    _token_cache["access_token"] = ""
    _token_cache["expires_at"] = 0
    return config


def get_access_token() -> str:
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    config = load_config()
    if not config.get("appid") or not config.get("appsecret"):
        raise AppError(code=400, message="WeChat AppID/AppSecret not configured")

    resp = httpx.get(
        "https://api.weixin.qq.com/cgi-bin/token",
        params={
            "grant_type": "client_credential",
            "appid": config["appid"],
            "secret": config["appsecret"],
        },
        timeout=10,
    )
    data = resp.json()
    if "access_token" not in data:
        raise AppError(code=500, message=f"WeChat token error: {data.get('errmsg', 'unknown')}")

    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expires_in", 7200) - 300
    return _token_cache["access_token"]


def upload_image_to_wechat(image_bytes: bytes, filename: str) -> str:
    token = get_access_token()
    resp = httpx.post(
        f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}",
        files={"media": (filename, image_bytes, "image/png")},
        timeout=30,
    )
    data = resp.json()
    if "url" not in data:
        raise AppError(code=500, message=f"WeChat upload error: {data.get('errmsg', 'unknown')}")
    return data["url"]


def upload_thumb_to_wechat(image_bytes: bytes, filename: str) -> str:
    token = get_access_token()
    resp = httpx.post(
        f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=thumb",
        files={"media": (filename, image_bytes, "image/jpeg")},
        timeout=30,
    )
    data = resp.json()
    if "media_id" not in data:
        raise AppError(code=500, message=f"WeChat thumb upload error: {data.get('errmsg', 'unknown')}")
    return data["media_id"]


def _convert_to_png(img_bytes: bytes, filename: str) -> tuple[bytes, str]:
    """Convert webp/svg/other formats to PNG for WeChat compatibility."""
    lower = filename.lower()
    if lower.endswith((".webp", ".svg", ".bmp", ".tiff")):
        try:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(img_bytes))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue(), filename.rsplit(".", 1)[0] + ".png"
        except Exception:
            pass
    return img_bytes, filename


def process_html_images(html: str, images_dir: str) -> str:
    import logging
    logger = logging.getLogger(__name__)

    def replace_src(match: re.Match) -> str:
        src = match.group(1)
        if "mmbiz.qpic.cn" in src:
            return match.group(0)
        if src in _wx_image_cache:
            return f'src="{_wx_image_cache[src]}"'

        local_path = None
        if src.startswith("/images/"):
            local_path = Path(images_dir) / src.removeprefix("/images/")
        elif src.startswith("http"):
            try:
                resp = httpx.get(
                    src, timeout=20,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                img_bytes = resp.content
                fname = src.split("/")[-1].split("?")[0] or "image.png"
                img_bytes, fname = _convert_to_png(img_bytes, fname)
                wx_url = upload_image_to_wechat(img_bytes, fname)
                _wx_image_cache[src] = wx_url
                logger.info(f"Uploaded image: {src[:60]} -> {wx_url[:60]}")
                return f'src="{wx_url}"'
            except Exception as e:
                logger.warning(f"Failed to upload image {src[:80]}: {e}")
                return match.group(0)

        if local_path and local_path.exists():
            img_bytes = local_path.read_bytes()
            fname = local_path.name
            img_bytes, fname = _convert_to_png(img_bytes, fname)
            wx_url = upload_image_to_wechat(img_bytes, fname)
            _wx_image_cache[src] = wx_url
            return f'src="{wx_url}"'

        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, html)


def _generate_default_cover(title: str) -> bytes:
    """Generate a simple cover image with PIL when no cover is provided."""
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGB", (900, 383), color=(30, 30, 30))
    draw = ImageDraw.Draw(img)
    # Simple centered title text
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except (OSError, IOError):
        font = ImageFont.load_default()
        small_font = font

    # Draw title (truncate if too long)
    display_title = title[:20] + "..." if len(title) > 20 else title
    bbox = draw.textbbox((0, 0), display_title, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((900 - tw) / 2, 150), display_title, fill=(240, 237, 230), font=font)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def create_draft(title: str, html: str, author: str = "", digest: str = "", thumb_media_id: str = "", content_source_url: str = "") -> dict:
    import logging
    logger = logging.getLogger(__name__)

    token = get_access_token()

    if not thumb_media_id:
        # Auto-generate a default cover
        cover_bytes = _generate_default_cover(title)
        thumb_media_id = upload_thumb_to_wechat(cover_bytes, "auto_cover.jpg")

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

    logger.info(f"[draft] title={title!r}, content_length={len(html)}")

    resp = httpx.post(
        f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}",
        json={"articles": [article]},
        timeout=30,
    )
    data = resp.json()
    logger.info(f"[draft] WeChat response: media_id={data.get('media_id', 'N/A')}")
    if "media_id" not in data:
        raise AppError(code=500, message=f"WeChat draft error: {data.get('errmsg', 'unknown')}")
    return {"media_id": data["media_id"]}
