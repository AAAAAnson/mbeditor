# Stateless Backend + Local-First Frontend Refactor — Plan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert MBEditor backend to a stateless proxy; move all user data (articles, block docs, WeChat credentials) into browser localStorage. End state: no per-user state on disk, default WeChat image upload still works through a stateless server proxy.

**Architecture:** Backend keeps only process-memory access_token cache keyed by appid. Every endpoint receives WeChat credentials in request body per call. Frontend uses Zustand+persist stores (same pattern as existing uiStore.ts) as the system of record for articles/mbdocs/configs. Data flows: user action → store mutation → localStorage write → (optional) POST to stateless backend with credentials embedded.

**Tech Stack:** FastAPI + Python 3.12, React 19 + Zustand, docker-compose, pytest (backend tests), Playwright (frontend regression).

## File Structure

### Backend — Create
- `backend/app/api/v1/wechat_stateless.py` — new router exposing `/wechat/test-connection`, `/wechat/upload-image`, `/wechat/draft`. Accepts credentials in each request.
- `backend/tests/test_wechat_stateless_api.py` — covers the three new endpoints with httpx MockTransport.
- `backend/tests/test_wechat_service_stateless.py` — unit tests for `wechat_service.get_access_token(appid, appsecret)` with appid-keyed cache.

### Backend — Modify
- `backend/app/services/wechat_service.py` — every public function accepts `appid`/`appsecret` kwargs; `_token_cache` becomes `dict[str, dict]` keyed by appid; `_wx_image_cache` deleted; `load_config` / `save_config` deleted; `process_html_images` accepts `(html, appid, appsecret)` only (no images_dir).
- `backend/app/services/publish_adapter.py` — `publish_draft_sync` accepts the full article payload + `appid`/`appsecret`; no longer reads from disk.
- `backend/app/services/media_uploader.py` — functions accept `appid`/`appsecret` and forward to `wechat_service`.
- `backend/app/services/wechat_publisher.py` — `create_article_draft` accepts `appid`/`appsecret`.
- `backend/app/api/v1/publish.py` — `/publish/draft` accepts `{appid, appsecret, article}` body; remove all endpoints that require server-side article lookup; keep `/publish/preview` (pure, stateless already) and `/publish/process-for-copy` (takes creds in body now).
- `backend/app/api/v1/router.py` — drop `articles_router`, `mbdoc_router`, old `images_router`, old `wechat_router`; include new `wechat_stateless_router`.
- `backend/app/core/config.py` — remove `IMAGES_DIR`, `ARTICLES_DIR`, `MBDOCS_DIR`, `CONFIG_FILE`, `default_data_root`, `DEFAULT_DATA_ROOT`; keep only `MAX_UPLOAD_SIZE`, `APP_VERSION`, `GITHUB_REPO`.
- `backend/app/main.py` — remove `ensure_data_directories`, remove `/images` static mount, remove `seed_showcase_templates_if_empty` call.
- `docker-compose.yml` — remove `./data:/app/data` volume; remove `IMAGES_DIR` / `ARTICLES_DIR` / `CONFIG_FILE` / `MBDOCS_DIR` env vars; keep `MAX_UPLOAD_SIZE`.

### Backend — Delete
- `backend/app/api/v1/articles.py`
- `backend/app/api/v1/mbdoc.py`
- `backend/app/api/v1/images.py`
- `backend/app/api/v1/wechat.py` (superseded by `wechat_stateless.py`)
- `backend/app/services/article_service.py`
- `backend/app/services/mbdoc_storage.py`
- `backend/app/services/image_service.py`
- `backend/app/services/showcase_seed.py`
- `backend/tests/test_articles_api.py`
- `backend/tests/test_mbdoc_api.py`
- `backend/tests/test_mbdoc_storage.py`
- `backend/tests/test_config_paths.py`
- `backend/tests/test_showcase_seed.py`
- `backend/tests/test_demo_article_allowlist.py` (depends on articles_api)

### Frontend — Create
- `frontend/src/stores/wechatStore.ts` — persists `{accounts, activeAccountId}` to `mbeditor.wechat`.
- `frontend/src/stores/mbdocStore.ts` — persists `{docs}` to `mbeditor.mbdocs`.
- `frontend/src/stores/wechatStore.test.ts` — vitest coverage for wechatStore public API.
- `frontend/src/stores/articlesStore.test.ts` — vitest coverage for the rewritten local articlesStore.
- `frontend/src/stores/mbdocStore.test.ts` — vitest coverage for mbdocStore public API.
- `frontend/src/lib/legacyImport.ts` — JSON parser + schema validator for the legacy export bundle; populates stores.
- `frontend/src/lib/legacyImport.test.ts` — vitest coverage for the importer.
- `scripts/export_legacy_data.py` — reads current `data/articles/*.json` and `data/mbdocs/*.json`, writes a single `data/legacy-export-<timestamp>.json`.

### Frontend — Modify
- `frontend/src/stores/articlesStore.ts` — remove all API calls; persist `articles` array to `mbeditor.articles`; keep the public surface `{articles, currentArticleId, fetchArticles, fetchArticle, createArticle, updateArticle, deleteArticle, setCurrentArticle}` so callers do not break, but fetch* becomes a no-op returning the in-store value.
- `frontend/src/surfaces/settings/SettingsSurface.tsx` — replace backend `/config` round-trip with `wechatStore` read/write; add a multi-account list UI with add / edit / remove / set-active / test-connection; add an "Import legacy data" file picker.
- `frontend/src/surfaces/settings/SettingsSurface.test.tsx` — update mocks: stub `wechatStore`, remove API stubs for `/config`.
- `frontend/src/surfaces/article-list/ArticleList.tsx` — replace `/api/v1/articles` fetch with `articlesStore` read.
- `frontend/src/surfaces/editor/AgentCopilot.tsx` — replace any article/mbdoc API calls with store reads and embed `{appid, appsecret}` from `wechatStore` when invoking the publish endpoint.
- `frontend/src/types/index.ts` — add `WeChatAccount` and `LegacyExportBundle` types.

## Stage 1: Backend statelessness

### Task 1: Failing test for appid-keyed token cache

**Files:**
- Create: `backend/tests/test_wechat_service_stateless.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_wechat_service_stateless.py
import time

import httpx
import pytest

from app.services import wechat_service


@pytest.fixture(autouse=True)
def _reset_cache():
    wechat_service._token_cache.clear()
    yield
    wechat_service._token_cache.clear()


def _mock_stable_token(monkeypatch, token_value: str = "tok-A", expires_in: int = 7200):
    calls = {"n": 0}

    def fake_post(url, json=None, timeout=None, **_):
        calls["n"] += 1
        request = httpx.Request("POST", url, json=json)
        return httpx.Response(
            200,
            json={"access_token": token_value, "expires_in": expires_in},
            request=request,
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    return calls


def test_get_access_token_accepts_credentials_as_arguments(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    token = wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert token == "tok-A"
    assert calls["n"] == 1


def test_token_cache_is_keyed_by_appid(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-shared")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 1, "second call for same appid must use cache"

    wechat_service.get_access_token(appid="wxB", appsecret="secretB")
    assert calls["n"] == 2, "different appid must trigger a new fetch"


def test_force_refresh_bypasses_cache(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA", force_refresh=True)
    assert calls["n"] == 2


def test_missing_credentials_raise(monkeypatch):
    _mock_stable_token(monkeypatch)
    from app.core.exceptions import AppError

    with pytest.raises(AppError):
        wechat_service.get_access_token(appid="", appsecret="")


def test_expired_token_is_refreshed(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A", expires_in=10)
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    # Force expiry
    wechat_service._token_cache["wxA"]["expires_at"] = time.time() - 1
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 2


def test_load_config_and_save_config_are_removed():
    assert not hasattr(wechat_service, "load_config")
    assert not hasattr(wechat_service, "save_config")
    assert not hasattr(wechat_service, "_wx_image_cache")
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/test_wechat_service_stateless.py -x`

Expected failure: `TypeError: get_access_token() got an unexpected keyword argument 'appid'` (and later assertions about `load_config`/`save_config` still existing).

- [ ] **Step 3: Implement minimal code**

Replace `backend/app/services/wechat_service.py` entirely with:

