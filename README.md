# Bestdecks

**Turn your point of view and a target-company list into research-grounded, shareable PPTX proposals.**

Bestdecks is an Apache-2.0, self-hosted, bring-your-own-key proposal engine for agencies,
consultants, and sales teams who want stronger first meetings without hand-building every deck.
It researches each target, turns your seller context into a tailored narrative, and only delivers
factual slide copy when that copy is tied to retained source evidence.

## Why Bestdecks

- **Personalized at scale:** submit pasted URLs, CSV, or TSV; use your offer, differentiators,
  ICP, and desired outcome as the proposal brief.
- **Evidence before polish:** every source-backed factual claim must exactly match retained
  evidence from its canonical source; unsupported factual claims block delivery.
- **You own the stack:** run it with your own SQLite database, provider accounts, and a
  self-hosted renderer. There is no Bestdecks-hosted account, credit balance, billing, or email
  sending surface.
- **Designed for a practical handoff:** download verified PPTX artifacts or create scoped,
  read-only share links after delivery.

Bestdecks is intentionally opinionated: the v0.1 renderer makes rich native-vector PPTX decks and
does not use generated or remote media. That keeps the output predictable, portable, and easier
to verify.

## Release status

**Public source release; pre-production.** The durable worker, deterministic claim-level evidence
evaluation, and unsupported-factual-claim delivery gate are implemented and covered by automated
tests. The canonical Cloudflare → Perplexity → Gemini → Presenton path does not yet have a
checked-in live receipt, so it is not Reference-verified and no production reliability claim is
made. Treat generated artifacts as drafts and review them before sending or presenting.

See [release readiness](./docs/release-readiness.md) for the complete gate.

## Start here

You will need Node.js 24.18.0, pnpm 11.7.0, a writable SQLite path, your own Cloudflare,
Perplexity, and Gemini credentials, plus a self-hosted Presenton instance. The app deliberately
does not silently substitute demo data or shared provider keys.

```bash
git clone https://github.com/Nadimul96/bestdecks.git
cd bestdecks
cp -n .env.example .env.local
pnpm install --frozen-lockfile
```

Set the required values in `.env.local`: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`APP_SECRETS_KEY`, `LOCAL_DB_PATH`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
`PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, and the Presenton variables. For a controlled local first
account, temporarily set `SEED_ADMIN_ON_STARTUP=1` with `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique
`ADMIN_PASSWORD`; disable it and remove the password after that account exists.

Start the renderer, app, and worker in three terminals:

```bash
export PRESENTON_IMAGE='ghcr.io/presenton/presenton@sha256:<verified-digest>'
export PRESENTON_AUTH_USERNAME='<renderer-user>'
read -rs PRESENTON_AUTH_PASSWORD && export PRESENTON_AUTH_PASSWORD
pnpm presenton:start
```

The renderer helper intentionally does not source `.env.local`; environment files are executable
shell input when sourced. Keep its variables in this terminal only and replace the image placeholder
with a verified immutable digest from the [self-hosting guide](./docs/self-hosting.md).

```bash
pnpm dev
```

```bash
BESTDECKS_COMMIT_SHA="$(git rev-parse --short=12 HEAD)" pnpm worker
```

Open `http://localhost:3000`, sign in with the bootstrap account, complete the seller-context
setup, add target websites, and launch a run. See [self-hosting](./docs/self-hosting.md) for the
production topology, renderer image pinning, secret rotation, and deployment checks.

## Capability status contract

- **Implemented:** a code path exists and is statically inspectable in this repository.
- **Reference-verified:** a controlled live run passed and has a reproducible receipt. There are currently no capabilities in this state.
- **Experimental:** code exists, but the surface is disabled, incomplete, or lacks the proof required for the implemented reference path.
- **Planned:** the capability is not available.

The canonical machine-readable inventory is [`src/config/capabilities.ts`](./src/config/capabilities.ts).

