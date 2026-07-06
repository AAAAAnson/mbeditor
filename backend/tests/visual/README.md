# Visual Parity Tests

This directory contains the infrastructure for verifying that MBEditor's editor
view and the final WeChat draft article are pixel-level identical.

## What's here

| File | Purpose |
|------|---------|
| `infrastructure.py` | 5 helper functions (see below) |
| `auth_login.py` | One-time QR-code login script |
| `test_infrastructure_smoke.py` | 6 smoke tests (no WeChat API) |
| `.auth/state.json` | Persisted WeChat MP session (gitignored) |
| `_artifacts/` | Screenshot & diff PNG output (gitignored) |

## 5 Helper Functions (Task 10 contract)

```python
render_mbdoc_to_screenshot(doc, out_dir=None) -> Path
push_mbdoc_to_wechat_draft(doc) -> str          # returns media_id
screenshot_wechat_draft(media_id, out_dir=None) -> Path
diff_images(a, b, tolerance=0.005) -> dict
diff_dom(html_a, html_b, ignore_attrs=("data-", "id")) -> dict
```

## First-time setup: WeChat login

`screenshot_wechat_draft` requires a persisted browser session. Run:

```bash
# From the project root:
python -m backend.tests.visual.auth_login

# Or from backend/:
python tests/visual/auth_login.py
```

A headed Chromium window will open the WeChat MP login page. Scan the QR code
with the WeChat 测试账号 test account WeChat app, wait for the dashboard to load, then
press Enter in the terminal. The session is saved to `.auth/state.json`.

## Running tests

```bash
# Smoke tests only (no WeChat API, no login required):
cd backend && pytest tests/visual/test_infrastructure_smoke.py -q

# Full visual tests (Task 11, requires auth_login first):
cd backend && pytest tests/visual/ -q

# All backend tests including visual:
cd backend && python -m pytest -q
```

## Session expiry and recovery

WeChat MP sessions typically last several days. If tests fail with:

    RuntimeError: WeChat login expired, re-run auth_login

Simply re-run the login script:

```bash
python -m backend.tests.visual.auth_login
```

## Gitignored paths

`.auth/` and `_artifacts/` are listed in the root `.gitignore`. Never commit
`state.json` (contains session cookies) or screenshot artifacts.

## Known TODOs

### screenshot_wechat_draft — draft preview selector (Task 11)

The current implementation navigates to the WeChat MP draft list page:

    https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&type=101

It then captures the full page as a fallback, because the exact selector for
the "preview" button of a specific draft (identified by `media_id`) has not
yet been confirmed.

**Action for Task 11**: After the first `auth_login` run, use
`playwright codegen https://mp.weixin.qq.com/` (while logged in) to identify:

1. The selector for a draft card in the list.
2. The selector for its "预览" (preview) button.
3. Whether a mobile-simulated viewport loads the article body directly.

Update `_DRAFT_PREVIEW_SELECTOR` in `infrastructure.py` with the confirmed
selector.
