# MBEditor Project Map

Last updated: 2026-06-14

## 1. What This Project Is

MBEditor is an AI-CLI-native WeChat 公众号 article editor. Every editor capability is also an API endpoint, so agents (Claude Code / Codex / OpenClaw) can author, style, validate, and publish articles without the browser.

Two document models coexist:

1. **Legacy `Article`** — `{ title, mode, html, css, js, markdown, ... }`. Still what the shipped editor UI revolves around (drafts live in `articlesStore` localStorage; preview/copy/publish are backend-processed).
2. **`MBDoc`** — block-based `{ id, version, meta, blocks[] }`. Backend now has the full vertical: schema, file store, block registry, renderers, render entrypoint, **CRUD API (`/api/v1/mbdocs`), publish endpoints (`/publish/mbdoc/*`), an Article→MBDoc converter and migration script** (merged to main 2026-06-12). The frontend `mbdocStore` talks to the API but the main editing UI is still Article-first.

The repo is a live hybrid, not a finished migration.

## 2. Reading Order for a New Session

1. `docs/architecture/SESSION_ONRAMP.md`
2. `docs/architecture/PROJECT_MAP.md` (this file)
3. Root `AGENTS.md` (硬规则 + 踩过的坑) and `skill/mbeditor.skill.md`
4. Backend entrypoints: `backend/app/main.py`, `backend/app/api/v1/router.py`, `backend/app/api/v1/publish.py`, `backend/app/api/v1/mbdocs.py`
5. Frontend entrypoints: `frontend/src/surfaces/editor/EditorSurface.tsx`, `frontend/src/surfaces/editor/CenterStage.tsx`, `frontend/src/app/Shell.tsx`
6. Research docs (`docs/research/*`) only for architecture-decision evidence; they are historical, not runtime truth.

## 3. Repository Topology

### `backend/` (FastAPI, Python 3.11)

API routes (`app/api/v1/`, all under `/api/v1`):

- `publish.py` — `/publish/preview`, `/publish/process-for-copy` (legacy Article HTML), `/publish/mbdoc/preview`, `/publish/mbdoc/process-for-copy`
- `wechat_stateless.py` — `/wechat/test-connection`, `/wechat/upload-image`, `/wechat/draft` (appid/appsecret supplied per-request; when the request omits the secret, `get_access_token` falls back to the per-appid server-side store — see `credentials.py`)
- `validate.py` — `/wechat/validate` (svg_validator: issues block copy, warnings toast)
- `agent_generate.py` — `/agent/generate-svg` (agent-driven WeChat-safe SVG generation)
- `mbdocs.py` — `/mbdocs` CRUD (GET list / GET / POST / PUT / DELETE)
- `settings.py` — `/settings/gateway` GET/PUT/test for the WeChat relay gateway; GET is redacted (token/CA PEM never returned, only `tokenConfigured` + fingerprint)
- `credentials.py` — `/settings/credentials` GET/PUT for per-appid WeChat AppSecret; GET lists configured appids only (secret never returned), PUT `""`=clear / `null`=keep / non-empty=set and busts that appid's cached token
- `router.py` — also serves `/version`, `/version/check`

Services (`app/services/`) — the copy pipeline is the heart:

