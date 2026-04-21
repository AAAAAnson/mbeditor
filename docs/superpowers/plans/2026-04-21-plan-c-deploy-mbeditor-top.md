# Production Deploy to mbeditor.mbluostudio.com — Plan C

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Domain pivot (2026-04-21 mid-execution):** The original target was `mbeditor.top`, but that domain was not ICP-filed. Since the Tencent Cloud Lightweight host blocks 80/443 for unfiled domains, we pivoted to the already-filed subdomain **`mbeditor.mbluostudio.com`**. One DNS A record (host `mbeditor` under `mbluostudio.com`), one Let's Encrypt cert, no `www.` variant. The old `mbeditor.top` domain is shelved for a future ICP filing.

**Goal:** Ship MBEditor (post-Plans-A/B state) to https://mbeditor.mbluostudio.com on the existing Tencent Cloud Lightweight server, coexisting with mbluostudio.com (the parent domain's existing vhost). Images built on GitHub Actions and pushed to GHCR; server pulls and runs. No per-user state on disk.

**Architecture:** GitHub Actions builds and publishes `ghcr.io/aaaaanson/mbeditor-frontend` and `ghcr.io/aaaaanson/mbeditor-backend` on every push to main. The server runs a pull-only `docker-compose.prod.yml` at /opt/mbeditor/, binding to loopback ports 7073 (frontend) and 7072 (backend). System Nginx terminates TLS (Let's Encrypt) and reverse-proxies to those ports. Rollback = pull a previous SHA tag + restart.

**Tech Stack:** GitHub Actions, GHCR, Docker Compose, Nginx, Certbot, Let's Encrypt, Playwright.

**Decisions made during planning (beyond the brief):**
- Backend port kept at **7072** (not 7070) to match the repo's existing `docker-compose.yml`; avoids collision with an unrelated service and keeps local dev and prod symmetrical.
- Only `/` is proxied by the host Nginx. The frontend container's embedded nginx (`frontend/nginx.conf`) already forwards `/api/` and `/images/` to the backend via the internal compose network, so the host vhost stays minimal and does not need to know about the backend port. Backend still binds to `127.0.0.1:7072` for direct smoke tests and for future host-Nginx /api/ routing if desired.
- `depends_on.condition: service_healthy` is preserved in the prod compose so the frontend waits for the backend.
- No `./data` volume in prod (Plans A/B made the backend stateless). The prod compose intentionally omits the mount; if this is violated it will be caught in Stage 1 verification.
- Images registry path is all-lowercase per GHCR rules: `ghcr.io/aaaaanson/mbeditor-frontend` and `ghcr.io/aaaaanson/mbeditor-backend`.

## File Structure

Local repo (new or modified):
- `docker-compose.prod.yml` — production compose, pulls from GHCR, no build, no volumes, 127.0.0.1-only ports.
- `.github/workflows/deploy.yml` — build + push to GHCR, then SSH deploy.
- `deploy/nginx/mbeditor.conf` — copy of the server Nginx vhost, tracked for auditability.
- `deploy/README.md` — short pointer doc (paths, secret names, rollback command).
- `scripts/prod-smoke.sh` — curl-based smoke-test script used by the deploy job.
- `docs/superpowers/plans/2026-04-21-plan-c-deploy-mbeditor-top.md` — this plan.

On the target server (ubuntu@129.204.250.203):
- `/opt/mbeditor/docker-compose.prod.yml`
- `/opt/mbeditor/.env` (empty or just a banner — no secrets needed today; file reserved for future use)
- `/etc/nginx/sites-available/mbeditor` (symlinked into `sites-enabled/`)
- `/etc/letsencrypt/live/mbeditor.mbluostudio.com/` (managed by certbot)

GitHub repo settings (new):
- Actions secret `DEPLOY_SSH_KEY` — contents of `D:/Web/mbeditor_deploy` (dedicated ed25519 deploy key; NOT the admin key `D:/Web/windows.pem`)
- Actions secret `DEPLOY_HOST` — `129.204.250.203`
- Actions secret `DEPLOY_USER` — `ubuntu`
- (optional) Actions variable `DEPLOY_PATH` — `/opt/mbeditor`

---

## Stage 1: Production compose file

**Files:**
- Create: `D:/Web/MBEditor/docker-compose.prod.yml`

- [ ] **Step 1: Confirm the dev compose ports**
  Command: `grep -n "7073\|7072\|8000" D:/Web/MBEditor/docker-compose.yml`
  Expected: matches lines containing `"7073:80"` and `"7072:8000"`.

- [ ] **Step 2: Write `docker-compose.prod.yml`** at repo root with exactly this content:

  ```yaml
  # Production compose for mbeditor.mbluostudio.com.
  # Pulls prebuilt images from GHCR — does NOT build.
  # Ports bind to 127.0.0.1 only; system Nginx terminates TLS.
  services:
    backend:
      image: ghcr.io/aaaaanson/mbeditor-backend:${MBEDITOR_TAG:-latest}
      container_name: mbeditor-backend
      restart: unless-stopped
      ports:
        - "127.0.0.1:7072:8000"
      environment:
        - IMAGES_DIR=/app/data/images
        - ARTICLES_DIR=/app/data/articles
        - CONFIG_FILE=/app/data/config.json
        - MAX_UPLOAD_SIZE=52428800
      healthcheck:
        test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/version')"]
        interval: 10s
        timeout: 5s
        retries: 5
        start_period: 15s

    frontend:
      image: ghcr.io/aaaaanson/mbeditor-frontend:${MBEDITOR_TAG:-latest}
      container_name: mbeditor-frontend
      restart: unless-stopped
      depends_on:
        backend:
          condition: service_healthy
      ports:
        - "127.0.0.1:7073:80"
  ```

- [ ] **Step 3: Lint the YAML locally**
  Command: `docker compose -f D:/Web/MBEditor/docker-compose.prod.yml config --quiet`
  Expected: no output, exit code 0.

- [ ] **Step 4: Confirm no `build:` keys and no `volumes:` keys**
  Command: `grep -nE "^\s*(build|volumes):" D:/Web/MBEditor/docker-compose.prod.yml || echo "OK none found"`
  Expected: `OK none found`.

- [ ] **Step 5: Commit locally**
  Command: `cd D:/Web/MBEditor && git add docker-compose.prod.yml && git commit -m "Add production compose pulling from GHCR"`
  Expected: 1 file changed.

---

## Stage 2: GitHub Actions build + push to GHCR

**Files:**
- Create: `D:/Web/MBEditor/.github/workflows/deploy.yml`
- Create: `D:/Web/MBEditor/scripts/prod-smoke.sh`

- [ ] **Step 1: Write `scripts/prod-smoke.sh`**

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  HOST="${1:-127.0.0.1}"
  FRONT_PORT="${2:-7073}"
  BACK_PORT="${3:-7072}"
  echo "Smoke: frontend http://${HOST}:${FRONT_PORT}/"
  curl -fsS -o /dev/null -w "frontend HTTP %{http_code}\n" "http://${HOST}:${FRONT_PORT}/"
  echo "Smoke: backend http://${HOST}:${BACK_PORT}/api/v1/version"
  curl -fsS -w "backend HTTP %{http_code}\n" "http://${HOST}:${BACK_PORT}/api/v1/version"
  echo "Smoke OK"
  ```

  Then: `chmod +x D:/Web/MBEditor/scripts/prod-smoke.sh`
  (On Windows, run `git update-index --chmod=+x scripts/prod-smoke.sh` after `git add`.)

- [ ] **Step 2: Write `.github/workflows/deploy.yml`** with exactly this content:

  ```yaml
  name: Build and Deploy

  on:
    push:
      branches: [main]
    workflow_dispatch:

  concurrency:
    group: deploy-${{ github.ref }}
    cancel-in-progress: false

  env:
    REGISTRY: ghcr.io
    IMAGE_OWNER: aaaaanson
    IMAGE_FRONTEND: mbeditor-frontend
    IMAGE_BACKEND: mbeditor-backend

  jobs:
    build-and-push:
      runs-on: ubuntu-latest
      permissions:
        contents: read
        packages: write
      outputs:
        sha_short: ${{ steps.sha.outputs.short }}
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Short SHA
          id: sha
          run: echo "short=$(git rev-parse --short=12 HEAD)" >> "$GITHUB_OUTPUT"

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Log in to GHCR
          uses: docker/login-action@v3
          with:
            registry: ${{ env.REGISTRY }}
            username: ${{ github.actor }}
            password: ${{ secrets.GITHUB_TOKEN }}

        - name: Build and push backend
          uses: docker/build-push-action@v6
          with:
            context: ./backend
            push: true
            tags: |
              ${{ env.REGISTRY }}/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_BACKEND }}:latest
              ${{ env.REGISTRY }}/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_BACKEND }}:sha-${{ steps.sha.outputs.short }}
            cache-from: type=gha,scope=backend
            cache-to: type=gha,mode=max,scope=backend

        - name: Build and push frontend
          uses: docker/build-push-action@v6
          with:
            context: ./frontend
            push: true
            tags: |
              ${{ env.REGISTRY }}/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_FRONTEND }}:latest
              ${{ env.REGISTRY }}/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_FRONTEND }}:sha-${{ steps.sha.outputs.short }}
            cache-from: type=gha,scope=frontend
            cache-to: type=gha,mode=max,scope=frontend

    deploy:
      needs: build-and-push
      runs-on: ubuntu-latest
      environment: production
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Install SSH key
          run: |
            install -m 700 -d ~/.ssh
            echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/deploy.pem
            chmod 600 ~/.ssh/deploy.pem
            ssh-keyscan -H "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts

        - name: Pull and restart on server
          env:
            DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
            DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
            SHA_TAG: sha-${{ needs.build-and-push.outputs.sha_short }}
          run: |
            ssh -i ~/.ssh/deploy.pem "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<EOF
            set -euo pipefail
            cd /opt/mbeditor
            export MBEDITOR_TAG="${SHA_TAG}"
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
            docker image prune -f
            EOF

        - name: Remote smoke test
          env:
            DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
            DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          run: |
            scp -i ~/.ssh/deploy.pem scripts/prod-smoke.sh "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/prod-smoke.sh"
            ssh -i ~/.ssh/deploy.pem "${DEPLOY_USER}@${DEPLOY_HOST}" "chmod +x /tmp/prod-smoke.sh && /tmp/prod-smoke.sh 127.0.0.1 7073 7072"

        - name: Public smoke test
          run: |
            curl -fsS -o /dev/null -w "public / HTTP %{http_code}\n" https://mbeditor.mbluostudio.com/
            curl -fsS -o /dev/null -w "public /api/v1/version HTTP %{http_code}\n" https://mbeditor.mbluostudio.com/api/v1/version
  ```

- [ ] **Step 3: Validate workflow syntax with `gh`**
  Command: `gh workflow view deploy.yml --repo AAAAAnson/mbeditor 2>&1 || echo "not pushed yet; will validate after push"`
  Expected: either a view or the fallback message (workflow only becomes visible after push).

- [ ] **Step 4: Commit locally**
  Command: `cd D:/Web/MBEditor && git add .github/workflows/deploy.yml scripts/prod-smoke.sh && git commit -m "Add GHCR build + SSH deploy workflow"`
  Expected: 2 files changed.

- [ ] **Step 5: Create a dedicated deploy key, install it on the server, then create GitHub Actions secrets and environment**
  Why a dedicated key: `D:/Web/windows.pem` is the Tencent Cloud admin key (with access to mbluostudio and future servers). Putting it in GitHub Secrets would mean anyone who can merge a workflow edit can exfiltrate full admin SSH. We generate a scoped ed25519 key that only grants `ubuntu@129.204.250.203` login; revocation is a single `authorized_keys` line.

  Commands (run locally):
  ```bash
  # a) Generate dedicated key (outside the repo so it is never committed).
  ssh-keygen -t ed25519 -f D:/Web/mbeditor_deploy -N "" -C "mbeditor-gha-deploy@$(date +%Y-%m-%d)"

  # b) Install the public half on the server (using the admin key for this one-time step).
  PUB=$(cat D:/Web/mbeditor_deploy.pub)
  ssh -i D:/Web/windows.pem ubuntu@129.204.250.203 "grep -qF 'mbeditor-gha-deploy' ~/.ssh/authorized_keys || echo \"$PUB\" >> ~/.ssh/authorized_keys"

  # c) Verify new key works.
  ssh -i D:/Web/mbeditor_deploy ubuntu@129.204.250.203 'echo deploy-key login OK'

  # d) Upload secrets (upload the PRIVATE half of the dedicated key, NOT windows.pem).
  gh secret set DEPLOY_SSH_KEY --repo AAAAAnson/mbeditor < D:/Web/mbeditor_deploy
  gh secret set DEPLOY_HOST --repo AAAAAnson/mbeditor --body "129.204.250.203"
  gh secret set DEPLOY_USER --repo AAAAAnson/mbeditor --body "ubuntu"
  gh api -X PUT repos/AAAAAnson/mbeditor/environments/production
  ```
  Expected: key pair generated, pubkey appended once on the server, `deploy-key login OK`, each `gh secret set` prints `✓ Set secret DEPLOY_*`. The last call returns JSON with `"name":"production"`.

- [ ] **Step 6: ⚠️ Pause here — operator confirms before running. This triggers the first production image build (harmless unless server bootstrap in Stage 4 is already done; the SSH deploy step will fail until then and that is expected).**
  Command: `cd D:/Web/MBEditor && git push origin main`
  Expected: push succeeds; GitHub Actions kicks off `Build and Deploy`.

- [ ] **Step 7: Verify first build reached GHCR (even if deploy step fails)**
  Command: `gh run watch --repo AAAAAnson/mbeditor`
  Then: `gh api -H "Accept: application/vnd.github+json" /users/AAAAAnson/packages/container/mbeditor-frontend/versions | head -40`
  Expected: at least one version with tags including `latest` and `sha-<12char>`.

---

## Stage 3: DNS configuration

**Files:** none (DNS-registrar web UI).

- [ ] **Step 1: ⚠️ Pause here — operator confirms before running. DNS changes are globally visible.**
  In the DNSPod control panel for `mbluostudio.com`, add:
  - A record, host `mbeditor`, value `129.204.250.203`, TTL `600`

- [ ] **Step 2: Verify propagation from the dev machine**
  Command: `nslookup mbeditor.mbluostudio.com 1.1.1.1` (or `dig +short mbeditor.mbluostudio.com @1.1.1.1` if dig is available)
  Expected: resolves to `129.204.250.203`. Note: Chinese ISP DNS hijacking may return `198.18.x.x` placeholder from the dev machine even after propagation — if so, verify from the server instead (Step 3). Retry every 2 minutes for up to 30 minutes if still empty.

- [ ] **Step 3: Verify propagation from the server itself (authoritative)**
  Command: `ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "dig +short mbeditor.mbluostudio.com @1.1.1.1"`
  Expected: prints `129.204.250.203`.

---

## Stage 4: Server bootstrap (manual, one-time)

**Files:**
- Create on server: `/opt/mbeditor/docker-compose.prod.yml`
- Create on server: `/opt/mbeditor/.env`

- [ ] **Step 1: SSH in and create the directory**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo install -d -o ubuntu -g ubuntu -m 0755 /opt/mbeditor && ls -ld /opt/mbeditor"
  ```
  Expected: `drwxr-xr-x  ... ubuntu ubuntu ... /opt/mbeditor`.

