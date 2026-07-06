# Deploy Notes

This directory contains public, coordinate-free deployment references for
MBEditor. Real hosts, private paths, domains, certificates, SSH keys, and NAS
commands belong in private operator notes, not in this repository.

## GitHub Actions

The public workflow in `.github/workflows/deploy.yml` only builds and publishes
container images to GHCR. It does not SSH to a server, restart containers, or
run public-domain smoke tests.

Published tags:

- `ghcr.io/aaaaanson/mbeditor-frontend:latest`
- `ghcr.io/aaaaanson/mbeditor-frontend:sha-<12char>`
- `ghcr.io/aaaaanson/mbeditor-backend:latest`
- `ghcr.io/aaaaanson/mbeditor-backend:sha-<12char>`

## Runtime Compose

`docker-compose.prod.yml` is a minimal consumer of those prebuilt images. Set
`MBEDITOR_TAG=sha-<12char>` to pin both services to a specific build, or leave
it unset to use `latest`.

```bash
MBEDITOR_TAG=sha-<12char> docker compose -f docker-compose.prod.yml pull
MBEDITOR_TAG=sha-<12char> docker compose -f docker-compose.prod.yml up -d
```

The compose file binds frontend and backend ports to `127.0.0.1`. Put a private
reverse proxy, NAS deployment wrapper, or platform-specific ingress in front of
it outside the public repository.

## WeChat Gateway (optional)

The backend can route WeChat API calls through a fixed-IP relay so the call's
egress IP satisfies the 公众号 IP allowlist. Configure it in the editor UI
(**Settings → 发布服务器**) or via `WECHAT_API_BASE` / `WECHAT_PROXY_TOKEN` /
`WECHAT_PROXY_CA` env. UI-set config persists in the `mbeditor-data` named volume
(`/app/data/gateway.json`); the gateway address/token/cert are deployment-private
and never live in this repo. Precedence: stored config > env > direct. See the
[Wiki › 微信网关配置](https://github.com/AAAAAnson/mbeditor/wiki/WeChat-Gateway).

## Nginx Templates

`deploy/nginx/mbeditor.http-only.conf` and `deploy/nginx/mbeditor.conf` are
templates. Replace `SERVICE_DOMAIN` and certificate paths in private deployment
material before installing them.

The templates intentionally avoid:

- real public hostnames
- real certificate directories
- public SSH target details
- provider-specific server paths

## Verification

Verification should run in the private deployment environment after images are
pulled and containers restart. At minimum, check:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:7073/ -o /dev/null
curl -fsS http://127.0.0.1:7072/api/v1/version
```
