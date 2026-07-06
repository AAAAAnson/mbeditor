# MBEditor CLI Overview

Last updated: 2026-04-17

## Status

The native CLI now ships as an installable Python package under `backend/`
with a `mbeditor` console-script entrypoint (see `backend/pyproject.toml`).
Two execution modes are available:

- `--mode direct` (default) - talks to local services and file storage
  directly. No FastAPI server required.
- `--mode http` - wraps the running `/api/v1` backend via `--base-url`.

This is the first CLI version aligned with CLI-Anything principles: a short
skill file is bundled inside the package (`app/cli/SKILL.md`) and every
command exposes a stable JSON output envelope.

## Invocation

Preferred (after `pip install -e ./backend`):

```bash
mbeditor --help
mbeditor info
mbeditor skill
```

Direct module fallback (from `backend/`):

```bash
python -m app.cli --help
```

## Current Command Groups

- `article` - legacy Article CRUD + projection
- `doc` - MBDoc CRUD + render
- `image` - local image library
- `render` - preview / article / doc HTML render
- `publish` - WeChat process / draft
- `config` - WeChat credential config
- `skill` - prints the bundled agent skill guide
- `info` - version, mode, data paths

See `docs/cli/COMMAND_REFERENCE.md` for per-command flags.

## Global Options

- `--mode [direct|http]`
  Default: `direct`. Env: `MBEDITOR_MODE`.
- `--data-dir PATH`
  Override direct-mode data location. Expects `articles/`, `mbdocs/`,
  `images/` subdirs and `config.json`. Env: `MBEDITOR_DATA_DIR`.
- `--base-url TEXT`
  HTTP-mode API base. Default: `http://127.0.0.1:7072/api/v1`.
  Env: `MBEDITOR_BASE_URL`.
- `--json`
  Emit JSON output. Default is also JSON, but this flag also applies to
  human-biased commands like `mbeditor skill`.
- `--compact`
  With `--json`, emit single-line JSON (usable as JSONL).
- `--timeout FLOAT`
  HTTP timeout seconds.
- `--quiet`
  Suppress non-error output. Errors still print.

## Output Contract

Every command emits one of two shapes:

- success:
  `{"ok": true, "action": "...", "message": "success", "data": ...}`
- error:
  `{"ok": false, "action": "...", "message": "...", "data": ...}`

Rules:

- `action` is stable and safe for agents to pattern-match on.
- `data` may be null, an object, or a list depending on the command.
- Exit code: `0` on success, `1` on executor error, `2` on validation /
  usage error.

## Direct Mode Coverage

These operations are viable without a running backend:

| Group   | Direct? | Notes                                          |
|---------|---------|------------------------------------------------|
| article | yes     | file-backed CRUD via `article_service`.        |
| doc     | yes     | file-backed via `MBDocStorage`, real renderers.|
| image   | yes     | local library via `image_service`.             |
| render  | yes     | pure render pipeline, no network.              |
| publish | yes     | hits WeChat API directly using `config.json`.  |
| config  | yes     | reads/writes `config.json` directly.           |

HTTP mode is useful when you want to share WeChat token cache and image
cache with a running backend, or when the CLI runs on a machine that does
not have the Python deps.

## Relationship To Migration

The CLI is intentionally ahead of the full MBDoc UI migration:

- Most agent workflows now live behind `mbeditor` rather than `curl`.
- The CLI will tighten its MBDoc-native surface as the bridge matures.

## Agent Rule

Before using or documenting a command:

1. `mbeditor --help` (or `python -m app.cli --help`).
2. Verify the subcommand appears.
3. If absent, fall back to HTTP API; do not pretend it exists.
4. When in doubt, `mbeditor skill` returns the single-source skill file.

## Related Docs

- `docs/cli/COMMAND_REFERENCE.md`
- `docs/cli/CLI_ANYTHING_NOTES.md`
- `docs/agent/AGENT_WORKFLOWS.md`
