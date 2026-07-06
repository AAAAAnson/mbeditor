# MBEditor CLI Command Reference

Last updated: 2026-04-17

This file documents the command surface that exists in the current checkout.

## Invocation

Preferred (after `pip install -e ./backend`):

```bash
mbeditor --help
```

Module fallback from `backend/`:

```bash
python -m app.cli --help
```

## Global Options

- `--mode [direct|http]` - default `direct`; env `MBEDITOR_MODE`.
- `--data-dir PATH` - direct-mode data root; env `MBEDITOR_DATA_DIR`.
- `--base-url TEXT` - HTTP-mode API base.
- `--json` - JSON envelope output.
- `--compact` - single-line JSON with `--json`.
- `--timeout FLOAT` - HTTP timeout seconds.
- `--quiet` - suppress non-error output.

## Output Shape

Success:

```json
{
  "ok": true,
  "action": "article.get",
  "message": "success",
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "action": "article.get",
  "message": "Article abc not found",
  "data": {"id": "abc"}
}
```

Exit codes:

- `0` - success
- `1` - executor error (not found, remote failure, validation after read)
- `2` - usage / precondition error (missing flag, missing file)

## Implemented Commands

### `article`

Backed by local `article_service` (direct) or `/articles` (http).

- `article list`
- `article get ARTICLE_ID`
- `article create TITLE [MODE]` - MODE defaults to `html`.
- `article update ARTICLE_ID [--title TEXT] [--mode TEXT] [--html TEXT] [--css TEXT] [--js TEXT] [--markdown TEXT] [--cover TEXT] [--author TEXT] [--digest TEXT]`
- `article delete ARTICLE_ID`
- `article project-to-doc ARTICLE_ID [--persist/--no-persist]`

Examples:

```bash
mbeditor --data-dir ./data article list --json
mbeditor --data-dir ./data article create "Draft" markdown
mbeditor --data-dir ./data article update abc --markdown "# Heading"
mbeditor --data-dir ./data article project-to-doc abc --persist --json
```

### `doc`

Backed by `MBDocStorage` (direct) or `/mbdoc` (http).

- `doc list`
- `doc get MBDOC_ID`
- `doc create FILE`
- `doc update MBDOC_ID FILE`
- `doc delete MBDOC_ID`
- `doc render MBDOC_ID [--upload-images/--no-upload-images]`

Notes:

- `doc create` reads a JSON file and validates against the MBDoc schema.
- `doc update` rejects payloads whose `id` disagrees with the URL id.
- `doc render --upload-images` requires WeChat credentials in direct mode;
  in http mode the server's uploader is used.

Examples:

```bash
mbeditor doc list --json
mbeditor doc get d_hello
mbeditor doc create ./sample-doc.json
mbeditor doc render d_hello
mbeditor doc render d_hello --upload-images
```

### `image`

Backed by `image_service` (direct) or `/images` (http).

- `image list`
- `image upload FILE`
- `image delete IMAGE_ID`

Examples:

```bash
mbeditor image list
mbeditor image upload ./cover.png --json
mbeditor image delete md5hash
```

### `render`

Backed by `legacy_render_pipeline` + `render_for_wechat` (direct) or
`/publish` + `/mbdoc` (http).

- `render preview HTML [CSS]` - raw HTML+CSS to WeChat-safe HTML.
- `render article ARTICLE_ID` - render a stored article.
- `render doc MBDOC_ID [--upload-images/--no-upload-images]` - render an MBDoc.

Examples:

```bash
mbeditor render preview "<p>Hello</p>"
mbeditor render article abc123 --json
mbeditor render doc d_hello --upload-images --json
```

### `publish`

Backed by `publish_adapter` (direct) or `/publish` (http). Both paths need
WeChat credentials in `config.json`.

- `publish process ARTICLE_ID [AUTHOR] [DIGEST]` - apply CSS inline + image
  upload, but do not push a draft.
- `publish draft ARTICLE_ID [AUTHOR] [DIGEST]` - push to WeChat draft box.

Examples:

```bash
mbeditor publish process abc123
mbeditor publish draft abc123 "Author Name" "Short digest"
```

### `config`

Backed by `wechat_service` (direct) or `/config` (http).

- `config get`
- `config set APPID APPSECRET`
- `config check APPID APPSECRET`

Examples:

```bash
mbeditor config get --json
mbeditor config set wx_appid wx_secret
mbeditor config check wx_appid wx_secret
```

### `skill`

Prints the bundled `app/cli/SKILL.md` so an agent can ingest it in one call.

- `skill` - print markdown to stdout (or wrapped JSON with `--json`).
- `skill path` - show the path of the bundled file.

### `info`

- `info` - full snapshot of mode, version, paths, base URL.
- `info version`
- `info paths`

## Fallback Rule

If a required command is missing:

1. Verify absence in `--help`.
2. Use the HTTP API directly.
3. Do not extend docs to pretend the command exists.