| Capability | Status | Boundary | Source evidence |
| --- | --- | --- | --- |
| CSV, TSV, and pasted-URL intake | Implemented | OSS core | `src/domain/intake.ts`, `src/domain/schemas.ts` |
| Seller context and eight named deck archetypes | Implemented | OSS core | `src/domain/schemas.ts`, `src/domain/pipeline.ts` |
| Cloudflare Browser Rendering crawl adapter | Implemented | Provider adapter | `src/integrations/cloudflare.ts`, `src/server/run-executor.ts` |
| Deepcrawl crawl adapter | Experimental | Provider adapter | `src/integrations/deepcrawl.ts` |
| Perplexity enrichment adapter | Implemented | Provider adapter | `src/integrations/perplexity.ts`, `src/server/run-executor.ts` |
| Gemini brief and slide planning | Implemented | Provider adapter | `src/server/ai-brief-builder.ts`, `src/server/slide-planner.ts` |
| Gemini image-generation adapter | Experimental | Provider adapter | `src/integrations/gemini.ts` |
| Presenton deterministic rich-static PPTX rendering | Implemented | Provider adapter | `src/integrations/presenton.ts`, `src/server/run-executor.ts` |
| Alai renderer adapter | Experimental | Provider adapter | `src/integrations/alai.ts` |
| Plus AI / Google Slides renderer adapter | Experimental | Provider adapter | `src/integrations/plusai.ts` |
| Claim-level evidence coverage and delivery gate | Implemented | OSS core | `src/domain/evidence.ts`, `src/domain/run-receipt.ts`, `src/server/run-executor.ts` |
| Outbound email delivery | Planned | OSS core | `ROADMAP.md` |

### Evidence meaning

The brief builder accepts a target fact as source-derived only when its normalized text occurs
verbatim in retained evidence for the same canonical source URL. The slide planner may then label
text `source_backed` only when it exactly matches one of those retained claims and cites only the
source IDs derived from that claim's URL or URLs. Merely naming any allowed URL is insufficient.

This is a deterministic provenance and containment rule, not independent fact-checking or semantic
entailment. Legitimate paraphrases fail closed and require a new reviewed contract rather than a
weaker citation label.

## Architecture boundary

The public core owns target intake, seller context, research orchestration, brief and slide planning, renderer adapters, and artifact persistence. It is intended to remain complete and usable without a Bestdecks-hosted account.

A future private `bestdecks-cloud` service may consume the public core and operate managed hosting, queues, monitoring, storage, teams, scheduling, analytics, billing, and managed provider credits. Hosted pricing and allowances are intentionally unpublished until measured completed-run costs exist.

Fresh OSS databases create no hosted-credit table or Stripe/referral schema, and the corresponding
credit, checkout, webhook, and referral routes are absent. Nondestructive upgrades may retain
legacy cloud-only tables or columns for operator review; retained data is inert and does not create
a hosted entitlement, billing surface, or support promise.

Outbound email drafting and sending are also absent from the current run contract: the worker does
not create email copy, recipient jobs, or sends. A future email surface is planned only after an
approval, suppression, audit, tenancy, and idempotency contract exists.

## Configuration reference

Prerequisites:

- Node.js 24.18.0
- pnpm 11.7.0
- a writable local path for SQLite
- provider accounts and keys for the adapters you choose to run
- a reachable Presenton service for the documented renderer path

Create a local environment file without overwriting an existing one:

```bash
cp -n .env.example .env.local
```

Fill `.env.local` with independent secrets and your own provider credentials. Never commit that file. At minimum, review:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `APP_SECRETS_KEY`
- `LOCAL_DB_PATH`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PERPLEXITY_API_KEY`
- `GEMINI_API_KEY`
- `PRESENTON_BASE_URL`
- `PRESENTON_AUTH_USERNAME` and `PRESENTON_AUTH_PASSWORD` for self-hosted Presenton
- `ALLOW_SHARED_PROVIDER_CREDENTIALS=1` only when this is an intentional single-tenant self-host using the process-level provider keys above

Install and inspect configuration:

```bash
pnpm install --frozen-lockfile
pnpm doctor
```

For controlled `APP_SECRETS_KEY` rotation, including the required previous-key overlap and
transactional rewrap command, follow [the self-hosting rotation runbook](docs/self-hosting.md#rotate-stored-integration-secret-encryption-safely).

`pnpm doctor` performs constructor-only configuration validation for the reference and retained
experimental adapters. It does not contact providers, validate permissions, or prove security;
offline `reachable` and `liveSmokePassed` values remain `null`.

Start the application and durable worker in separate terminals:

```bash
pnpm dev
```

```bash
pnpm worker
```

Then open `http://localhost:3000`.

The application process accepts and queues runs; it does not execute provider work inline. Without
the worker, runs remain queued. `pnpm worker:once` claims at most one available job and is useful for
controlled validation. Set `BESTDECKS_COMMIT_SHA` to the exact 7–64 character hexadecimal source
commit before starting the worker; a missing value fails before any paid provider request.

The Presenton helper requires a digest-pinned image, binds only to loopback on a dedicated internal
Docker network, and refuses to replace an existing container or network whose isolation,
authentication, image, mount, port, or hardening policy differs. See
[self-hosting](./docs/self-hosting.md) for local and production deployment instructions.

