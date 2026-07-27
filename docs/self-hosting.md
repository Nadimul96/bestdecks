# Self-hosting Bestdecks

Bestdecks is designed for a bring-your-own-key deployment. You operate the application, database, renderer, provider accounts, backups, access control, and data-retention policy.

This guide covers the current implemented code paths. It does not certify a production deployment or replace provider-specific security review.

## Prerequisites

- Node.js 24.18.0
- pnpm 11.7.0
- Docker Engine and Docker Compose when using the bundled Presenton helper or production topology
- a writable local or mounted path for SQLite
- a reviewed TLS reverse proxy for any network-accessible deployment
- Cloudflare Browser Rendering credentials for the primary crawler
- a Perplexity API key for enrichment
- a Gemini API key for brief and slide planning
- a reachable Presenton service for the documented renderer path

Deepcrawl, Alai, and Plus AI adapter code is outside the durable reference path. The active run API
does not accept a Deepcrawl fallback or crawl-exception setting, and a failed Cloudflare crawl
blocks that target. Alai and Plus AI remain experimental because no checked-in reference receipt
proves them.

## 1. Prepare configuration without overwriting state

From a fresh clone, the quickest local path is:

```bash
pnpm setup
```

This creates `.env.local` with independent auth, encryption, and renderer secrets; a local SQLite
path; the exact supported Presenton digest; and the single-user local credential mode. Add your
Cloudflare, Perplexity, and Gemini credentials, then run `pnpm install --frozen-lockfile`. It never
overwrites an existing configuration; inspect and edit an existing `.env.local` in place.

`pnpm setup` generates independent high-entropy values for:

- `BETTER_AUTH_SECRET`
- `APP_SECRETS_KEY`
- the initial admin password, if bootstrap is used

Store secrets in your deployment secret manager. Never commit `.env.local`, `.env.production`, provider responses, database files, or backup archives.

## 2. Configure the application

Core application settings:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Canonical application origin; an absolute HTTPS origin in production, with no credentials, query, fragment, or non-root path |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Optional browser-visible authentication origin under the same strict production-origin rules; omit it for same-origin auth |
| `BETTER_AUTH_SECRET` | Required authentication signing secret; at least 32 characters and never shared with another key |
| `APP_SECRETS_KEY` | Independent encryption key used for stored integration settings; at least 32 characters |
| `APP_SECRETS_KEY_PREVIOUS` | Temporary decrypt-only fallback during a controlled encryption-key rotation |
| `BESTDECKS_COMMIT_SHA` | Exact 7–64 character hexadecimal source commit retained in run receipts; the worker fails before provider dispatch when absent |
| `LOCAL_DB_PATH` | SQLite database path |

Reference provider settings:

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account scope |
| `CLOUDFLARE_API_TOKEN` | Browser Rendering token with minimum required permissions |
| `PERPLEXITY_API_KEY` | External company enrichment |
| `GEMINI_API_KEY` | Brief building and slide planning |
| `PRESENTON_BASE_URL` | Reachable Presenton service |
| `PRESENTON_AUTH_USERNAME` | Self-hosted Presenton HTTP Basic username |
| `PRESENTON_AUTH_PASSWORD` | Self-hosted Presenton HTTP Basic password; at least 6 characters |
| `PRESENTON_TEMPLATE` | Bestdecks inline-vector profile assertion; must match the checked-in manifest and is never sent to Presenton |
| `ALLOW_SHARED_PROVIDER_CREDENTIALS` | Explicitly permits authenticated tenants to use process-level provider credentials; use `1` only for an intentional single-tenant/operator-funded deployment |

Provider credentials stored through a tenant-owned integration record are scoped to that tenant.
Process-level provider variables are deliberately ignored for user-owned jobs unless
`ALLOW_SHARED_PROVIDER_CREDENTIALS=1`. For a single-user self-host that supplies BYOK credentials
only through `.env.local` or Compose, set the flag to `1`. Keep it at `0` for multi-user hosting and
configure a complete credential set per tenant; the runtime never combines a tenant-controlled
endpoint/account with an operator-global secret.

Optional adapters:

| Variable | Adapter status |
| --- | --- |
| `DEEPCRAWL_API_KEY` | Legacy adapter credential; not consumed by the durable reference worker |
| `ALAI_API_KEY` | Experimental renderer |
| `PLUSAI_API_KEY` | Experimental renderer |