- `publish_adapter.py` — orchestrates the two publish paths. `process_html_for_copy` = copy路径 (data-URI images); `publish_draft_sync` = draft-API路径 (uploads images to WeChat **mmbiz** via `wechat_service.process_html_images` → `media/uploadimg`, so draft content stays under WeChat's ~1MB limit and images display in the published article). **Never mix the two image strategies** (see AGENTS.md 坑 #1/#3).
- `css_inline.py` — premailer inlining. Accepts full HTML documents: strips DOCTYPE, extracts `<body>` content, carries body style/bgcolor onto the `section.wechat-root` wrapper, retargets `body` CSS rules at it; brace-counting at-rule stripper (nested `@media` safe); pseudo-class stripping keeps non-pseudo selectors.
- `wechat_sanitize.py` — allowlist style-property gate (`ALLOWED_STYLE_PROPERTIES`), div→section, **semantic-tag→section rename** (WeChat unwraps `<article>/<main>/<header>/...` and drops their style — the v5.5.0 background-loss root cause), head/meta/embed stripping, position:absolute→display:none, `<a>`-button→table rewrite, table-layout:fixed injection.
- `svg_validator.py` — rule-based validation (`attribute-whitelist`, `forbidden-css` anchored to style contexts, `semantic-wrapper-tag` warning, `forbidden-tag`, `event-handler`, ...).
- `wechat_copy_images.py` — inlines every `<img src>` as base64 data URI (anchored to `<img>` tags; negative-caches failed fetches). Data URIs are the only reliable paste-image path.
- `raster_inline_svgs.py` / `raster_worker.py` — SVG rasterization for copy.
- `local_imgbed_service.py` — LAN imgbed rewrite util (honors `LOCAL_IMGBED_UPLOAD_FIELD`/`LOCAL_IMGBED_TOKEN_FIELD`). **No longer wired into any publish path** — the draft path moved to WeChat mmbiz (2026-06-14) to fix content-size + WeChat-unreachable LAN URLs; kept as an optional offloader.
- `legacy_render_pipeline.py` — preview_html for the legacy path.
- `render_for_wechat.py` + `block_registry.py` + `renderers/` — MBDoc block rendering (heading/paragraph/markdown/html/image/svg/raster all real).
- `gateway.py` — pluggable WeChat-API transport (`direct` / `https-gateway`; `ssh-socks` reserved for a later phase). `resolve()` picks one per call, precedence **stored config > env (`WECHAT_API_BASE`) > direct**. Stored config (base/token/inline-CA-PEM) lives in the `mbeditor-data` named volume's `gateway.json`; secrets are write-only.
- `credentials.py` — per-appid WeChat AppSecret store in the same `mbeditor-data` volume's `credentials.json` (plaintext, chmod 600, atomic write). `get_access_token` resolves the secret as **request value > stored > 400**; secrets are write-only (never read back).
- `mbdoc_store.py`, `article_to_mbdoc.py`, `image_processor.py`, `wechat_service.py` (routes every WeChat API call through `gateway.resolve()`), `agent_svg_prompt.py`.

Models: `app/models/mbdoc.py` (discriminated Pydantic unions). Version: `app/core/config.py::APP_VERSION`.

### `frontend/` (React 19 + TypeScript + Vite)

- `src/app/Shell.tsx` — routing; title-based article URLs `/a/<encoded-title>-<id-suffix>`.
- `src/surfaces/` — `article-list/`, `editor/`, `settings/`, `promo/`. **`editor/EditorSurface.tsx` is the frontend center**; uses extracted `hooks/useEditorDraft` and `services/` (editor API, draft storage).
- `src/surfaces/editor/CenterStage.tsx` — copy-with-validation flow, Monaco + preview.
- `src/surfaces/editor/AgentCopilot.tsx`, `StructurePanel.tsx`, `LintSidebar`, `TemplateGallery`, `CopyReadyDialog` (长文分段复制 / 草稿箱兜底).
- `src/stores/` — `articlesStore` (legacy drafts, localStorage), `mbdocStore` (API-backed + `*Local` cache layer), `wechatStore`, `uiStore`, `agentStore`, `imageHostStore`, `toastStore`.
- `src/utils/clipboard.ts` — `writeHtmlToClipboard`, `splitHtmlIntoChunks` (recursive childNodes-safe chunking), theme-chrome background strip (never strips generic authored colors #000/#222/#fff), block-aware text/plain fallback.
- `src/styles/index.css` — theme variables (`paper` / `swiss` / ...).

### Other top-level

- `skill/` — agent skills (mbeditor / wechat-svg-author / wechat-svg-validate).
- `docs/wechat-svg/` — WeChat compatibility doctrine (whitelist, html-css-restrictions, five-patterns, checklist, templates).
- `docs/cli/` — CLI design docs. `docs/research/` — historical decision evidence.
- `scripts/` — `migrate_articles_to_mbdoc.py`, `validate_wechat_svg.py`, verification utilities.
- `deploy/` — coordinate-free deployment references (GHCR images via GitHub Actions; `docker-compose.prod.yml`). Real host/SSH details live in private operator notes only.

## 4. Runtime Model

- Frontend `:7073`, backend API `:7072/api/v1` (docker compose; `MBEDITOR_BIND_HOST` in `.env`).
- Storage is file-based JSON: `data/mbdocs/<id>.json`; legacy article drafts live client-side in localStorage. WeChat gateway config (`/app/data/gateway.json`) and per-appid AppSecret (`/app/data/credentials.json`) persist server-side in the `mbeditor-data` Docker named volume — the deliberate server-side state, kept outside the repo tree (secrets write-only).
- Production runs on the operator's NAS via docker compose built from source; GitHub Actions publishes GHCR images as the alternative path (`docker-compose.prod.yml`).

## 5. The Copy Pipeline (most load-bearing flow)

`POST /publish/process-for-copy` → `publish_adapter.process_html_for_copy` →
`sanitize_for_wechat(inline_css(html, css))` → `raster/validate` → `inline_images_as_data_uris` →
frontend `writeHtmlToClipboard` (chunking if >400KB) → user pastes into mp.weixin.qq.com.

Invariants:

1. Output style attributes contain ONLY allowlisted properties.
2. No semantic wrapper tags survive (renamed to `<section>`) — WeChat would strip them with their styles.
3. Full-document input (DOCTYPE/head/body) is normalized; head metadata never leaks into the article.
4. Images are self-contained data URIs at copy time.
5. Preview, copy, and draft paths must not diverge (single render truth: `render_for_wechat` for MBDoc; `legacy_render_pipeline` for Article).

## 6. Tests

- Backend: `python -m pytest tests/` from `backend/` — 250 tests (sanitizer allowlist, full-document pipeline regression suite `test_wechat_full_document_pipeline.py`, validator, copy-images, renderers, API).
- Frontend: vitest — 282 tests (clipboard chunking/theme-strip/plaintext regressions, stores, editor surfaces). On the maintainer's machine run from the `X:` drive mapping, not `D:` (UNC normalization breaks vitest module resolution).

## 7. High-Risk Seams

1. `backend/app/services/publish_adapter.py` + `wechat_sanitize.py` + `css_inline.py` — the copy pipeline; every change needs the regression suites green.
2. `frontend/src/surfaces/editor/EditorSurface.tsx` — frontend state center.
3. `frontend/src/utils/clipboard.ts` — chunked copy correctness (text-node preservation).
4. `backend/app/models/mbdoc.py` + `block_registry.py` — migration contract.
5. `backend/app/api/v1/publish.py` — shrink-only policy (see AGENTS.md 硬规则).

## 8. Truths to Keep in Mind

1. UI is legacy-Article-first; backend is increasingly MBDoc-complete. Don't assume either direction is finished.
2. WeChat compatibility knowledge lives in `docs/wechat-svg/` and is enforced by `svg_validator` + sanitizer — keep doctrine, validator, and sanitizer in sync when discovering new WeChat behavior.
3. Research docs describe why decisions were made, not what the code currently does.
4. Lane discipline (A: legacy behavior / B: MBDoc migration / C: explicit bridge) still applies — see `skill/mbeditor.skill.md`.
