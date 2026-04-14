# WeChat API Proxy Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HTTP/HTTPS proxy support to all WeChat API calls, configurable via frontend settings, enabling local development to pass IP whitelist requirements.

**Architecture:** A shared httpx.Client factory in `wechat_service.py` reads `proxy_url` from config.json and creates/reuses clients with or without proxy. All existing `httpx.post/get` calls switch to use this client. Frontend settings page gains a proxy URL input field.

**Tech Stack:** Python (FastAPI), httpx, React 19 + TypeScript, Tailwind CSS 4

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/services/wechat_service.py` | Modify | Add `get_http_client()` factory, modify all httpx calls to use it |
| `backend/app/api/v1/wechat.py` | Modify | Add `proxy_url` to ConfigReq model and API responses |
| `backend/app/api/v1/publish.py` | Modify | Replace standalone `httpx.get` on line 702 with `get_http_client()` |
| `backend/tests/test_wechat_proxy.py` | Create | Unit tests for proxy client factory and config save/load |
| `frontend/src/pages/Settings.tsx` | Modify | Add proxyUrl state, load/save logic |
| `frontend/src/components/settings/WechatConfigSection.tsx` | Modify | Add proxy URL input field and props |

---

### Task 1: Backend — HTTP Client Factory + Config Extension

**Files:**
- Modify: `backend/app/services/wechat_service.py`
- Test: `backend/tests/test_wechat_proxy.py`

- [ ] **Step 1: Write failing tests for get_http_client()**

Create `backend/tests/test_wechat_proxy.py`:

```python
"""Tests for WeChat API proxy configuration."""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from app.services import wechat_service


@pytest.fixture
def temp_config(tmp_path: Path):
    """Provide a temporary config file for testing."""
    config_file = tmp_path / "config.json"
    config_file.write_text('{"appid": "wx123", "appsecret": "secret456"}')
    original = wechat_service.settings.CONFIG_FILE
    wechat_service.settings.CONFIG_FILE = str(config_file)
    # Reset cache so tests start clean
    wechat_service._token_cache.clear()
    yield config_file
    wechat_service.settings.CONFIG_FILE = original


class TestGetHttpClient:
    """Tests for the HTTP client factory with proxy support."""

    def test_no_proxy_returns_direct_client(self, temp_config):
        """When proxy_url is empty/absent, client has no proxy."""
        client = wechat_service.get_http_client()
        assert client._transport._pool._proxy_url is None  # no proxy set

    def test_with_proxy_returns_proxied_client(self, temp_config):
        """When proxy_url is set, client uses it."""
        config = json.loads(temp_config.read_text())
        config["proxy_url"] = "https://proxy.example.com:8080"
        temp_config.write_text(json.dumps(config))
        
        # Clear cache to force reload
        wechat_service._proxy_client_cache.clear()
        
        client = wechat_service.get_http_client()
        assert client._transport._pool._proxy_url is not None

    def test_same_proxy_returns_cached_client(self, temp_config):
        """Same proxy URL returns the same cached client instance."""
        config = json.loads(temp_config.read_text())
        config["proxy_url"] = "https://proxy.example.com:8080"
        temp_config.write_text(json.dumps(config))
        wechat_service._proxy_client_cache.clear()
        
        client1 = wechat_service.get_http_client()
        client2 = wechat_service.get_http_client()
        assert client1 is client2


class TestProxyConfigSaveLoad:
    """Tests for proxy_url persistence in config.json."""

    def test_save_config_includes_proxy_url(self, temp_config):
        """save_config writes proxy_url to config.json."""
        wechat_service.save_config("wx123", "secret456", "https://proxy.example.com:8080")
        config = json.loads(temp_config.read_text())
        assert config["proxy_url"] == "https://proxy.example.com:8080"

    def test_save_config_empty_proxy(self, temp_config):
        """save_config with empty proxy_url still writes the field."""
        wechat_service.save_config("wx123", "secret456", "")
        config = json.loads(temp_config.read_text())
        assert config["proxy_url"] == ""

    def test_load_config_returns_proxy_url(self, temp_config):
        """load_config includes proxy_url when present."""
        config_data = {"appid": "wx123", "appsecret": "sec", "proxy_url": "http://proxy:8080"}
        temp_config.write_text(json.dumps(config_data))
        result = wechat_service.load_config()
        assert result["proxy_url"] == "http://proxy:8080"

    def test_load_config_missing_proxy_url(self, temp_config):
        """load_config handles old config without proxy_url (backward compat)."""
        temp_config.write_text('{"appid": "wx123", "appsecret": "sec"}')
        result = wechat_service.load_config()
        assert result.get("proxy_url") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_wechat_proxy.py -v`
Expected: FAIL — `get_http_client` not defined, `save_config` signature mismatch.

- [ ] **Step 3: Add `_proxy_client_cache` and `get_http_client()` to wechat_service.py**

Add after the existing cache declarations (line 12):

```python
_proxy_client_cache: dict = {}  # proxy_url -> httpx.Client