The application does not provide or resell provider credits. Set provider-side budgets, rate limits, and alerts before live use.

In production, use the public TLS origin that actually terminates at this application. Cookie-authenticated
mutations require an exact origin match; sibling subdomains and forwarded `Origin`/`Host` values are not
trusted substitutes. Plain HTTP is accepted only for localhost or loopback development outside production.
For the Compose example, `BETTER_AUTH_URL`, optional `NEXT_PUBLIC_BETTER_AUTH_URL`, and the TLS origin
formed from `APP_DOMAIN` must be exactly equal.

### Rotate stored integration-secret encryption safely

New integration secrets use a versioned AES-256-GCM envelope. Its authenticated data binds the
ciphertext to the owning user and provider, and its key identifier is a one-way fingerprint rather
than key material. The reader remains compatible with the legacy three-part envelope so a
controlled migration can rewrap existing rows.

Treat rotation as an operator-controlled maintenance event:

1. Take a verified, non-overwriting database backup and stop integration-setting writes. Ensure no
   process using the old key can return after the rewrap and write old-key ciphertext.
2. Generate a new independent key. Configure it as `APP_SECRETS_KEY`, configure the old key as
   `APP_SECRETS_KEY_PREVIOUS`, and deploy that pair to every app and worker process.
3. From the same reviewed release and database boundary, run:

   ```bash
   pnpm secrets:rewrap -- --execute
   ```

4. Record the count-only result. The command authenticates every stored secret, archives each prior
   ciphertext in `integration_secret_archive`, and replaces it in one write transaction. It never
   prints plaintext, ciphertext, key identifiers, or key material. Any invalid row rolls back the
   complete transaction.
5. Run the command once more. A healthy second run reports zero rewrapped rows because current
   envelopes are verified but left untouched.
6. Restart and verify all app and worker processes while both keys remain configured. Only after no
   old-key writer remains and normal integration reads succeed should you remove
   `APP_SECRETS_KEY_PREVIOUS` and redeploy.

Do not pass either key on the command line. Do not run two different rotations concurrently. Prior
ciphertexts are retained in the archive for non-destructive review; the migration never overwrites
or removes existing archive records.

## 3. Prepare the renderer safely

Presenton is a separate, render-only service on the v0.1 path. Bestdecks creates the complete
native-vector `SlideModel.ui` array and calls Presenton's create, exact-update, and PPTX-export
routes. It never calls Presenton's model-backed content or layout-generation route.

The `pnpm presenton:start` helper requires `PRESENTON_IMAGE` to end in an immutable
`@sha256:` reference containing exactly 64 lowercase hexadecimal characters. It binds Presenton to
loopback and fails closed rather than replacing an existing container or Docker network whose
image, isolation, authentication, mount, port, or hardening policy differs. It stores renderer data
in `app_data/`. Inspect that directory and the helper before use; container lifecycle and retained
artifact data remain the operator's responsibility.

`pnpm presenton:start` parses `.env.local` with a dotenv parser before invoking the hardened shell
helper. It does not shell-source the file, so command substitutions and other shell syntax are never
evaluated. Shell-exported values take precedence for a one-off override.

Confirm that `PRESENTON_BASE_URL` points to the intended instance. Bestdecks requires a complete
Basic-auth pair for self-hosted Presenton and rejects `api.presenton.ai`, bearer/API-key
configuration, and partial authentication. Do not give the renderer an OpenAI key, model ID,
image-provider key, or other provider credential. The pinned upstream image requires the inert
startup compatibility selector `LLM=openai`, but the helper provides no model key and places the
renderer on a dedicated internal network without Internet egress.
Do not expose the renderer directly to the public internet. Renderer URLs containing signed or
unknown query capabilities are rejected before persistence. A managed service must copy verified
artifacts into operator-owned storage and retain an opaque object ID; the OSS worker does not store
third-party signed download URLs as plaintext capabilities.

## 4. Install and inspect configuration

```bash
pnpm install --frozen-lockfile
pnpm doctor
```

`pnpm doctor` reports whether expected values appear configured. It does not:

- contact providers;
- validate permissions or account ownership;
- inspect secret strength;
- prove network isolation;
- prove the end-to-end reference path.

## 5. Bootstrap authentication deliberately

The optional bootstrap variables are:

- `SEED_ADMIN_ON_STARTUP=1`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Use bootstrap only in a controlled deployment. After the intended account exists, set `SEED_ADMIN_ON_STARTUP=0` and remove the bootstrap password from the runtime environment. Do not reuse a personal or provider password.