- [ ] **Step 2: Copy the prod compose to the server**
  Command (from dev machine):
  ```bash
  scp -i /d/Web/windows.pem D:/Web/MBEditor/docker-compose.prod.yml ubuntu@129.204.250.203:/opt/mbeditor/docker-compose.prod.yml
  ```
  Expected: `docker-compose.prod.yml 100%`.

- [ ] **Step 3: Create the placeholder `.env`**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "printf '# reserved for future runtime config\n' > /opt/mbeditor/.env && ls -la /opt/mbeditor"
  ```
  Expected: listing shows `.env` and `docker-compose.prod.yml`.

- [ ] **Step 4: Generate a GHCR read-only PAT for the server**
  In GitHub web UI: Settings → Developer settings → Personal access tokens → Fine-grained tokens → New token, scope `read:packages` only, 90-day expiry. Copy the token. **Do not commit it anywhere.**

- [ ] **Step 5: ⚠️ Pause here — operator confirms before running. Interactive `docker login` on the live server; operator pastes the PAT.**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem -t ubuntu@129.204.250.203 "echo '<PAT paste when prompted>' | docker login ghcr.io -u AAAAAnson --password-stdin"
  ```
  (Practically: run `ssh -i /d/Web/windows.pem -t ubuntu@129.204.250.203` first, then inside the session run `docker login ghcr.io -u AAAAAnson`, paste the PAT at the password prompt.)
  Expected: `Login Succeeded`.