def get_http_client() -> httpx.Client:
    """Get or create an httpx.Client, optionally configured with a proxy.

    Reads proxy_url from config.json. If proxy_url is empty/absent, returns
    a direct (no-proxy) client. Clients are cached by proxy URL to avoid
    recreating connection pools on every call.
    """
    config = load_config()
    proxy = config.get("proxy_url") or None
    cache_key = proxy or "__no_proxy__"

    if cache_key not in _proxy_client_cache:
        _proxy_client_cache[cache_key] = httpx.Client(
            proxy=proxy,
            timeout=30,
        )
    return _proxy_client_cache[cache_key]
```

- [ ] **Step 4: Modify `save_config()` to accept `proxy_url`**

Change `save_config(appid, appsecret)` to `save_config(appid, appsecret, proxy_url="")`:

```python
def save_config(appid: str, appsecret: str, proxy_url: str = "") -> dict:
    config = {"appid": appid, "appsecret": appsecret, "proxy_url": proxy_url}
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    _token_cache["access_token"] = ""
    _token_cache["expires_at"] = 0
    return config
```

- [ ] **Step 5: Modify `get_access_token()` to use `get_http_client()`**

Replace line 53 (`resp = httpx.post(...)`) with:

```python
    client = get_http_client()
    resp = client.post(
        "https://api.weixin.qq.com/cgi-bin/stable_token",
        json={
            "grant_type": "client_credential",
            "appid": config["appid"],
            "secret": config["appsecret"],
            "force_refresh": force_refresh,
        },
    )
```

- [ ] **Step 6: Modify `_post_with_token_retry()` to use `get_http_client()`**

Replace lines 86-88 (the `httpx.post` calls inside the retry loop) with:

```python
        client = get_http_client()
        if files is not None:
            resp = client.post(url, files=files)
        else:
            resp = client.post(url, json=json_body)
```

Remove the `timeout` parameter from these calls since it's now set on the client (30s default). The `timeout: int = 30` parameter on `_post_with_token_retry` can be removed from the signature.

- [ ] **Step 7: Modify `process_html_images()` external image fetch to use proxy**

Replace line 156 (`resp = httpx.get(src, ...)`) with:

```python
                client = get_http_client()
                resp = client.get(
                    src,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                    follow_redirects=True,
                )
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_wechat_proxy.py -v`
Expected: ALL PASS

- [ ] **Step 9: Run existing tests to verify no regression**

Run: `cd backend && python -m pytest tests/ -v --ignore=tests/visual`
Expected: ALL PASS (same as before)

- [ ] **Step 10: Commit**

```bash
cd backend
git add app/services/wechat_service.py tests/test_wechat_proxy.py
git commit -m "feat: add HTTP client factory with proxy support for WeChat API calls"
```

---

### Task 2: Backend — API Route Updates

**Files:**
- Modify: `backend/app/api/v1/wechat.py`
- Modify: `backend/app/api/v1/publish.py`

- [ ] **Step 1: Modify `ConfigReq` model to include `proxy_url`**

In `backend/app/api/v1/wechat.py`, update line 10-12:

```python
class ConfigReq(BaseModel):
    appid: str
    appsecret: str
    proxy_url: str = ""
```

- [ ] **Step 2: Modify `update_config()` to pass `proxy_url`**

Update line 29:

```python
@router.put("")
async def update_config(req: ConfigReq):
    wechat_service.save_config(req.appid, req.appsecret, req.proxy_url)
    return success(message="saved")
```

- [ ] **Step 3: Modify `get_config()` to return `proxy_url`**

Update lines 16-24:

```python
@router.get("")
async def get_config():
    config = wechat_service.load_config()
    masked = {
        "appid": config.get("appid", ""),
        "appsecret": "****" + config.get("appsecret", "")[-4:] if config.get("appsecret") else "",
        "configured": bool(config.get("appid") and config.get("appsecret")),
        "account_name": config.get("account_name", ""),
        "proxy_url": config.get("proxy_url", ""),
    }
    return success(masked)
```

- [ ] **Step 4: Modify `test_connection()` to accept `proxy_url`**

Update line 34-38:

```python
@router.post("/test")
async def test_connection(req: ConfigReq):
    """Save config and actually verify credentials against WeChat API."""
    wechat_service.save_config(req.appid, req.appsecret, req.proxy_url)
    token = wechat_service.get_access_token()
    return success({"valid": True, "account_name": "已配置公众号"})