## 6. Start the local application and worker

```bash
pnpm dev
```

In a second terminal, using the same environment and SQLite path:

```bash
pnpm worker
```

Open `http://localhost:3000` unless you configured a different origin. The web process persists
queued jobs; only the separate worker claims leases and performs Cloudflare, Perplexity, Gemini,
evidence-gate, and Presenton stages. `pnpm worker:once` claims at most one available job for a
controlled check.

Before network exposure, place the application behind TLS, restrict administrative access, verify trusted proxy/origin behavior, and review outbound access to crawl and model providers.

## 7. Run the production Compose topology

The production Compose file builds two targets from `deploy/app/Dockerfile`:

- `app`: the minimal Next.js standalone runtime;
- `worker`: the TypeScript worker source, locked dependencies, and `tsx` loader required by
  `node --import tsx src/bin/run-worker.ts`.

Both run as UID/GID `10001`, mount the same `bestdecks-data` volume at `/app/.data`, and have a
read-only root filesystem. Only their database, home, temporary, and app runtime-cache mounts are
writable. The worker shares the internal `backend` network with Presenton and separately joins
`provider-egress` for Cloudflare, Perplexity, and Gemini. Presenton joins only `backend`; it has no
provider-egress network and receives no provider credential. Neither worker nor Presenton publishes
a host port in this topology.

Docker network names are topology boundaries, not destination allowlists. The Compose file cannot
prove that `provider-egress` reaches only the reviewed provider hosts, and the reverse proxy still
needs certificate/network access. Enforce outbound destinations with host/cloud firewall policy or
an authenticated egress proxy, then verify DNS and IP behavior in the deployed environment.
Cloudflare Browser Rendering independently resolves public target hostnames, so the application's
preflight DNS result cannot be pinned into that remote crawl. Review and verify the provider's SSRF
contract in addition to enforcing deployment egress policy.

Add these deployment-only values to `.env.production` using image references verified with their
publishers. Do not substitute mutable tags:

```dotenv
NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:<verified-digest>
PRESENTON_IMAGE=<verified-presenton-image>@sha256:<verified-digest>
CADDY_IMAGE=caddy:<reviewed-version>@sha256:<verified-digest>
PRESENTON_AUTH_USERNAME=<renderer-admin-username>
PRESENTON_AUTH_PASSWORD=<independent-renderer-password>
PRESENTON_TEMPLATE=bestdecks_inline_vector_v1
```

The Node image must report exactly Node 24.18.0; the Dockerfile also activates and checks pnpm
11.7.0. `GEMINI_API_KEY` belongs only to the Bestdecks worker's brief and slide-planning stages;
Presenton must not receive it or any other model-provider secret.

Render and inspect the resolved configuration before creating anything:

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml config --quiet
```

Keep `--quiet`: rendered Compose output can contain interpolated secret values and must not be
copied into logs or release receipts.

On a fresh host, build and start without permitting Compose to replace a same-named existing
container:

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml build
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up --no-recreate -d
```

`up` creates containers, networks, and named volumes when absent. It does not prove that TLS,
provider permissions, renderer behavior, or the live reference path works. Upgrades that would
recreate existing containers require a separate state-preservation and rollback review; this guide
does not authorize replacement, pruning, or removal commands.

## 8. Verify in layers

Static checks:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Optional provider smoke commands make external requests and may incur charges. Run them only with scoped test credentials and record redacted results. A passing individual smoke command does not prove the complete reference path.

The release-grade live receipt requirements are in [release readiness](./release-readiness.md).

## 9. Data, backup, and upgrades

- Put the SQLite database and renderer data on reviewed persistent storage.
- Encrypt storage and backups according to your risk model.
- Restrict backup access separately from application access.
- Test restore into an isolated path before relying on a backup procedure.
- Record schema and application versions with each backup.
- Review migrations and container behavior before every upgrade.
- Never point test cleanup or migration experiments at live data.

The project does not yet claim a verified backup/restore, export, retention, or account-disposition workflow.

## Known gaps

- The evidence gate is implemented, but no checked-in live receipt proves it on the complete
  provider path.
- No published production hardening certification.
- No supported managed hosting or commercial contract.
- No checked-in integration proof for a separate private cloud consumer.

Treat generated artifacts as drafts requiring human review until the full reference path is
Reference-verified with a reproducible receipt.
