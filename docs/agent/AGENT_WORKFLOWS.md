# MBEditor Agent Workflows

Last updated: 2026-04-16

This file is the practical companion to the short skill. It records how agents should operate MBEditor without re-reading the full architecture every time.

## 1. First Question: Which Lane?

Every task should be classified before any code or content work begins.

- Lane A: current product behavior
  Use when the user wants the shipped editor, preview, copy, publish, image, or settings behavior changed or used right now.
- Lane B: migration architecture
  Use when the task is about `MBDoc`, renderer coverage, projection, render convergence, or replacing legacy internals.
- Lane C: bridge work
  Use when the task must connect `Article` and `MBDoc` without cutting the product over immediately.

If a task touches both current product behavior and future architecture, treat it as Lane C until proven otherwise.

## 2. Current Runtime Workflow

This is the live product path today:

1. `Article` is created or loaded through `/articles`.
2. Frontend edits `title`, `mode`, `html`, `css`, `js`, or `markdown`.
3. Frontend derives raw HTML locally.
4. Backend `/publish/preview` processes that HTML for WeChat.
5. Preview iframe shows processed HTML.
6. Copy/export/publish use related backend processing again.

Implication:

- frontend state is still legacy-shaped
- backend processing already matters for user-visible output
- a visual result is not trustworthy until it passes the backend render/publish path

## 3. Current Content Authoring Workflow

Use this when the user wants an article produced today.

1. Decide HTML, SVG, or raster section-by-section.
2. Prefer legacy `Article` flow unless the user explicitly wants `MBDoc`.
3. Create or update article content.
4. Preview through backend processing.
5. Adjust until processed output is acceptable.
6. Publish draft only after preview and processed HTML align.

Use `/mbdoc` only if the task is explicitly block-doc focused or migration-focused.

## 4. Migration Workflow

Use this when changing architecture rather than just producing content.

1. Freeze or inspect current behavior first.
2. Identify the boundary being introduced or cleaned up.
3. Keep one source of truth per phase.
4. Preserve preview/copy/publish parity.
5. Add tests or fixtures before deleting compatibility.

Do not start with a UI rewrite.

## 5. Backend Workflow

When working backend migration:

1. inspect `backend/app/api/v1/publish.py`
2. inspect `backend/app/api/v1/mbdocs.py`
3. inspect `backend/app/services/render_for_wechat.py`
4. inspect `backend/app/services/block_registry.py`
5. decide whether the change belongs to:
   - router glue
   - projection
   - render pipeline
   - publish gateway

Desired direction:

- `publish.py` becomes thinner
- render logic moves into services
- preview/copy/publish converge on one render result
- `MBDoc` becomes render truth before it becomes full UI truth

## 6. Frontend Workflow

When working frontend migration:

1. inspect `frontend/src/surfaces/editor/EditorSurface.tsx`
2. inspect `frontend/src/surfaces/editor/CenterStage.tsx`
3. inspect `frontend/src/surfaces/editor/StructurePanel.tsx`
4. inspect `frontend/src/stores/mbdocStore.ts`
5. determine whether the change belongs to:
   - page shell
   - session state
   - render service
   - publish/copy action layer
   - future `MBDoc` editing surface

Desired direction:

- UI shell stays stable first
- editor state stops treating raw `Article` as the only truth
- preview/copy/publish converge on shared processed render output

## 7. CLI Workflow

MBEditor is adopting a native `mbeditor` CLI, but the rollout is staged.

Rule:

- If `mbeditor --help` works, prefer CLI for repeatable agent actions.
- If it is not installed, try `python -m app.cli --help` from `backend/`.
- If neither works, use the HTTP API directly.

What the current CLI already covers:

- `article`: list, get, create, update, delete
- `render`: preview, article render, doc render
- `publish`: process, draft
- `doc`: list, get, create
- `image`: list, upload
- `config`: get, set

What is still planned rather than present:

- richer `doc` mutation commands
- image delete
- config validation/check
- render explain/validate helpers

Use `docs/cli/COMMAND_REFERENCE.md` as the source of truth for the implemented command surface.

Do not tell another agent to use a command that is only part of the plan.

Until then, do not document or promise commands as available unless they are implemented in the current checkout.

## 8. Validation Workflow

Minimum validation thinking:

- content generation is not done until processed preview looks right
- publish-sensitive backend work is not done until parity risks are addressed
- migration work is not done until the new path is clearly categorized as current-path, bridge, or native-`MBDoc`

When you cannot run tests locally, say so plainly.

## 9. What Not To Do

- Do not let preview migrate ahead of copy/publish.
- Do not keep adding logic to `publish.py`.
- Do not dual-write `Article` and `MBDoc` as peers.
- Do not revive dormant editor experiments as the first migration step.
- Do not rewrite the page shell before bridge layers exist.

## 10. Fast References

Read these when needed:

- architecture truth: `docs/architecture/PROJECT_MAP.md`
- fast re-entry: `docs/architecture/SESSION_ONRAMP.md`
- render choice rules: `docs/agent/RENDER_DECISIONS.md`
- CLI contract: `docs/cli/COMMAND_REFERENCE.md`