```python
import re
import time
from typing import Callable

import httpx

from app.core.exceptions import AppError

# appid -> {"access_token": str, "expires_at": float}
_token_cache: dict[str, dict] = {}


def get_access_token(*, appid: str, appsecret: str, force_refresh: bool = False) -> str:
    """Fetch access_token via stable_token. Cache is keyed by appid."""
    appid = (appid or "").strip()
    appsecret = (appsecret or "").strip()
    if not appid or not appsecret:
        raise AppError(code=400, message="未配置公众号 AppID/AppSecret")

    entry = _token_cache.get(appid)
    if not force_refresh and entry and entry["access_token"] and time.time() < entry["expires_at"]:
        return entry["access_token"]

    resp = httpx.post(
        "https://api.weixin.qq.com/cgi-bin/stable_token",
        json={
            "grant_type": "client_credential",
            "appid": appid,
            "secret": appsecret,
            "force_refresh": force_refresh,
        },
        timeout=10,
    )
    data = resp.json()
    if "access_token" not in data:
        raise AppError(code=500, message=f"WeChat token error: {data.get('errmsg', 'unknown')}")

    _token_cache[appid] = {
        "access_token": data["access_token"],
        "expires_at": time.time() + data.get("expires_in", 7200) - 300,
    }
    return _token_cache[appid]["access_token"]


def _is_invalid_credential(data: dict) -> bool:
    return data.get("errcode") in (40001, 42001, 40014)


def _post_with_token_retry(
    url_fmt: str,
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
        url = url_fmt.format(token=token)
        if files is not None:
            resp = httpx.post(url, files=files, timeout=timeout)
        else:
            resp = httpx.post(url, json=json_body, timeout=timeout)
        data = resp.json()
        if success_key in data:
            return data
        if attempt == 0 and _is_invalid_credential(data):
            _token_cache.pop(appid, None)
            continue
        raise AppError(code=500, message=f"{err_label}: {data.get('errmsg', 'unknown')}")
    raise AppError(code=500, message=f"{err_label}: retry exhausted")


def upload_image_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/png")},
        success_key="url",
        err_label="WeChat upload error",
    )
    return data["url"]


def upload_thumb_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=thumb",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/jpeg")},
        success_key="media_id",
        err_label="WeChat thumb upload error",
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


def process_html_images(html: str, *, appid: str, appsecret: str) -> str:
    """Upload remote / data-URI images referenced in HTML to WeChat CDN.

    Local `/images/...` paths no longer exist in the stateless backend, so
    only `http(s)://` and `data:image/...` srcs are rewritten.
    """
    import logging
    logger = logging.getLogger(__name__)
    seen: dict[str, str] = {}

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
                return match.group(0)

        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, html)


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
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        json_body={"articles": [article]},
        success_key="media_id",
        err_label="WeChat draft error",
    )
    return {"media_id": data["media_id"]}
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/test_wechat_service_stateless.py -x`

Expected: `5 passed` (all tests in the file).

- [ ] **Step 5: Commit**

```
cd backend && git add app/services/wechat_service.py tests/test_wechat_service_stateless.py && git commit -m "refactor(backend): accept credentials per-call in wechat_service

Drop on-disk config, key the access_token cache by appid, and require
explicit appid/appsecret arguments on every public function. Deletes
_wx_image_cache and load_config/save_config."
```

### Task 2: Delete on-disk config settings

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/main.py`
- Delete: `backend/tests/test_config_paths.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_wechat_service_stateless.py`:

```python
def test_settings_only_expose_max_upload_size():
    from app.core.config import settings
    # Public attrs exposed by Settings
    attrs = {k for k in dir(settings) if not k.startswith("_") and k.isupper()}
    assert "MAX_UPLOAD_SIZE" in attrs
    assert "IMAGES_DIR" not in attrs
    assert "ARTICLES_DIR" not in attrs
    assert "MBDOCS_DIR" not in attrs
    assert "CONFIG_FILE" not in attrs
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/test_wechat_service_stateless.py::test_settings_only_expose_max_upload_size -x`

Expected: assertion failure on `"IMAGES_DIR" not in attrs`.

- [ ] **Step 3: Implement minimal code**

Replace `backend/app/core/config.py` entirely:

```python
from pydantic_settings import BaseSettings


APP_VERSION = "5.0.0"
GITHUB_REPO = "AAAAAnson/mbeditor"


class Settings(BaseSettings):
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024

    model_config = {"env_prefix": ""}


settings = Settings()
```

Replace `backend/app/main.py` entirely:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.response import fail

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    logger.info("Application shutdown complete.")


app = FastAPI(title="WeChat Editor API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


@app.middleware("http")
async def check_upload_size(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.MAX_UPLOAD_SIZE:
            return JSONResponse(
                status_code=413,
                content=fail(code=413, message="请求体过大。"),
            )
    return await call_next(request)


app.include_router(api_router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
```

Delete `backend/tests/test_config_paths.py`.

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/test_wechat_service_stateless.py::test_settings_only_expose_max_upload_size -x`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```
cd backend && git add app/core/config.py app/main.py tests/test_wechat_service_stateless.py && git rm tests/test_config_paths.py && git commit -m "refactor(backend): drop data-dir settings and static mount

Remove IMAGES_DIR/ARTICLES_DIR/MBDOCS_DIR/CONFIG_FILE from Settings,
drop the /images StaticFiles mount, and stop seeding showcase templates
on boot. The backend no longer reads or writes persistent state."
```

### Task 3: Failing tests for stateless /wechat endpoints

**Files:**
- Create: `backend/tests/test_wechat_stateless_api.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_wechat_stateless_api.py
import io

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import wechat_service


@pytest.fixture(autouse=True)
def _reset_token_cache():
    wechat_service._token_cache.clear()
    yield
    wechat_service._token_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _install_wechat_mock(monkeypatch, routes: dict[str, dict]):
    """routes: url_substring -> response dict"""
    def fake_post(url, json=None, files=None, timeout=None, **_):
        request = httpx.Request("POST", url)
        for needle, payload in routes.items():
            if needle in url:
                return httpx.Response(200, json=payload, request=request)
        return httpx.Response(404, json={"errcode": 404, "errmsg": "unmocked"}, request=request)

    monkeypatch.setattr(httpx, "post", fake_post)


def test_test_connection_returns_200_with_valid_creds(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {"stable_token": {"access_token": "tok", "expires_in": 7200}})
    resp = client.post("/api/v1/wechat/test-connection", json={"appid": "wxA", "appsecret": "secretA"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["valid"] is True


def test_test_connection_rejects_missing_creds(client):
    resp = client.post("/api/v1/wechat/test-connection", json={"appid": "", "appsecret": ""})
    assert resp.status_code == 400 or resp.json()["code"] != 0


def test_upload_image_proxies_to_wechat(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {
        "stable_token": {"access_token": "tok", "expires_in": 7200},
        "media/uploadimg": {"url": "https://mmbiz.qpic.cn/abc.png"},
    })
    resp = client.post(
        "/api/v1/wechat/upload-image",
        data={"appid": "wxA", "appsecret": "secretA"},
        files={"file": ("foo.png", io.BytesIO(b"\x89PNG fake"), "image/png")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["url"] == "https://mmbiz.qpic.cn/abc.png"


def test_upload_image_requires_credentials(client):
    resp = client.post(
        "/api/v1/wechat/upload-image",
        data={"appid": "", "appsecret": ""},
        files={"file": ("foo.png", io.BytesIO(b"fake"), "image/png")},
    )
    assert resp.status_code == 400 or resp.json().get("code", 0) != 0


def test_draft_accepts_credentials_and_article(client, monkeypatch):
    _install_wechat_mock(monkeypatch, {
        "stable_token": {"access_token": "tok", "expires_in": 7200},
        "add_material": {"media_id": "thumb-id"},
        "draft/add": {"media_id": "draft-id-42"},
    })
    resp = client.post(
        "/api/v1/wechat/draft",
        json={
            "appid": "wxA",
            "appsecret": "secretA",
            "article": {
                "title": "hello",
                "html": "<p>hi</p>",
                "author": "",
                "digest": "",
                "cover": "",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["data"]["media_id"] == "draft-id-42"
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/test_wechat_stateless_api.py -x`

Expected: `404 Not Found` for `/api/v1/wechat/test-connection` — route does not exist yet.

- [ ] **Step 3: Implement minimal code**

Create `backend/app/api/v1/wechat_stateless.py`:

```python
import asyncio

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.core.response import success
from app.services import wechat_service
from app.services.publish_adapter import publish_draft_sync

router = APIRouter(prefix="/wechat", tags=["wechat"])


class Credentials(BaseModel):
    appid: str
    appsecret: str


class ArticlePayload(BaseModel):
    title: str = ""
    html: str = ""
    css: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""
    mode: str = "html"
    markdown: str = ""


class DraftReq(BaseModel):
    appid: str
    appsecret: str
    article: ArticlePayload = Field(default_factory=ArticlePayload)


@router.post("/test-connection")
async def test_connection(req: Credentials):
    wechat_service.get_access_token(appid=req.appid, appsecret=req.appsecret, force_refresh=True)
    return success({"valid": True, "appid": req.appid})


@router.post("/upload-image")
async def upload_image(
    appid: str = Form(...),
    appsecret: str = Form(...),
    file: UploadFile = File(...),
):
    content = await file.read()
    filename = file.filename or "image.png"
    url = wechat_service.upload_image_to_wechat(content, filename, appid=appid, appsecret=appsecret)
    return success({"url": url, "filename": filename, "size": len(content)})


@router.post("/draft")
async def create_draft(req: DraftReq):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        publish_draft_sync,
        req.article.model_dump(),
        req.appid,
        req.appsecret,
    )
    return success(result)
```

Update `backend/app/api/v1/router.py` — imports and includes:

```python
import time

import httpx
from fastapi import APIRouter

from app.api.v1.wechat_stateless import router as wechat_stateless_router
from app.api.v1.publish import router as publish_router
from app.core.config import APP_VERSION, GITHUB_REPO
from app.core.response import success

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(wechat_stateless_router)
api_router.include_router(publish_router)

_version_cache: dict = {"latest": "", "checked_at": 0}


@api_router.get("/version")
async def get_version():
    return success({"version": APP_VERSION, "repo": GITHUB_REPO})


@api_router.get("/version/check")
async def check_version():
    now = time.time()
    if _version_cache["latest"] and now - _version_cache["checked_at"] < 3600:
        latest = _version_cache["latest"]
    else:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                    headers={"Accept": "application/vnd.github.v3+json"},
                )
                data = r.json()
                latest = data.get("tag_name", "").lstrip("v")
                if latest:
                    _version_cache["latest"] = latest
                    _version_cache["checked_at"] = now
        except Exception:
            latest = ""

    def _norm(v: str) -> str:
        parts = v.split(".")
        while len(parts) > 1 and parts[-1] == "0":
            parts.pop()
        return ".".join(parts)

    has_update = bool(latest and _norm(latest) != _norm(APP_VERSION))
    return success({"current": APP_VERSION, "latest": latest or APP_VERSION, "has_update": has_update})
```

Temporarily shim `publish_draft_sync` so this task compiles — replace `backend/app/services/publish_adapter.py` with:

```python
import logging

from app.services import wechat_service
from app.services.css_inline import inline_css, strip_wechat_unsupported_css
from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.wechat_sanitize import sanitize_for_wechat


def process_html_for_copy(html: str, css: str, *, appid: str, appsecret: str) -> str:
    if not appid or not appsecret:
        from app.core.exceptions import AppError
        raise AppError(code=400, message="未配置公众号 AppID/AppSecret")
    processed = process_for_wechat(html, css)
    return wechat_service.process_html_images(processed, appid=appid, appsecret=appsecret)


def publish_draft_sync(article: dict, appid: str, appsecret: str) -> dict:
    logger = logging.getLogger(__name__)
    title = article.get("title", "")
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info("[publish] title=%r html=%d css=%d", title, len(html), len(css))

    processed_html = process_for_wechat(html, css)
    processed_html = wechat_service.process_html_images(processed_html, appid=appid, appsecret=appsecret)

    return wechat_service.create_draft(
        appid=appid,
        appsecret=appsecret,
        title=title,
        html=processed_html,
        author=article.get("author", ""),
        digest=article.get("digest", ""),
        thumb_media_id="",
        content_source_url="",
    )


_strip_wechat_unsupported_css = strip_wechat_unsupported_css
_inline_css = inline_css
_sanitize_for_wechat = sanitize_for_wechat
_process_for_wechat = process_for_wechat
```

Simplify `backend/app/api/v1/publish.py` to just preview + process-for-copy:

```python
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.response import success
from app.services import publish_adapter
from app.services.legacy_render_pipeline import preview_html

router = APIRouter(prefix="/publish", tags=["publish"])


class PreviewReq(BaseModel):
    html: str
    css: str = ""


class ProcessForCopyReq(BaseModel):
    html: str
    css: str = ""
    appid: str
    appsecret: str


@router.post("/preview")
async def preview_wechat(req: PreviewReq):
    return success({"html": preview_html(req.html, req.css)})


@router.post("/process-for-copy")
async def process_html_for_copy(req: ProcessForCopyReq):
    processed = publish_adapter.process_html_for_copy(
        req.html, req.css, appid=req.appid, appsecret=req.appsecret,
    )
    return success({"html": processed})
```

Delete `backend/app/api/v1/articles.py`, `backend/app/api/v1/mbdoc.py`, `backend/app/api/v1/images.py`, and `backend/app/api/v1/wechat.py`.

Delete dependent services that these files pulled in: `backend/app/services/article_service.py`, `backend/app/services/mbdoc_storage.py`, `backend/app/services/image_service.py`, `backend/app/services/showcase_seed.py`, `backend/app/services/media_uploader.py`, `backend/app/services/wechat_publisher.py`, `backend/app/services/document_projector.py`.

Delete tests that referenced the removed routers/services: `backend/tests/test_articles_api.py`, `backend/tests/test_mbdoc_api.py`, `backend/tests/test_mbdoc_storage.py`, `backend/tests/test_mbdoc_projection_route.py`, `backend/tests/test_showcase_seed.py`, `backend/tests/test_demo_article_allowlist.py`, `backend/tests/test_publish_adapter_parity.py`, `backend/tests/test_publish_support_services.py`.

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/test_wechat_stateless_api.py -x`

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```
cd backend && git add app/api/v1/wechat_stateless.py app/api/v1/router.py app/api/v1/publish.py app/services/publish_adapter.py app/services/wechat_service.py tests/test_wechat_stateless_api.py && git rm app/api/v1/articles.py app/api/v1/mbdoc.py app/api/v1/images.py app/api/v1/wechat.py app/services/article_service.py app/services/mbdoc_storage.py app/services/image_service.py app/services/showcase_seed.py app/services/media_uploader.py app/services/wechat_publisher.py app/services/document_projector.py tests/test_articles_api.py tests/test_mbdoc_api.py tests/test_mbdoc_storage.py tests/test_mbdoc_projection_route.py tests/test_showcase_seed.py tests/test_demo_article_allowlist.py tests/test_publish_adapter_parity.py tests/test_publish_support_services.py && git commit -m "feat(backend): add stateless /wechat router, drop file-backed endpoints

Introduce POST /wechat/test-connection, /wechat/upload-image, and
/wechat/draft, each taking credentials per request. Delete /articles,
/mbdoc, /images, and the old /config router along with their services
and tests."
```

### Task 4: Align remaining backend test fixtures

**Files:**
- Modify: `backend/tests/test_smoke.py`
- Modify: `backend/tests/test_heading_paragraph_renderer.py` (drop article-service usage if present)
- Modify: `backend/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Run the existing suite and record failures.

Command: `cd backend && python -m pytest -x --maxfail=1`

Document first failure message.

- [ ] **Step 2: Run test to verify it fails**

Same command as Step 1. Expected: ImportError or 404 in whichever test still imports `article_service` / `mbdoc_storage` / `image_service`.

- [ ] **Step 3: Implement minimal code**

For each failing test file:
- If it imports `article_service`, `mbdoc_storage`, `image_service`, `wechat_publisher`, `media_uploader`, or `document_projector`, remove those imports and rewrite the test to exercise the stateless surface (pure renderers, `wechat_service.process_html_images`, or the new `/wechat/*` endpoints).
- For `test_cli.py`: if the CLI depended on `article_service`, either delete the CLI command and remove the test, or (if CLI is worth keeping) update the CLI to accept a JSON article payload from stdin — out of scope for this plan, so delete the CLI file `backend/app/cli/__init__.py` and its test.
- For `test_smoke.py`: keep only endpoints still wired (`/healthz`, `/api/v1/version`, `/api/v1/wechat/test-connection` with mocked httpx).

If a test cannot be salvaged without rewriting production behavior, delete it (document the reason in the commit).

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest`

Expected: full suite green, zero collection errors.

- [ ] **Step 5: Commit**

```
cd backend && git add -A tests && git add -A app && git commit -m "refactor(backend): realign remaining tests with stateless surface

Drop imports of deleted article/mbdoc/image services from smoke, CLI,
and renderer tests. Remove the CLI entry point since it required a
file-backed article store."
```

### Task 5: Docker compose strips data volume

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_wechat_stateless_api.py`:

```python
def test_compose_has_no_data_volume():
    from pathlib import Path
    content = Path(__file__).resolve().parents[2].joinpath("docker-compose.yml").read_text(encoding="utf-8")
    assert "./data:/app/data" not in content
    assert "IMAGES_DIR" not in content
    assert "ARTICLES_DIR" not in content
    assert "MBDOCS_DIR" not in content
    assert "CONFIG_FILE" not in content
    assert "MAX_UPLOAD_SIZE" in content
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/test_wechat_stateless_api.py::test_compose_has_no_data_volume -x`

Expected: assertion failure on `"./data:/app/data" not in content`.

- [ ] **Step 3: Implement minimal code**

Replace `docker-compose.yml` entirely:

```yaml
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "7073:80"
    depends_on:
      backend:
        condition: service_healthy

  backend:
    build: ./backend
    ports:
      - "7072:8000"
    environment:
      - MAX_UPLOAD_SIZE=52428800
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/version')"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/test_wechat_stateless_api.py::test_compose_has_no_data_volume -x`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```
git add docker-compose.yml backend/tests/test_wechat_stateless_api.py && git commit -m "chore(docker): drop data volume and *_DIR env vars

Backend is stateless now; user data lives in browser localStorage.
Keep MAX_UPLOAD_SIZE for request-size guardrails."
```

## Stage 2: Frontend local stores

### Task 6: Failing test for wechatStore

**Files:**
- Create: `frontend/src/stores/wechatStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/stores/wechatStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useWeChatStore } from "./wechatStore";

describe("wechatStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWeChatStore.getState().reset();
  });

  it("starts empty", () => {
    const state = useWeChatStore.getState();
    expect(state.accounts).toEqual([]);
    expect(state.activeAccountId).toBeNull();
  });

  it("adds an account and activates it", () => {
    const id = useWeChatStore.getState().addAccount({ name: "MB", appid: "wxA", appsecret: "sec" });
    const state = useWeChatStore.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].id).toBe(id);
    expect(state.activeAccountId).toBe(id);
    expect(state.getActiveAccount()?.appid).toBe("wxA");
  });

  it("updates an existing account", () => {
    const id = useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "s1" });
    useWeChatStore.getState().updateAccount(id, { name: "A2", appsecret: "s2" });
    const acct = useWeChatStore.getState().getActiveAccount();
    expect(acct?.name).toBe("A2");
    expect(acct?.appsecret).toBe("s2");
    expect(acct?.appid).toBe("wxA");
  });

  it("removes an account and reassigns activeAccountId", () => {
    const a = useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "s" });
    const b = useWeChatStore.getState().addAccount({ name: "B", appid: "wxB", appsecret: "s" });
    useWeChatStore.getState().removeAccount(a);
    const state = useWeChatStore.getState();
    expect(state.accounts.map((x) => x.id)).toEqual([b]);
    expect(state.activeAccountId).toBe(b);
  });

  it("persists to localStorage under mbeditor.wechat", () => {
    useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "s" });
    const raw = localStorage.getItem("mbeditor.wechat");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accounts[0].appid).toBe("wxA");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/stores/wechatStore.test.ts`

Expected: `Cannot find module './wechatStore'`.

- [ ] **Step 3: Implement minimal code**

Create `frontend/src/stores/wechatStore.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WeChatAccount {
  id: string;
  name: string;
  appid: string;
  appsecret: string;
}

interface WeChatState {
  accounts: WeChatAccount[];
  activeAccountId: string | null;
  addAccount: (data: Omit<WeChatAccount, "id">) => string;
  updateAccount: (id: string, patch: Partial<Omit<WeChatAccount, "id">>) => void;
  removeAccount: (id: string) => void;
  setActive: (id: string | null) => void;
  getActiveAccount: () => WeChatAccount | null;
  reset: () => void;
}

function generateId(): string {
  return "acct_" + Math.random().toString(36).slice(2, 10);
}

export const useWeChatStore = create<WeChatState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      addAccount: ({ name, appid, appsecret }) => {
        const id = generateId();
        set((state) => ({
          accounts: [...state.accounts, { id, name, appid, appsecret }],
          activeAccountId: state.activeAccountId ?? id,
        }));
        return id;
      },
      updateAccount: (id, patch) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeAccount: (id) =>
        set((state) => {
          const accounts = state.accounts.filter((a) => a.id !== id);
          const activeAccountId =
            state.activeAccountId === id ? (accounts[0]?.id ?? null) : state.activeAccountId;
          return { accounts, activeAccountId };
        }),
      setActive: (id) => set({ activeAccountId: id }),
      getActiveAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find((a) => a.id === activeAccountId) ?? null;
      },
      reset: () => set({ accounts: [], activeAccountId: null }),
    }),
    {
      name: "mbeditor.wechat",
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
      }),
    }
  )
);
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/stores/wechatStore.test.ts`

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/stores/wechatStore.ts src/stores/wechatStore.test.ts && git commit -m "feat(frontend): add wechatStore persisted to localStorage

Track multiple WeChat accounts client-side under mbeditor.wechat;
expose addAccount/updateAccount/removeAccount/setActive/getActiveAccount."
```

### Task 7: Failing test for local articlesStore

**Files:**
- Create: `frontend/src/stores/articlesStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/stores/articlesStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useArticlesStore } from "./articlesStore";

describe("articlesStore (local)", () => {
  beforeEach(() => {
    localStorage.clear();
    useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  });

  it("createArticle returns a new article with a generated id", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    expect(article.id).toMatch(/^[a-z0-9]{12}$/);
    expect(article.title).toBe("Hello");
    expect(useArticlesStore.getState().articles).toHaveLength(1);
  });

  it("updateArticle merges fields and updates updated_at", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    const before = article.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await useArticlesStore.getState().updateArticle(article.id, { html: "<p>hi</p>" });
    expect(updated.html).toBe("<p>hi</p>");
    expect(updated.updated_at).not.toBe(before);
  });

  it("deleteArticle removes from store", async () => {
    const a = await useArticlesStore.getState().createArticle("A", "html");
    await useArticlesStore.getState().deleteArticle(a.id);
    expect(useArticlesStore.getState().articles).toHaveLength(0);
  });

  it("persists to localStorage under mbeditor.articles", async () => {
    await useArticlesStore.getState().createArticle("Persist", "html");
    const raw = localStorage.getItem("mbeditor.articles");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.articles[0].title).toBe("Persist");
  });

  it("fetchArticles is a no-op that returns from store", async () => {
    await useArticlesStore.getState().createArticle("A", "html");
    await useArticlesStore.getState().fetchArticles();
    expect(useArticlesStore.getState().articles).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/stores/articlesStore.test.ts`

Expected: failures because current store calls `api.get("/articles")` and jsdom has no server.

- [ ] **Step 3: Implement minimal code**

Replace `frontend/src/stores/articlesStore.ts` entirely:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleFull, ArticleMode, ArticleSummary } from "@/types";

type ArticleUpdateData = Partial<Omit<ArticleFull, "id" | "created_at" | "updated_at">>;

function generateId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyArticle(id: string, title: string, mode: ArticleMode): ArticleFull {
  const ts = nowIso();
  return {
    id,
    title,
    mode,
    cover: "",
    created_at: ts,
    updated_at: ts,
    html: "",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

interface ArticlesState {
  articles: (ArticleSummary | ArticleFull)[];
  currentArticleId: string | null;
  loading: boolean;

  fetchArticles: () => Promise<void>;
  fetchArticle: (id: string) => Promise<ArticleFull>;
  createArticle: (title: string, mode: ArticleMode) => Promise<ArticleFull>;
  updateArticle: (id: string, data: ArticleUpdateData) => Promise<ArticleFull>;
  deleteArticle: (id: string) => Promise<void>;
  setCurrentArticle: (id: string | null) => void;
  replaceAll: (articles: ArticleFull[]) => void;
}

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => ({
      articles: [],
      currentArticleId: null,
      loading: false,

      fetchArticles: async () => {
        // Local-only; nothing to fetch.
      },

      fetchArticle: async (id) => {
        const found = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!found) {
          throw new Error(`Article ${id} not found`);
        }
        set({ currentArticleId: id });
        return found;
      },

      createArticle: async (title, mode) => {
        const article = emptyArticle(generateId(), title, mode);
        set((state) => ({
          articles: [article, ...state.articles],
          currentArticleId: article.id,
        }));
        return article;
      },

      updateArticle: async (id, data) => {
        const existing = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!existing) {
          throw new Error(`Article ${id} not found`);
        }
        const merged: ArticleFull = {
          ...existing,
          ...data,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: nowIso(),
        };
        set((state) => ({
          articles: state.articles.map((a) => (a.id === id ? merged : a)),
          currentArticleId: id,
        }));
        return merged;
      },

      deleteArticle: async (id) => {
        set((state) => ({
          articles: state.articles.filter((a) => a.id !== id),
          currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
        }));
      },

      setCurrentArticle: (id) => set({ currentArticleId: id }),

      replaceAll: (articles) => set({ articles, currentArticleId: null }),
    }),
    {
      name: "mbeditor.articles",
      partialize: (state) => ({ articles: state.articles }),
    }
  )
);
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/stores/articlesStore.test.ts`

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/stores/articlesStore.ts src/stores/articlesStore.test.ts && git commit -m "refactor(frontend): make articlesStore a local-first persisted store

Drop all /api/v1/articles round-trips. Articles now live in localStorage
under mbeditor.articles. Public API surface (fetchArticles, fetchArticle,
createArticle, updateArticle, deleteArticle, setCurrentArticle) is
preserved so callers do not break."
```

### Task 8: Failing test for mbdocStore

**Files:**
- Create: `frontend/src/stores/mbdocStore.test.ts`
- Create: `frontend/src/stores/mbdocStore.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/stores/mbdocStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useMBDocStore } from "./mbdocStore";

describe("mbdocStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useMBDocStore.setState({ docs: [] });
  });

  it("saveDoc inserts a new doc", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "Demo", data: { blocks: [] } });
    expect(useMBDocStore.getState().docs).toHaveLength(1);
  });

  it("saveDoc upserts by id", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    useMBDocStore.getState().saveDoc({ id: "d1", title: "B", data: {} });
    const docs = useMBDocStore.getState().docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("B");
  });

  it("getDoc returns the stored doc or null", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    expect(useMBDocStore.getState().getDoc("d1")?.title).toBe("A");
    expect(useMBDocStore.getState().getDoc("missing")).toBeNull();
  });

  it("deleteDoc removes by id", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    useMBDocStore.getState().deleteDoc("d1");
    expect(useMBDocStore.getState().docs).toHaveLength(0);
  });

  it("persists under mbeditor.mbdocs", () => {
    useMBDocStore.getState().saveDoc({ id: "d1", title: "A", data: {} });
    const raw = localStorage.getItem("mbeditor.mbdocs");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.docs[0].id).toBe("d1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/stores/mbdocStore.test.ts`

Expected: `Cannot find module './mbdocStore'`.

- [ ] **Step 3: Implement minimal code**

Create `frontend/src/stores/mbdocStore.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MBDocRecord {
  id: string;
  title: string;
  data: unknown;
}

interface MBDocState {
  docs: MBDocRecord[];
  saveDoc: (doc: MBDocRecord) => void;
  getDoc: (id: string) => MBDocRecord | null;
  deleteDoc: (id: string) => void;
  replaceAll: (docs: MBDocRecord[]) => void;
}

export const useMBDocStore = create<MBDocState>()(
  persist(
    (set, get) => ({
      docs: [],
      saveDoc: (doc) =>
        set((state) => {
          const exists = state.docs.some((d) => d.id === doc.id);
          return {
            docs: exists ? state.docs.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...state.docs],
          };
        }),
      getDoc: (id) => get().docs.find((d) => d.id === id) ?? null,
      deleteDoc: (id) => set((state) => ({ docs: state.docs.filter((d) => d.id !== id) })),
      replaceAll: (docs) => set({ docs }),
    }),
    {
      name: "mbeditor.mbdocs",
      partialize: (state) => ({ docs: state.docs }),
    }
  )
);
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/stores/mbdocStore.test.ts`

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/stores/mbdocStore.ts src/stores/mbdocStore.test.ts && git commit -m "feat(frontend): add mbdocStore persisted to localStorage

Mirrors the articlesStore pattern but keyed on MBDoc id. Public API:
saveDoc/getDoc/deleteDoc/replaceAll. Persists under mbeditor.mbdocs."
```

### Task 9: Extend types for WeChatAccount and legacy bundle

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/types/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WeChatAccount, LegacyExportBundle } from "./index";

describe("types", () => {
  it("WeChatAccount has the expected shape", () => {
    const a: WeChatAccount = { id: "x", name: "n", appid: "wxA", appsecret: "s" };
    expect(a.appid).toBe("wxA");
  });

  it("LegacyExportBundle has articles and mbdocs arrays", () => {
    const b: LegacyExportBundle = { version: 1, exported_at: "now", articles: [], mbdocs: [] };
    expect(b.articles).toEqual([]);
    expect(b.mbdocs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/types/index.test.ts`

Expected: TypeScript cannot find `WeChatAccount` / `LegacyExportBundle`.

- [ ] **Step 3: Implement minimal code**

Append to `frontend/src/types/index.ts`:

```ts
export interface WeChatAccount {
  id: string;
  name: string;
  appid: string;
  appsecret: string;
}

export interface LegacyExportBundle {
  version: 1;
  exported_at: string;
  articles: ArticleFull[];
  mbdocs: { id: string; title: string; data: unknown }[];
}
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/types/index.test.ts`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/types/index.ts src/types/index.test.ts && git commit -m "feat(frontend): add WeChatAccount and LegacyExportBundle types"
```

## Stage 3: Wiring — Settings, ArticleList, and publish flow

### Task 10: Rewire SettingsSurface onto wechatStore

**Files:**
- Modify: `frontend/src/surfaces/settings/SettingsSurface.tsx`
- Modify: `frontend/src/surfaces/settings/SettingsSurface.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the body of `frontend/src/surfaces/settings/SettingsSurface.test.tsx` with:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSurface } from "./SettingsSurface";
import { useWeChatStore } from "@/stores/wechatStore";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { code: 0, message: "ok", data: { valid: true } } }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  useWeChatStore.getState().reset();
});

describe("SettingsSurface WeChat section", () => {
  it("adds a new account through the form and persists to store", async () => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /添加公众号|add account/i }));

    fireEvent.change(screen.getByLabelText(/名称|account name/i), { target: { value: "MB 科技" } });
    fireEvent.change(screen.getByLabelText(/appid/i), { target: { value: "wxa7b6e6test" } });
    fireEvent.change(screen.getByLabelText(/appsecret/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));

    await waitFor(() => {
      expect(useWeChatStore.getState().accounts).toHaveLength(1);
    });
    expect(useWeChatStore.getState().accounts[0].appid).toBe("wxa7b6e6test");
  });

  it("calls /wechat/test-connection with active account creds", async () => {
    useWeChatStore.getState().addAccount({ name: "Existing", appid: "wxA", appsecret: "s" });
    const { default: api } = await import("@/lib/api");

    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /测试连接|test connection/i }));

    await waitFor(() => {
      expect((api.post as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "/wechat/test-connection",
        { appid: "wxA", appsecret: "s" },
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/surfaces/settings/SettingsSurface.test.tsx`

Expected: failures because current surface calls `/config`, not `/wechat/test-connection`, and has no "添加公众号" button.

- [ ] **Step 3: Implement minimal code**

Rewrite the `WeChatSection` in `frontend/src/surfaces/settings/SettingsSurface.tsx` (keep the surrounding layout identical). The new section reads/writes `useWeChatStore`, renders a list of accounts, and has add/edit/remove/test buttons:

```tsx
import { useState } from "react";
import api from "@/lib/api";
import { useWeChatStore, type WeChatAccount } from "@/stores/wechatStore";
import { toast } from "@/stores/toastStore";
import { getErrorMessage } from "@/lib/api";
import { readLegacyBundle, applyLegacyBundle } from "@/lib/legacyImport";

function WeChatSection() {
  const accounts = useWeChatStore((s) => s.accounts);
  const activeAccountId = useWeChatStore((s) => s.activeAccountId);
  const addAccount = useWeChatStore((s) => s.addAccount);
  const updateAccount = useWeChatStore((s) => s.updateAccount);
  const removeAccount = useWeChatStore((s) => s.removeAccount);
  const setActive = useWeChatStore((s) => s.setActive);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; appid: string; appsecret: string }>({
    name: "",
    appid: "",
    appsecret: "",
  });
  const [testing, setTesting] = useState(false);

  const beginAdd = () => {
    setEditingId("__new");
    setDraft({ name: "", appid: "", appsecret: "" });
  };

  const beginEdit = (a: WeChatAccount) => {
    setEditingId(a.id);
    setDraft({ name: a.name, appid: a.appid, appsecret: a.appsecret });
  };

  const save = () => {
    const payload = { name: draft.name.trim(), appid: draft.appid.trim(), appsecret: draft.appsecret.trim() };
    if (!payload.appid || !payload.appsecret) {
      toast.error("AppID 和 AppSecret 不能为空");
      return;
    }
    if (editingId === "__new") {
      addAccount(payload);
    } else if (editingId) {
      updateAccount(editingId, payload);
    }
    setEditingId(null);
    toast.success("已保存");
  };

  const cancel = () => setEditingId(null);

  const handleTest = async () => {
    const active = accounts.find((a) => a.id === activeAccountId);
    if (!active) {
      toast.error("请先选择一个公众号");
      return;
    }
    setTesting(true);
    try {
      await api.post("/wechat/test-connection", { appid: active.appid, appsecret: active.appsecret });
      toast.success("连接成功");
    } catch (err) {
      toast.error(getErrorMessage(err, "连接失败"));
    } finally {
      setTesting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bundle = await readLegacyBundle(file);
      applyLegacyBundle(bundle);
      toast.success(`已导入 ${bundle.articles.length} 篇文章，${bundle.mbdocs.length} 个 MBDoc`);
    } catch (err) {
      toast.error(getErrorMessage(err, "导入失败"));
    } finally {
      e.target.value = "";
    }
  };

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>公众号账号</h2>
        <div>
          <button onClick={beginAdd}>添加公众号</button>
          <label style={{ marginLeft: 8, cursor: "pointer" }}>
            导入旧数据
            <input type="file" accept="application/json" onChange={handleImport} style={{ display: "none" }} />
          </label>
        </div>
      </header>

      <ul>
        {accounts.map((a) => (
          <li key={a.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="radio"
              name="active-account"
              checked={activeAccountId === a.id}
              onChange={() => setActive(a.id)}
            />
            <div style={{ flex: 1 }}>
              <div>{a.name || "(未命名)"}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{a.appid}</div>
            </div>
            <button onClick={() => beginEdit(a)}>编辑</button>
            <button onClick={() => removeAccount(a.id)}>删除</button>
          </li>
        ))}
      </ul>

      <button onClick={handleTest} disabled={testing || !activeAccountId}>
        {testing ? "测试中…" : "测试连接"}
      </button>

      {editingId && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ccc" }}>
          <label>
            名称
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </label>
          <label>
            AppID
            <input value={draft.appid} onChange={(e) => setDraft((d) => ({ ...d, appid: e.target.value }))} />
          </label>
          <label>
            AppSecret
            <input
              type="password"
              value={draft.appsecret}
              onChange={(e) => setDraft((d) => ({ ...d, appsecret: e.target.value }))}
            />
          </label>
          <button onClick={save}>保存</button>
          <button onClick={cancel}>取消</button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/surfaces/settings/SettingsSurface.test.tsx`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/surfaces/settings/SettingsSurface.tsx src/surfaces/settings/SettingsSurface.test.tsx && git commit -m "refactor(frontend): drive Settings → WeChat section off wechatStore

Multi-account list with add/edit/remove/set-active and a Test
Connection button that posts active creds to /wechat/test-connection."
```

### Task 11: Update ArticleList to read from articlesStore

**Files:**
- Modify: `frontend/src/surfaces/article-list/ArticleList.tsx`

- [ ] **Step 1: Write the failing test**

Append to existing ArticleList test file (create if missing) `frontend/src/surfaces/article-list/ArticleList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleList } from "./ArticleList";
import { useArticlesStore } from "@/stores/articlesStore";

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
});

describe("ArticleList", () => {
  it("renders articles from the local store", async () => {
    await useArticlesStore.getState().createArticle("Local Title", "html");
    render(<ArticleList />);
    expect(await screen.findByText("Local Title")).toBeInTheDocument();
  });

  it("does not call /api/v1/articles", async () => {
    const spy = vi.spyOn(globalThis, "fetch" as any);
    render(<ArticleList />);
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining("/api/v1/articles"), expect.anything());
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/surfaces/article-list/ArticleList.test.tsx`

Expected: the first test fails because `ArticleList.tsx` calls `/api/v1/articles` on mount (and the mock returns nothing).

- [ ] **Step 3: Implement minimal code**

In `frontend/src/surfaces/article-list/ArticleList.tsx`:
- Remove any `useEffect(() => { fetch("/api/v1/articles") ... })` pattern.
- Replace with `const articles = useArticlesStore((s) => s.articles)` and render that directly.
- If the component imported `api` for article CRUD, drop the import.

Concrete diff (edit inline):
- Replace any block like
  ```tsx
  useEffect(() => { api.get("/articles").then(...) }, [])
  ```
  with
  ```tsx
  const articles = useArticlesStore((s) => s.articles);
  ```
- Keep the same JSX that iterates over `articles`.

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/surfaces/article-list/ArticleList.test.tsx`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/surfaces/article-list/ArticleList.tsx src/surfaces/article-list/ArticleList.test.tsx && git commit -m "refactor(frontend): ArticleList reads directly from articlesStore"
```

### Task 12: Failing test for publish flow sending creds in body

**Files:**
- Modify: `frontend/src/surfaces/editor/AgentCopilot.tsx` (or wherever `/api/v1/publish/draft` is invoked)
- Create: `frontend/src/surfaces/editor/AgentCopilot.test.tsx` (if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/surfaces/editor/AgentCopilot.publish.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCopilot } from "./AgentCopilot";
import { useWeChatStore } from "@/stores/wechatStore";
import { useArticlesStore } from "@/stores/articlesStore";

const postSpy = vi.fn().mockResolvedValue({ data: { code: 0, message: "ok", data: { media_id: "m-1" } } });
vi.mock("@/lib/api", () => ({
  default: { post: postSpy, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (e: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  postSpy.mockClear();
  localStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
});

describe("AgentCopilot publish", () => {
  it("POSTs /wechat/draft with active creds + article in one call", async () => {
    useWeChatStore.getState().addAccount({ name: "MB", appid: "wxA", appsecret: "secretA" });
    const a = await useArticlesStore.getState().createArticle("Hello", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });
    useArticlesStore.getState().setCurrentArticle(a.id);

    render(<AgentCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /推送到草稿|publish draft/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/wechat/draft",
        expect.objectContaining({
          appid: "wxA",
          appsecret: "secretA",
          article: expect.objectContaining({ title: "Hello", html: "<p>body</p>" }),
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/surfaces/editor/AgentCopilot.publish.test.tsx`

Expected: failure because current code posts to `/publish/draft` with only `article_id`.

- [ ] **Step 3: Implement minimal code**

In `frontend/src/surfaces/editor/AgentCopilot.tsx` (or wherever the publish handler lives — search `publish/draft`):

```tsx
import { useWeChatStore } from "@/stores/wechatStore";
import { useArticlesStore } from "@/stores/articlesStore";

// inside the publish handler:
const active = useWeChatStore.getState().getActiveAccount();
if (!active) {
  toast.error("请先在设置中添加并选择公众号");
  return;
}
const currentId = useArticlesStore.getState().currentArticleId;
const article = useArticlesStore.getState().articles.find((a) => a.id === currentId) as ArticleFull | undefined;
if (!article) {
  toast.error("没有选中的文章");
  return;
}
await api.post("/wechat/draft", {
  appid: active.appid,
  appsecret: active.appsecret,
  article: {
    title: article.title,
    html: article.html ?? "",
    css: article.css ?? "",
    author: article.author ?? "",
    digest: article.digest ?? "",
    cover: article.cover ?? "",
    mode: article.mode,
    markdown: article.markdown ?? "",
  },
});
```

Remove any remaining callers of `/publish/draft`, `/publish/process`, `/publish/html/*`, `/api/v1/articles*`, `/api/v1/mbdoc*`, `/api/v1/images*`, and `/api/v1/config*`.

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/surfaces/editor/AgentCopilot.publish.test.tsx`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/surfaces/editor/AgentCopilot.tsx src/surfaces/editor/AgentCopilot.publish.test.tsx && git commit -m "refactor(frontend): publish flow posts creds+article to stateless /wechat/draft"
```

### Task 13: Sweep remaining legacy endpoint usage

**Files:**
- Modify: any file still referencing `/api/v1/articles`, `/api/v1/mbdoc`, `/api/v1/images`, `/api/v1/config`, or `/api/v1/publish/html` / `/api/v1/publish/process`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/legacyEndpoints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("no references to removed endpoints", () => {
  const forbidden = [
    "/api/v1/articles",
    "/api/v1/mbdoc",
    "/api/v1/images",
    "/api/v1/config",
    "/publish/html",
    "/publish/process",
    "/publish/draft",
    "\"/articles\"",
    "\"/mbdoc\"",
    "\"/images\"",
    "\"/config\"",
  ];

  for (const file of walk("src")) {
    it(`${file} has no forbidden endpoint strings`, () => {
      const text = readFileSync(file, "utf-8");
      for (const needle of forbidden) {
        expect(text, `${file} contains ${needle}`).not.toContain(needle);
      }
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/lib/legacyEndpoints.test.ts`

Expected: one assertion per file that still references a legacy URL.

- [ ] **Step 3: Implement minimal code**

For each failing file, either:
- Replace the legacy API call with a store read/write (articles / mbdocs / images).
- Or replace with the new stateless endpoint (`/wechat/test-connection`, `/wechat/upload-image`, `/wechat/draft`, `/publish/preview`, `/publish/process-for-copy`) plus credentials from `useWeChatStore.getState().getActiveAccount()`.

Image upload callers should now use the new endpoint:

```ts
const active = useWeChatStore.getState().getActiveAccount();
if (!active) throw new Error("需要先配置公众号");
const form = new FormData();
form.append("appid", active.appid);
form.append("appsecret", active.appsecret);
form.append("file", file);
const { data } = await api.post("/wechat/upload-image", form, {
  headers: { "Content-Type": "multipart/form-data" },
});
const url = data.data.url as string;
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/lib/legacyEndpoints.test.ts`

Expected: all `it` blocks pass.

- [ ] **Step 5: Commit**

```
cd frontend && git add -A src && git commit -m "refactor(frontend): remove all references to legacy file-backed endpoints"
```

## Stage 4: Legacy export utility

### Task 14: Failing test for export script

**Files:**
- Create: `backend/tests/test_export_legacy.py`
- Create: `scripts/export_legacy_data.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_export_legacy.py
import json
import subprocess
import sys
from pathlib import Path


def test_export_legacy_writes_bundle(tmp_path):
    articles_dir = tmp_path / "articles"
    mbdocs_dir = tmp_path / "mbdocs"
    articles_dir.mkdir()
    mbdocs_dir.mkdir()

    (articles_dir / "a1.json").write_text(
        json.dumps({
            "id": "a1", "title": "T", "mode": "html", "html": "<p>x</p>",
            "css": "", "js": "", "markdown": "", "cover": "", "author": "", "digest": "",
            "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-02T00:00:00Z",
        }),
        encoding="utf-8",
    )
    (mbdocs_dir / "d1.json").write_text(
        json.dumps({"id": "d1", "meta": {"title": "Doc"}, "blocks": []}),
        encoding="utf-8",
    )

    script = Path(__file__).resolve().parents[2] / "scripts" / "export_legacy_data.py"
    output = tmp_path / "bundle.json"

    result = subprocess.run(
        [sys.executable, str(script), "--articles-dir", str(articles_dir),
         "--mbdocs-dir", str(mbdocs_dir), "--output", str(output)],
        capture_output=True, text=True, check=True,
    )

    assert output.exists(), result.stderr
    bundle = json.loads(output.read_text(encoding="utf-8"))
    assert bundle["version"] == 1
    assert len(bundle["articles"]) == 1
    assert bundle["articles"][0]["id"] == "a1"
    assert len(bundle["mbdocs"]) == 1
    assert bundle["mbdocs"][0]["id"] == "d1"
    assert bundle["mbdocs"][0]["title"] == "Doc"
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/test_export_legacy.py -x`

Expected: `FileNotFoundError` for `scripts/export_legacy_data.py`.

- [ ] **Step 3: Implement minimal code**

Create `scripts/export_legacy_data.py`:

```python
#!/usr/bin/env python3
"""Export the legacy data/ directory into a single JSON bundle.