- [ ] **Step 6: ⚠️ Pause here — operator confirms before running. First production pull + start.**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "cd /opt/mbeditor && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
  ```
  Expected: both images pull; `Creating mbeditor-backend ... done` and `Creating mbeditor-frontend ... done`.

- [ ] **Step 7: Container state verification**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "docker ps --filter name=mbeditor- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
  ```
  Expected: two rows, both `Up (healthy)` within ~30s; ports show `127.0.0.1:7073->80/tcp` and `127.0.0.1:7072->8000/tcp`.

- [ ] **Step 8: Loopback smoke test**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "curl -fsS -o /dev/null -w 'front %{http_code}\n' http://127.0.0.1:7073/ && curl -fsS -w 'back %{http_code}\n' http://127.0.0.1:7072/api/v1/version"
  ```
  Expected: `front 200` and `back 200` plus a JSON body containing a version string.

- [ ] **Step 9: Confirm ports are NOT publicly bound**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "ss -ltn '( sport = :7072 or sport = :7073 )'"
  ```
  Expected: both listeners are on `127.0.0.1:7072` and `127.0.0.1:7073` only — no `0.0.0.0:...`.

---

## Stage 5: Nginx vhost + TLS

**Files:**
- Create: `D:/Web/MBEditor/deploy/nginx/mbeditor.conf` (auditable copy in repo)
- Create on server: `/etc/nginx/sites-available/mbeditor`
- Create on server: symlink `/etc/nginx/sites-enabled/mbeditor` → `../sites-available/mbeditor`

