# MBEditor Session Onramp

Last updated: 2026-06-12 (v5.5.0)

Use this file when a new session needs to become productive quickly without re-reading the whole repository.

## 1. First 10 Minutes

Read these files in order:

1. `docs/architecture/SESSION_ONRAMP.md` (this file)
2. `docs/architecture/PROJECT_MAP.md`
3. Root `AGENTS.md` — 硬规则 and 踩过的坑 (data-URI image doctrine, publish_adapter two-path rule, semantic-tag unwrap)
4. `backend/app/api/v1/publish.py`
5. `backend/app/services/publish_adapter.py`
6. `backend/app/services/wechat_sanitize.py`
7. `frontend/src/surfaces/editor/EditorSurface.tsx`
8. `frontend/src/surfaces/editor/CenterStage.tsx`

If the task is WeChat-compatibility work, also read `docs/wechat-svg/html-css-restrictions.md` and `docs/wechat-svg/whitelist.md`.

## 2. Mental Model

- The shipped editor UI runs on legacy `Article` (drafts in localStorage, preview/copy/publish backend-processed).
- `MBDoc` is the target architecture; the backend vertical is complete (schema → store → registry → renderers → CRUD/publish API, merged 2026-06-12) but the main UI is not MBDoc-native yet.
- The copy pipeline (`sanitize_for_wechat(inline_css(...))` + data-URI images) is the most load-bearing flow; WeChat compatibility knowledge is enforced there and in `svg_validator`.
- WeChat silently strips what it doesn't support — including unwrapping semantic tags (`<article>` etc.) together with their styles. Wrappers must be `<section>`.

## 3. Where to Look for What

### Current product behavior

- `frontend/src/surfaces/editor/EditorSurface.tsx`, `CenterStage.tsx`
- `backend/app/api/v1/publish.py` → `backend/app/services/publish_adapter.py`
- `frontend/src/utils/clipboard.ts` (chunked copy, theme strip, plain-text fallback)

### Migration architecture

- `backend/app/models/mbdoc.py`, `backend/app/services/block_registry.py`, `render_for_wechat.py`
- `backend/app/api/v1/mbdocs.py`, `frontend/src/stores/mbdocStore.ts`
- `scripts/migrate_articles_to_mbdoc.py`

### WeChat compatibility doctrine

- `docs/wechat-svg/` (whitelist / html-css-restrictions / five-patterns / pre-publish-checklist)
- Enforcement: `backend/app/services/svg_validator.py` (+ `POST /api/v1/wechat/validate`), `wechat_sanitize.py`

## 4. Fast Truths

1. `publish_adapter` has two paths — copy (data-URI images) vs draft (imgbed URLs). Never mix their image strategies.
2. `EditorSurface.tsx` is the most important frontend file; it uses extracted hooks/services since the 2026-05 refactor.
3. MBDoc API exists and works; the main editing UI does not depend on it yet.
4. The sanitizer is allowlist-based: any style property not in `ALLOWED_STYLE_PROPERTIES` is dropped. Check there first when "styles disappear after paste".
5. Semantic wrapper tags are renamed to `<section>` by the sanitizer; the validator warns on them (`semantic-wrapper-tag`).

## 5. Running Tests

- Backend: `cd backend && python -m pytest tests/ -q` (250 tests).
- Frontend: `npx vitest run` from `frontend/` — on the maintainer's machine the repo is a NAS mount; run vitest from the `X:` drive mapping (`X:\MBEditor\frontend`), not `D:`, or module resolution fails.
- Full-document copy-pipeline regressions: `backend/tests/test_wechat_full_document_pipeline.py`; clipboard regressions: `frontend/src/utils/clipboard.test.ts`.

## 6. Decision Shortcut

Before coding, decide which lane you are in:

- Lane A: current product behavior → work from legacy `Article` flow.
- Lane B: migration architecture → work from `MBDoc` + `BlockRegistry`.
- Lane C: bridge work → define compatibility explicitly before editing.

## 7. What To Record After New Discoveries

- Stable architecture truths → `docs/architecture/PROJECT_MAP.md`
- Fast-entry guidance → this file
- New WeChat compatibility behavior → `docs/wechat-svg/html-css-restrictions.md` + validator/sanitizer code + AGENTS.md 踩过的坑
- Release-visible changes → `CHANGELOG.md`