This script is run once during the Plan A migration. The resulting bundle
can be imported back into MBEditor through Settings → "Import legacy data"
which writes to localStorage.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def load_articles(articles_dir: Path) -> list[dict]:
    out: list[dict] = []
    if not articles_dir.exists():
        return out
    for f in sorted(articles_dir.glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return out


def load_mbdocs(mbdocs_dir: Path) -> list[dict]:
    out: list[dict] = []
    if not mbdocs_dir.exists():
        return out
    for f in sorted(mbdocs_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        title = ""
        if isinstance(data.get("meta"), dict):
            title = data["meta"].get("title", "")
        out.append({"id": data.get("id", f.stem), "title": title, "data": data})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--articles-dir", default="data/articles")
    parser.add_argument("--mbdocs-dir", default="data/mbdocs")
    parser.add_argument("--output", default=None,
                        help="Output file path. Default: data/legacy-export-<ts>.json")
    args = parser.parse_args()

    articles = load_articles(Path(args.articles_dir))
    mbdocs = load_mbdocs(Path(args.mbdocs_dir))

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = Path(args.output) if args.output else Path("data") / f"legacy-export-{ts}.json"
    output.parent.mkdir(parents=True, exist_ok=True)

    bundle = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "articles": articles,
        "mbdocs": mbdocs,
    }
    output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(articles)} articles and {len(mbdocs)} mbdocs to {output}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/test_export_legacy.py -x`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```