- [ ] **Step 1: Inspect the existing mbluostudio vhost to confirm shared settings**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo cat /etc/nginx/sites-enabled/mbluostudio"
  ```
  Record: HSTS max-age, whether a top-level `limit_req_zone` / `limit_conn_zone` is already defined in `/etc/nginx/nginx.conf`.

- [ ] **Step 2: Verify rate-limit zones exist (or note they don't)**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo grep -nE 'limit_req_zone|limit_conn_zone' /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf 2>/dev/null"
  ```
  Expected: either matches (reuse those zone names in the vhost) or no output. If no output, leave the `limit_req` / `limit_conn` directives out of the vhost — do NOT silently fail. Document the finding in the vhost file as a comment.

- [ ] **Step 3: Write `deploy/nginx/mbeditor.conf` in the repo** with exactly this content (HTTP-only stub; certbot will later augment with TLS server block):

  ```nginx
  # /etc/nginx/sites-available/mbeditor
  # Managed by repo: deploy/nginx/mbeditor.conf
  # Certbot adds the TLS server{} on first run and edits this file in place.

  server {
      listen 80;
      listen [::]:80;
      server_name mbeditor.mbluostudio.com;

      # ACME challenge + redirect everything else to HTTPS.
      location /.well-known/acme-challenge/ {
          root /var/www/html;
      }
      location / {
          return 301 https://mbeditor.mbluostudio.com$request_uri;
      }
  }

  server {
      listen 443 ssl http2;
      listen [::]:443 ssl http2;
      server_name mbeditor.mbluostudio.com;

      # Certbot fills in ssl_certificate / ssl_certificate_key on first run.

      # Security headers (mirror mbluostudio.com).
      add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
      add_header X-Frame-Options "SAMEORIGIN" always;
      add_header X-Content-Type-Options "nosniff" always;
      add_header Referrer-Policy "strict-origin-when-cross-origin" always;

      # Large enough for a 50 MB image upload (backend MAX_UPLOAD_SIZE).
      client_max_body_size 55M;

      # Everything proxies to the frontend container; the frontend's embedded
      # nginx forwards /api/ and /images/ to the backend via the compose network.
      location / {
          proxy_pass http://127.0.0.1:7073;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;

          # WebSocket-safe even though prod has no HMR.
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection $connection_upgrade;

          proxy_connect_timeout 60s;
          proxy_send_timeout 60s;
          proxy_read_timeout 60s;
      }
  }
  ```