Tenant-saved Presenton overrides require a complete credential set and a credential-free, public
HTTPS endpoint. Configure local or private Presenton services through the operator-managed
environment boundary; runtime DNS validation remains the final outbound-network check.

Authenticated artifact downloads re-fetch only the export URL in the owner-bound, strictly parsed
`presentation_delivery` record, enforce tenant ownership and outbound URL policy, and compare the
response length, signature, and SHA-256 before serving it. The upstream fetch is capped at 32 MiB
and 60 seconds.

Per-process fetch reservations remain held while the verified in-memory artifact drains to the
client. They are released on completion, cancellation, stream error, or the two-minute egress
deadline, so a stalled client remains bounded and cannot release scarce capacity prematurely.

The current limiter and rate window are process-local, not deployment-wide, and each accepted
artifact is fully buffered in memory before delivery. Multi-instance operators still need an
external aggregate concurrency/egress control and memory sizing appropriate for the configured
process count.

The mandatory v0.1 PPTX profile is `rich_static_v1`. Run admission requires
`imagePolicy=never`, `visualDensity=rich`, and `visualContentTypes=[]`, so the renderer requests no
generated or remote media. Bestdecks deterministically builds each slide's complete native-vector
`SlideModel.ui`, creates a blank presentation shell, replaces it with those exact slides, and asks
Presenton only to export PPTX. The adapter does not call Presenton's content-generation or layout-
selection endpoint.

The supported renderer boundary is self-hosted HTTP Basic authentication. Bestdecks rejects
Presenton Cloud and bearer/API-key configuration, supplies no model credential to Presenton, and
places the production renderer only on the internal backend network with no provider-egress
network. The pinned upstream image still requires an `LLM` selector at startup; that compatibility
value is not a model credential, and the render-only request path never invokes it.

Delivery then applies the `pptx_ooxml_rich_static_v2` allowlist: exact approved DrawingML text,
closed-set native-vector geometry, an allowlisted background and vector accent on every slide,
explicit high-contrast typography, and only the pinned font and color palette. The readiness
receipt must set `visualProfileVerified=true`; pictures, media, charts, OLE objects, animation,
external relationships, and unknown package parts fail closed.

[`deploy/presenton/rich-static-v1.manifest.json`](./deploy/presenton/rich-static-v1.manifest.json)
is the canonical renderer manifest. It binds Presenton source commit
`882a826f274ddbd4650cdb21b3a9ff4d16276fe9`, image
`ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88`,
and the exact Bestdecks-owned inline UI schema, layout IDs, palette, font, and no-media policy.
The profile uses template `bestdecks_inline_vector_v1`, theme `bestdecks_green_v1`, four
Bestdecks-owned layout IDs, and Arial. Its content-free UI schema SHA-256 is
`3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f`; the closed
visual-attestation identity is
`b823d08063d0b57924b27a953d2fb4cf6585edf5297cd4b5560cf335db864cd4`.

Focused fixtures can prove the local request and verifier contracts; they do not prove that a
live export from that exact pinned Presenton image and inline UI profile conforms. A controlled live export
must pass the same verifier and be retained in a reference-run receipt before renderer
compatibility or visual fidelity is called Reference-verified.

## Verification

Static checks:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Provider smoke commands exist for the reference adapters and the experimental Plus AI adapter.
`pnpm smoke:providers:reference` checks Cloudflare, Perplexity, Gemini brief/planning, and Presenton
independently. These commands make external requests, may incur provider charges, and are not a
substitute for the versioned, durable-worker reference-run receipt required by
[release readiness](./docs/release-readiness.md). Alai has no checked-in smoke command or live
receipt.

An earlier 2026-07-13 local reconciliation passed lint, non-incremental typecheck, 478/478 unit
tests, example validation/planning, production build, standalone-boundary and runtime-security
checks, dependency audits, the then-current worktree secret scan, and documentation/link
validation. Those results predate the deterministic render-only path and are historical evidence,
not the final verification tally. Hosted CI, a fresh clone, a clean host, remediated history, and
live-provider receipts remain open. See [release readiness](./docs/release-readiness.md); local
results are not a release receipt.

## Documentation

- [Self-hosting](./docs/self-hosting.md)
- [Release readiness](./docs/release-readiness.md)
- [Architecture](./docs/architecture.md)
- [Architecture decisions](./docs/adr/README.md)
- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)

## License

Apache License 2.0. See [LICENSE](./LICENSE).