git add scripts/export_legacy_data.py backend/tests/test_export_legacy.py && git commit -m "feat(scripts): one-time legacy data exporter

Reads data/articles/*.json and data/mbdocs/*.json into a single
versioned JSON bundle. Operators run this once, then import the bundle
through Settings on a running browser to repopulate localStorage."
```

### Task 15: Failing test for legacyImport.ts

**Files:**
- Create: `frontend/src/lib/legacyImport.ts`
- Create: `frontend/src/lib/legacyImport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/legacyImport.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { applyLegacyBundle, parseLegacyBundle, readLegacyBundle } from "./legacyImport";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore } from "@/stores/mbdocStore";

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useMBDocStore.setState({ docs: [] });
});

describe("legacyImport", () => {
  const sampleBundle = {
    version: 1,
    exported_at: "2025-01-01T00:00:00Z",
    articles: [{
      id: "a1", title: "T", mode: "html", html: "<p>x</p>", css: "", js: "",
      markdown: "", cover: "", author: "", digest: "",
      created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
    }],
    mbdocs: [{ id: "d1", title: "Doc", data: { id: "d1", blocks: [] } }],
  };

  it("parseLegacyBundle accepts a valid bundle", () => {
    const parsed = parseLegacyBundle(JSON.stringify(sampleBundle));
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.mbdocs).toHaveLength(1);
  });

  it("parseLegacyBundle rejects wrong version", () => {
    expect(() => parseLegacyBundle(JSON.stringify({ ...sampleBundle, version: 2 }))).toThrow();
  });

  it("applyLegacyBundle populates both stores", () => {
    applyLegacyBundle(sampleBundle as any);
    expect(useArticlesStore.getState().articles).toHaveLength(1);
    expect(useMBDocStore.getState().docs).toHaveLength(1);
  });

  it("readLegacyBundle parses a File", async () => {
    const blob = new Blob([JSON.stringify(sampleBundle)], { type: "application/json" });
    const file = new File([blob], "bundle.json");
    const bundle = await readLegacyBundle(file);
    expect(bundle.articles).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd frontend && npm test -- src/lib/legacyImport.test.ts`

Expected: `Cannot find module './legacyImport'`.

- [ ] **Step 3: Implement minimal code**

Create `frontend/src/lib/legacyImport.ts`:

```ts
import type { ArticleFull, LegacyExportBundle } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore, type MBDocRecord } from "@/stores/mbdocStore";

export function parseLegacyBundle(raw: string): LegacyExportBundle {
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1) {
    throw new Error(`Unsupported bundle version: ${parsed?.version}`);
  }
  if (!Array.isArray(parsed.articles) || !Array.isArray(parsed.mbdocs)) {
    throw new Error("Bundle is missing articles or mbdocs arrays");
  }
  return parsed as LegacyExportBundle;
}

export async function readLegacyBundle(file: File): Promise<LegacyExportBundle> {
  const text = await file.text();
  return parseLegacyBundle(text);
}

export function applyLegacyBundle(bundle: LegacyExportBundle): void {
  const articles = bundle.articles as ArticleFull[];
  useArticlesStore.getState().replaceAll(articles);

  const docs: MBDocRecord[] = bundle.mbdocs.map((d) => ({ id: d.id, title: d.title, data: d.data }));
  useMBDocStore.getState().replaceAll(docs);
}
```

- [ ] **Step 4: Run test to verify pass**

Command: `cd frontend && npm test -- src/lib/legacyImport.test.ts`

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```
cd frontend && git add src/lib/legacyImport.ts src/lib/legacyImport.test.ts && git commit -m "feat(frontend): legacy bundle importer

Parses the output of scripts/export_legacy_data.py and writes it into
articlesStore + mbdocStore in one step. Wired into SettingsSurface via
the 'Import legacy data' button."
```

## Stage 5: Playwright regression and verification

### Task 16: Baseline snapshot before visual re-check

**Files:**
- Modify: `backend/tests/visual/test_baseline.py` (update fixture to seed via API-less path — create an article through the articlesStore in-page, or via the Playwright page's localStorage)

- [ ] **Step 1: Write the failing test**

Append a new case to `backend/tests/visual/test_baseline.py`:

```python
def test_editor_preview_matches_wechat_draft_after_local_seed(page, live_server_url):
    """After the stateless refactor, seeding the editor via localStorage and
    publishing should still produce the same draft HTML as the editor preview."""
    # Seed both articles and wechat account into localStorage before navigating.
    page.goto(live_server_url + "/")
    page.evaluate(
        """
        ({ appid, appsecret }) => {
          const articles = [{
            id: "seeded1", title: "Baseline", mode: "html", cover: "",
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            html: "<h1>Baseline</h1><p>hello</p>", css: "h1 { color: #111 }",
            js: "", markdown: "", author: "", digest: ""
          }];
          localStorage.setItem("mbeditor.articles", JSON.stringify({
            state: { articles }, version: 0
          }));
          localStorage.setItem("mbeditor.wechat", JSON.stringify({
            state: {
              accounts: [{ id: "acct_x", name: "Test", appid, appsecret }],
              activeAccountId: "acct_x"
            },
            version: 0
          }));
        }
        """,
        {"appid": "wxA_test", "appsecret": "secret_test"},
    )
    page.reload()
    page.get_by_text("Baseline").click()

    preview_html = page.locator("[data-role='wechat-preview']").inner_html()
    # Compare against the /publish/preview response — both must match.
    import httpx
    resp = httpx.post(live_server_url + "/api/v1/publish/preview",
                       json={"html": "<h1>Baseline</h1><p>hello</p>", "css": "h1 { color: #111 }"})
    assert resp.json()["data"]["html"].strip() == preview_html.strip()
```

- [ ] **Step 2: Run test to verify it fails**

Command: `cd backend && python -m pytest tests/visual/test_baseline.py::test_editor_preview_matches_wechat_draft_after_local_seed -x`

Expected: whichever of the two sides drifted first (most likely the editor, which previously read the article over HTTP).

- [ ] **Step 3: Implement minimal code**

Ensure the editor bootstraps from `useArticlesStore` when given an article id in the URL / query — if not already wired, fix the route handler in `frontend/src/app/` or the editor surface. Make the selector `[data-role='wechat-preview']` present on the preview pane if it isn't already.

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/visual/test_baseline.py::test_editor_preview_matches_wechat_draft_after_local_seed -x`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```
git add backend/tests/visual/test_baseline.py frontend/src && git commit -m "test(visual): assert editor preview equals /publish/preview after local seed"
```

### Task 17: Re-run existing Playwright regression suite

**Files:**
- Modify (if needed): `backend/tests/visual/_artifacts/*` baselines.

- [ ] **Step 1: Write the failing test**

Command-only task: run the full visual suite.

Command: `cd backend && python -m pytest tests/visual/ -x --maxfail=1`

- [ ] **Step 2: Run test to verify it fails**

Same as above.

Expected: most likely drift in screenshots that previously relied on the `/images` static mount (now removed) or seeded showcase data (no longer auto-seeded). Capture each failure's diff in `_artifacts/`.

- [ ] **Step 3: Implement minimal code**

For each failing screenshot, decide:
1. **If the diff is an expected consequence of removing showcase auto-seed:** seed the showcase data manually in the test setup via `localStorage.setItem("mbeditor.articles", ...)` before `page.goto`, and re-assert against the original baseline.
2. **If the diff is a real render regression:** fix the renderer (do NOT update the baseline).
3. **If the diff is a cosmetic shift from layout changes in SettingsSurface:** re-capture the baseline and commit the new PNG with a commit message explaining the change.

Never skip a failure.

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest tests/visual/ -x`

Expected: full visual suite green.

- [ ] **Step 5: Commit**

```
git add backend/tests/visual/_artifacts && git commit -m "test(visual): refresh baselines for stateless refactor

Only baselines tied to layout reorganizations in Settings updated.
Render-path screenshots unchanged: editor↔draft parity preserved."
```

### Task 18: Full suite green

**Files:**
- None directly; this is a guardrail commit.

- [ ] **Step 1: Write the failing test**

Run the whole suite.

Command: `cd backend && python -m pytest && cd ../frontend && npm test`

- [ ] **Step 2: Run test to verify it fails**

Same.

Expected: any dangling import errors or stale mocks.

- [ ] **Step 3: Implement minimal code**

Fix each failure in place. If a test no longer describes intended behavior (e.g. it asserted the existence of `/api/v1/articles`), delete it with a commit message explaining the scope change.

- [ ] **Step 4: Run test to verify pass**

Command: `cd backend && python -m pytest && cd ../frontend && npm test`

Expected: 0 failing tests across both suites.

- [ ] **Step 5: Commit**

```
git commit --allow-empty -m "test: confirm full green suite after Plan A stateless refactor"
```

## Verification checklist

Run these from `D:/Web/MBEditor`:

```bash
# Backend is stateless
cd backend && python -m pytest -q
# Expect: all tests pass, no test_articles_api / test_mbdoc_api / test_images_api collected.

# Frontend tests green
cd ../frontend && npm test -- --run
# Expect: vitest green, including wechatStore, articlesStore (local), mbdocStore, legacyImport.

# Visual parity
cd ../backend && python -m pytest tests/visual/ -q
# Expect: all screenshot diffs zero.

# Docker compose boots without a data volume
cd .. && docker compose up -d --build backend
# Expect: container healthy, no `/app/data` directory created on host.

# Stateless endpoints work with valid creds
curl -s -X POST http://localhost:7072/api/v1/wechat/test-connection \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg id "$(jq -r .appid data/config.json)" --arg sec "$(jq -r .appsecret data/config.json)" '{appid:$id, appsecret:$sec}')"
# Expect: {"code":0,"message":"ok","data":{"valid":true,"appid":"..."}}

# Removed endpoints return 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7072/api/v1/articles
# Expect: 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7072/api/v1/mbdoc
# Expect: 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7072/api/v1/config
# Expect: 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7072/api/v1/images
# Expect: 404

# localStorage round-trip (manual via browser devtools on http://localhost:7073)
# 1. Open Settings → add account with creds from data/config.json → Save.
# 2. DevTools → Application → Local Storage → "mbeditor.wechat" must contain {accounts:[...], activeAccountId:"acct_..."}
# 3. Create a new article, enter a title, refresh the page.
# 4. "mbeditor.articles" must contain the article after reload, and the list surface must render it without any network call to /api/v1/articles.

# Legacy export utility
python scripts/export_legacy_data.py --articles-dir data/articles --mbdocs-dir data/mbdocs --output /tmp/bundle.json
jq '.version, (.articles | length), (.mbdocs | length)' /tmp/bundle.json
# Expect: 1 on first line, counts on next two.

# End-to-end publish still reaches WeChat
# From the editor UI: open a seeded article, click "推送到草稿", watch network tab:
# only POST /api/v1/wechat/draft (with {appid, appsecret, article}) should fire.
# WeChat API returns {media_id: "..."} → toast "已推送到草稿箱".
```

If every line above matches the "Expect" annotation, Plan A is complete.