- [ ] **Step 4: Ensure `$connection_upgrade` map exists on the server**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo grep -Rn 'connection_upgrade' /etc/nginx/ | head -5"
  ```
  If nothing is returned, add the map once:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo tee /etc/nginx/conf.d/websocket-map.conf >/dev/null <<'NGX'
  map \$http_upgrade \$connection_upgrade {
      default upgrade;
      ''      close;
  }
  NGX"
  ```
  Expected: file exists, single definition across the whole tree.

- [ ] **Step 5: Upload the vhost to the server**
  Command:
  ```bash
  scp -i /d/Web/windows.pem D:/Web/MBEditor/deploy/nginx/mbeditor.conf ubuntu@129.204.250.203:/tmp/mbeditor.conf
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo mv /tmp/mbeditor.conf /etc/nginx/sites-available/mbeditor && sudo ln -sf /etc/nginx/sites-available/mbeditor /etc/nginx/sites-enabled/mbeditor && ls -l /etc/nginx/sites-enabled/mbeditor"
  ```
  Expected: listing shows the symlink.

- [ ] **Step 6: Temporarily comment the TLS server blocks (certbot needs them absent or valid)**
  Because the vhost references certs that don't yet exist, on the first run we must keep only the :80 block. Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo cp /etc/nginx/sites-available/mbeditor /etc/nginx/sites-available/mbeditor.bak && sudo awk 'BEGIN{skip=0} /listen 443/{skip=1} skip==1 && /^}/{skip=0; next} skip==0{print}' /etc/nginx/sites-available/mbeditor.bak | sudo tee /etc/nginx/sites-available/mbeditor >/dev/null"
  ```
  Expected: subsequent `sudo nginx -t` passes.

- [ ] **Step 7: Validate Nginx syntax**
  Command: `ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo nginx -t"`
  Expected: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok` and `test is successful`.

- [ ] **Step 8: Reload Nginx**
  Command: `ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo systemctl reload nginx"`
  Expected: no output, exit code 0.

