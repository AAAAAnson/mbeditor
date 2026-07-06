# CLI-Anything Notes For MBEditor

Last updated: 2026-04-17

This file records how MBEditor borrowed from the CLI-Anything philosophy
(HKUDS/CLI-Anything) and where we intentionally diverged.

## Borrowed Principles (now implemented)

1. **Command-first agent entrypoint.** `mbeditor` is the default way an
   agent does MBEditor work. Raw `curl` is a fallback.
2. **Short, bundled skill.** `backend/app/cli/SKILL.md` ships inside the
   package; `mbeditor skill` prints it. Agents can ingest the full skill
   in a single command.
3. **Domain-grouped command surface.** `article`, `doc`, `image`, `render`,
   `publish`, `config`, `skill`, `info` - stable top-level nouns.
4. **Stable machine-readable output.** Every command emits the same
   `{ok, action, message, data}` envelope. `--json --compact` makes the
   output JSONL-ready.
5. **Structured error handling + exit codes.** `0` success, `1` executor
   error, `2` usage/precondition error. Errors always emit an envelope.
6. **Self-describing `--help`.** All groups and subcommands are reachable
   via `mbeditor --help` and each group's `--help`.
7. **Installable entrypoint.** `pyproject.toml` declares a console-script
   `mbeditor` pointing at `app.cli.main:app`.
8. **Authentic software invocation.** The CLI does not simulate anything;
   it either calls local services directly or proxies to the real API.
   Raster rendering uses a real Playwright worker.

## Intentionally Deferred

The CLI-Anything reference implementation includes extras we have chosen
not to adopt yet:

- No REPL / stateful session (no project files, no undo/redo).
- No auto-generated harness pipeline. We build command-by-command.
- No CLI-Hub publishing.
- No plugin marketplace integration.
- No SKILL auto-discovery of a wider capability graph beyond MBEditor.

These are deferred because:

- MBEditor's agent flows are mostly one-shot, so REPL is low-value for now.
- Generated harnesses would fight the existing hand-written CLI structure.
- The project-state and undo features belong downstream once MBDoc is the
  canonical truth; today the backend is still hybrid.

## MBEditor-Specific Adaptation

- **Direct mode first.** Unlike a pure HTTP wrapper, MBEditor's CLI
  defaults to running against local file storage. An agent can fork off a
  workspace (`--data-dir`), author content, render it, and never need the
  FastAPI server.
- **HTTP mode still supported.** When multiple tools share a token cache or
  when the CLI machine does not have full Python deps, `--mode http` swaps
  in an `HttpExecutor`.
- **Single Executor protocol.** Both direct and http implementations
  satisfy one `Executor` interface, so commands do not branch on mode.
- **Legacy + MBDoc parity.** The CLI covers both architecture lanes
  without mixing their truths; `article project-to-doc` is the only
  bridge command.

## Success Condition

The CLI is successful when an agent can safely do common work through one
entrypoint without needing to rediscover:

- which route to call
- which payload shape to use
- which output is preview-safe vs publish-safe
- how to set up a local workspace

All four are now answered inside `mbeditor --help` and `mbeditor skill`.

## Related Docs

- `docs/cli/CLI_OVERVIEW.md`
- `docs/cli/COMMAND_REFERENCE.md`
- `docs/agent/AGENT_WORKFLOWS.md`
