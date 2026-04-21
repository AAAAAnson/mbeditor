# Production Deploy Operations

Reference material for operating the MBEditor production deployment. All
host-, path-, and key-specific values are referenced via environment variables
so this document is safe to keep in the public repository.

## Prerequisites (local shell)

Before running any command in this file, export the operator-only variables
once per shell session. **Never** commit these values into the repository.

```bash
export PROD_HOST="<server-ip-or-hostname>"
export PROD_USER="<ssh-user>"
export DEPLOY_SSH_KEY="<path/to/deploy-private-key>"     # ed25519, GHA-managed pair
export ADMIN_SSH_KEY="<path/to/admin-private-key>"        # cloud-vendor default, emergency only
```

These pair with the GitHub Actions secrets used by the CD workflow:

| Local env var       | GitHub Secret        | Notes                                      |
|---------------------|----------------------|--------------------------------------------|
| `PROD_HOST`         | `DEPLOY_HOST`        | Target SSH host                            |
| `PROD_USER`         | `DEPLOY_USER`        | SSH user with access to `/opt/mbeditor`    |
| `DEPLOY_SSH_KEY`    | `DEPLOY_SSH_KEY`     | ed25519 private key authorised on the box  |
| `ADMIN_SSH_KEY`     | —                    | Cloud-vendor root key, off-GitHub          |

## Layout on the server

- `/opt/mbeditor/docker-compose.prod.yml` — pulls prebuilt images from GHCR
- `/opt/mbeditor/.env` — placeholder file, reserved for future runtime config
- `/etc/nginx/sites-available/mbeditor` — vhost (audit copy: `deploy/nginx/mbeditor.conf`)
- TLS cert under `/etc/letsencrypt/live/<service-domain>/` — certbot-managed, auto-renewed by `certbot.timer`

## Images

Published to GHCR by `.github/workflows/deploy.yml` on every push to `main`:

- `ghcr.io/aaaaanson/mbeditor-frontend:sha-<12char>` + `:latest`
- `ghcr.io/aaaaanson/mbeditor-backend:sha-<12char>`  + `:latest`

## Rollback — one-liner

Pin both services to a previous SHA and restart. The `MBEDITOR_TAG` env var
flows into `docker-compose.prod.yml` via `${MBEDITOR_TAG:-latest}`.

```bash
ssh -i "${DEPLOY_SSH_KEY}" "${PROD_USER}@${PROD_HOST}" \
  "cd /opt/mbeditor && MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
   docker compose -f docker-compose.prod.yml pull && \
   MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
   docker compose -f docker-compose.prod.yml up -d"
```

Replace `<PREVIOUS_SHA>` with a 12-char short SHA. Use
`ghcr.io/aaaaanson/mbeditor-*:sha-<PREVIOUS_SHA>` as your verification that
the tag exists on GHCR.

## Finding previous SHAs

On the server (fastest — already-pulled layers are cached):

```bash
ssh -i "${DEPLOY_SSH_KEY}" "${PROD_USER}@${PROD_HOST}" \
  "docker images --filter=reference='ghcr.io/aaaaanson/mbeditor-*' \
   --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}'"
```

From dev machine via GHCR API (needs a PAT with `read:packages`):

```bash
gh api "users/AAAAAnson/packages/container/mbeditor-frontend/versions" \
  | jq -r '.[].metadata.container.tags[]' | grep '^sha-' | head
```

Or inspect the commit that produced a given tag:

```bash
git log --oneline --all | head   # short SHAs -> matches sha-<short>
```

## Forward-only deploys

Pushing to `main` rebuilds and tags `sha-<new>` + `latest`, and the deploy job
pulls both on the server. There is no manual step after push; the
`Public smoke test` curl step validates the published service before the
workflow reports green.

## Verification checklist

```bash
# Replace <service-domain> with the configured hostname served by Nginx.
curl -fsS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://<service-domain>/           # 200 0
curl -fsS https://<service-domain>/api/v1/version                                                   # {"code":0,...}
ssh -i "${DEPLOY_SSH_KEY}" "${PROD_USER}@${PROD_HOST}" \
  "docker ps --filter name=mbeditor- --format '{{.Names}} {{.Status}}'"   # both Up (healthy)
ssh -i "${DEPLOY_SSH_KEY}" "${PROD_USER}@${PROD_HOST}" \
  "docker inspect mbeditor-frontend --format '{{.Config.Image}}'"         # sha-$(git rev-parse --short=12 origin/main)
```

## SSH key responsibilities

- `${DEPLOY_SSH_KEY}` — dedicated ed25519 deploy key, installed on the
  server's `authorized_keys` and mirrored in GitHub Secrets as
  `DEPLOY_SSH_KEY`. Revoke by deleting the `mbeditor-gha-deploy` line in
  `~${PROD_USER}/.ssh/authorized_keys`.
- `${ADMIN_SSH_KEY}` — cloud-vendor default key, **not** stored in GitHub.
  Use for emergency access only.