- [ ] **Step 9: HTTP check (still HTTP-only at this stage)**
  Command: `curl -I http://mbeditor.mbluostudio.com/`
  Expected: `HTTP/1.1 301 Moved Permanently` with `Location: https://mbeditor.mbluostudio.com/` (the redirect will fail to load until TLS is issued — that is fine).

- [ ] **Step 10: ⚠️ Pause here — operator confirms before running. Issues real Let's Encrypt certs; rate-limited, do not retry blindly.**
  Command:
  ```bash
  ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "sudo certbot --nginx -d mbeditor.mbluostudio.com --non-interactive --agree-tos -m mbluoshopee@gmail.com --redirect"
  ```
  Expected: `Congratulations! You have successfully enabled HTTPS on https://mbeditor.mbluostudio.com`.

- [ ] **Step 11: Restore the full vhost (TLS blocks re-added) and re-apply**
  Command:
  ```bash
  scp -i /d/Web/windows.pem D:/Web/MBEditor/deploy/nginx/mbeditor.conf ubuntu@129.204.250.203:/tmp/mbeditor.conf
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo mv /tmp/mbeditor.conf /etc/nginx/sites-available/mbeditor && sudo nginx -t && sudo systemctl reload nginx"
  ```
  Expected: `test is successful`, reload returns cleanly. Certbot's `ssl_certificate` lines are added by the certbot nginx plugin automatically — verify with `sudo grep ssl_certificate /etc/nginx/sites-available/mbeditor`.

- [ ] **Step 12: Certificate auto-renew timer check**
  Command: `ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "sudo systemctl list-timers | grep certbot"`
  Expected: a line like `... certbot.timer ... certbot.service`.

- [ ] **Step 13: End-to-end TLS verification**
  Command:
  ```bash
  curl -fsS -o /dev/null -w "apex %{http_code} %{ssl_verify_result}\n" https://mbeditor.mbluostudio.com/
  curl -fsS https://mbeditor.mbluostudio.com/api/v1/version
  ```
  Expected: apex `200 0`; `/api/v1/version` returns JSON.

- [ ] **Step 14: Commit the audit copy of the vhost**
  Command: `cd D:/Web/MBEditor && git add deploy/nginx/mbeditor.conf && git commit -m "Track production Nginx vhost for mbeditor.mbluostudio.com"`

---

## Stage 6: GitHub Actions auto-deploy

**Files:** none new (Stage 2 already wrote `.github/workflows/deploy.yml`).