```

- [ ] **Step 5: Fix standalone `httpx.get` in `publish.py`**

In `backend/app/api/v1/publish.py`, replace lines 701-704:

```python
            try:
                from app.services.wechat_service import get_http_client
                client = get_http_client()
                resp_bytes = client.get(src, timeout=15).content
                thumb_media_id = wechat_service.upload_thumb_to_wechat(resp_bytes, "cover.jpg")
            except Exception:
                pass
```

- [ ] **Step 6: Run tests to verify no regression**

Run: `cd backend && python -m pytest tests/test_smoke.py -v`
Expected: PASS — healthz still returns 200.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/wechat.py app/api/v1/publish.py
git commit -m "feat: add proxy_url to config API endpoints"
```

---

### Task 3: Frontend — Proxy URL Input in Settings

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/components/settings/WechatConfigSection.tsx`

- [ ] **Step 1: Add proxy URL props to `WechatConfigSection.tsx`**

Update the interface and component in `frontend/src/components/settings/WechatConfigSection.tsx`:

```typescript
interface WechatConfigSectionProps {
  appid: string;
  appsecret: string;
  proxyUrl: string;
  configured: boolean;
  saving: boolean;
  onAppidChange: (v: string) => void;
  onAppsecretChange: (v: string) => void;
  onProxyUrlChange: (v: string) => void;
  onSave: () => void;
  message?: string;
}

export default function WechatConfigSection({
  appid,
  appsecret,
  proxyUrl,
  configured,
  saving,
  onAppidChange,
  onAppsecretChange,
  onProxyUrlChange,
  onSave,
  message,
}: WechatConfigSectionProps) {
```

- [ ] **Step 2: Add proxy URL input field after AppSecret**

In the JSX, after the AppSecret input block (line 80) and before the first divider (line 83), add:

```tsx
        {/* Proxy URL field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-fg-secondary">
            API 代理地址
            <span className="ml-1 text-[11px] font-normal text-fg-muted">(可选)</span>
          </label>
          <input
            value={proxyUrl}
            onChange={(e) => onProxyUrlChange(e.target.value)}
            placeholder="https://your-proxy-server:port"
            className="bg-surface-tertiary border border-border-secondary rounded-lg px-3.5 py-2.5 text-[13px] text-fg-primary placeholder:text-fg-muted outline-none focus:border-accent transition-colors"
          />
          <span className="text-[11px] text-fg-muted">
            所有微信 API 请求将通过此代理发出，用于本地开发时满足 IP 白名单要求
          </span>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-border-primary" />
```

- [ ] **Step 3: Update `Settings.tsx` to add proxyUrl state**

In `frontend/src/pages/Settings.tsx`, add state and load logic:

```typescript
  const [proxyUrl, setProxyUrl] = useState("");
```

Add after the existing `useEffect` load:

```typescript
        setProxyUrl(d.proxy_url || "");
```

So the full useEffect becomes:

```typescript
  useEffect(() => {
    api.get("/config").then((res) => {
      if (res.data.code === 0) {
        const d = res.data.data;
        setAppid(d.appid || "");
        setProxyUrl(d.proxy_url || "");
        setConfigured(d.configured);
      }
    });
  }, []);
```

- [ ] **Step 4: Update `save()` to include proxy_url in request**

Update the save function:

```typescript
  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.put("/config", { appid, appsecret, proxy_url: proxyUrl });
      setMsg("保存成功");
      setConfigured(true);
    } catch {
      setMsg("保存失败");
    }
    setSaving(false);
  };
```

- [ ] **Step 5: Pass proxyUrl props to WechatConfigSection**

Update the component invocation in Settings.tsx:

```tsx
            {activeSection === "wechat" && (
              <WechatConfigSection
                appid={appid}
                appsecret={appsecret}
                proxyUrl={proxyUrl}
                configured={configured}
                saving={saving}
                onAppidChange={setAppid}
                onAppsecretChange={setAppsecret}
                onProxyUrlChange={setProxyUrl}
                onSave={save}
                message={msg}
              />
            )}
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/components/settings/WechatConfigSection.tsx
git commit -m "feat: add proxy URL input to WeChat settings page"
```

---

### Task 4: LSP Diagnostics + Build Verification

**Files:**
- All modified files

- [ ] **Step 1: Run LSP diagnostics on all changed files**

Check:
- `backend/app/services/wechat_service.py`
- `backend/app/api/v1/wechat.py`
- `backend/app/api/v1/publish.py`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/components/settings/WechatConfigSection.tsx`

Expected: No errors.

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && python -m pytest tests/ -v --ignore=tests/visual`
Expected: ALL PASS.

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no new errors.