- [ ] **Step 1: Trigger a manual run to validate the deploy job against the fully bootstrapped server**
  Command: `gh workflow run "Build and Deploy" --repo AAAAAnson/mbeditor --ref main`
  Expected: `✓ Created workflow_dispatch event`.

- [ ] **Step 2: Watch it to completion**
  Command: `gh run watch --repo AAAAAnson/mbeditor`
  Expected: both jobs `build-and-push` and `deploy` finish green. The `Public smoke test` step must print `public / HTTP 200` and `public /api/v1/version HTTP 200`.

- [ ] **Step 3: Verify the deployed tag on the server matches the latest commit SHA**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "docker inspect mbeditor-frontend --format '{{.Config.Image}}' && docker inspect mbeditor-backend --format '{{.Config.Image}}'"
  ```
  Expected: both images tagged `sha-<12-char SHA of main>` matching `git rev-parse --short=12 origin/main`.

- [ ] **Step 4: Make a trivial change and prove continuous deploy works end-to-end**
  Locally:
  ```bash
  cd D:/Web/MBEditor
  printf "\n" >> README.md
  git add README.md && git commit -m "Touch README to verify auto-deploy"
  ```

- [ ] **Step 5: ⚠️ Pause here — operator confirms before running. Push to main triggers a real production deploy.**
  Command: `git push origin main`

- [ ] **Step 6: Watch the run, confirm new SHA live**
  Command: `gh run watch --repo AAAAAnson/mbeditor && curl -fsS https://mbeditor.mbluostudio.com/api/v1/version`
  Expected: green run; version endpoint still 200; server `docker inspect` shows the new short SHA.

---

## Stage 7: Production Playwright regression

**Files:**
- (read-only) existing visual-parity test suite under `D:/Web/MBEditor/frontend/` or `MBEditor/` Playwright project.

- [ ] **Step 1: Locate the existing Playwright config and identify the target-URL env var**
  Command: `grep -RnE "baseURL|BASE_URL|mbeditor" D:/Web/MBEditor/frontend/ D:/Web/MBEditor/MBEditor/ 2>/dev/null | grep -i playwright`
  Expected: the project reads a `PW_BASE_URL` / `BASE_URL` style env var (or the plan operator identifies the exact variable name and substitutes it below).

- [ ] **Step 2: Run the full visual-parity suite against production**
  Command (adjust the env var name to whatever Step 1 found):
  ```bash
  cd D:/Web/MBEditor/frontend && PW_BASE_URL=https://mbeditor.mbluostudio.com npx playwright test --reporter=list
  ```
  Expected: all specs pass, pixel diff `0` on every visual snapshot. This is the acceptance gate per the user's memory ("验收标准 = 视觉一致性").

- [ ] **Step 3: If any diffs appear, triage immediately**
  Do NOT update baselines. Treat every non-zero diff as a production regression and roll back (Stage 8) before investigating. Capture the HTML report to `D:/Web/MBEditor/playwright-report/` and attach it to the rollback notes.

- [ ] **Step 4: Commit a dated screenshot bundle as evidence (optional but recommended)**
  Command:
  ```bash
  cd D:/Web/MBEditor && git add playwright-report/ && git commit -m "Capture prod visual-parity evidence for mbeditor.mbluostudio.com launch" || echo "nothing to commit"
  ```

---

## Stage 8: Rollback drill (intentional rollback, then forward)

**Files:** none (operational drill).

- [ ] **Step 1: List available image versions**
  Command:
  ```bash
  gh api -H "Accept: application/vnd.github+json" /users/AAAAAnson/packages/container/mbeditor-frontend/versions | grep -E '"name"|"tags"' | head -40
  gh api -H "Accept: application/vnd.github+json" /users/AAAAAnson/packages/container/mbeditor-backend/versions  | grep -E '"name"|"tags"' | head -40
  ```
  Expected: at least two `sha-...` tags per image.

- [ ] **Step 2: Pick a previous SHA and record both the previous and current values**
  Command: `git log --oneline -n 5 origin/main` — pick the 2nd-most-recent. Call its short-SHA `PREV` and the current one `CUR`.

- [ ] **Step 3: ⚠️ Pause here — operator confirms before running. Rolls production back to a previous image.**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "cd /opt/mbeditor && MBEDITOR_TAG=sha-<PREV> docker compose -f docker-compose.prod.yml pull && MBEDITOR_TAG=sha-<PREV> docker compose -f docker-compose.prod.yml up -d"
  ```
  Expected: containers restart on the `sha-<PREV>` tag. `docker inspect mbeditor-frontend --format '{{.Config.Image}}'` reflects `<PREV>`.

- [ ] **Step 4: Verify the site still serves (older version acceptable during drill)**
  Command: `curl -fsS -o /dev/null -w "rollback %{http_code}\n" https://mbeditor.mbluostudio.com/`
  Expected: `rollback 200`.

- [ ] **Step 5: ⚠️ Pause here — operator confirms before running. Rolls forward to current.**
  Command:
  ```bash
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 "cd /opt/mbeditor && MBEDITOR_TAG=sha-<CUR> docker compose -f docker-compose.prod.yml pull && MBEDITOR_TAG=sha-<CUR> docker compose -f docker-compose.prod.yml up -d"
  ```
  Expected: containers restart on `sha-<CUR>`; inspect confirms.

- [ ] **Step 6: Document the one-line rollback in `deploy/README.md`**
  Write:
  ```
  # Rollback
  ssh -i /d/Web/windows.pem ubuntu@129.204.250.203 \
    "cd /opt/mbeditor && MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
     docker compose -f docker-compose.prod.yml pull && \
     MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
     docker compose -f docker-compose.prod.yml up -d"

  # Find previous SHAs
  gh api /users/AAAAAnson/packages/container/mbeditor-frontend/versions \
    | jq -r '.[].metadata.container.tags[]' | grep '^sha-' | head
  ```
  Then: `cd D:/Web/MBEditor && git add deploy/README.md && git commit -m "Document mbeditor.mbluostudio.com rollback procedure"`.

- [ ] **Step 7: ⚠️ Pause here — operator confirms before running. Pushes the doc update.**
  Command: `git push origin main`
  Expected: push succeeds; this triggers another green deploy run (no-op image content change).

---

## Verification checklist

Run every command below after Stage 8 completes. All must succeed before declaring Plan C done.

- [ ] **DNS:** `dig +short mbeditor.mbluostudio.com @1.1.1.1` → `129.204.250.203`
- [ ] **TLS apex:** `curl -fsS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://mbeditor.mbluostudio.com/` → `200 0`
- [ ] **API reachable via public HTTPS:** `curl -fsS https://mbeditor.mbluostudio.com/api/v1/version` → JSON version payload
- [ ] **HSTS present:** `curl -sI https://mbeditor.mbluostudio.com/ | grep -i strict-transport-security` → `max-age=63072000; includeSubDomains`
- [ ] **Ports not public:** `ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "ss -ltn '( sport = :7072 or sport = :7073 )'"` → both on `127.0.0.1` only
- [ ] **Containers healthy:** `ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "docker ps --filter name=mbeditor- --format '{{.Names}} {{.Status}}'"` → both `Up (healthy)`
- [ ] **Image tag = current main:** `ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "docker inspect mbeditor-frontend --format '{{.Config.Image}}'"` ends with `sha-$(git rev-parse --short=12 origin/main)`
- [ ] **Certbot timer active:** `ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 "sudo systemctl list-timers | grep certbot"` → non-empty
- [ ] **GitHub Actions last run green:** `gh run list --repo AAAAAnson/mbeditor --workflow="Build and Deploy" --limit 1 --json conclusion,status` → `"completed" / "success"`
- [ ] **mbluostudio.com apex still up (coexistence proof):** `curl -fsS -o /dev/null -w "%{http_code}\n" https://mbluostudio.com/` → `200`
- [ ] **Playwright visual-parity on prod URL:** `cd D:/Web/MBEditor/frontend && PW_BASE_URL=https://mbeditor.mbluostudio.com npx playwright test` → 0-pixel diff on every visual snapshot
- [ ] **Rollback one-liner is printable and correct:** `cat D:/Web/MBEditor/deploy/README.md` → contains the `MBEDITOR_TAG=sha-...` command

After all boxes are checked, advise the user (do NOT auto-write) to append to their user memory a new entry `project_mbeditor_deploy.md` summarizing:
- server IP, SSH key path, `/opt/mbeditor/` layout
- GHCR image names
- domain + vhost path + certbot renew status
- one-line rollback command
- GitHub Actions workflow name

That closes Plan C.
