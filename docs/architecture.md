# Bestdecks architecture

Status as of 2026-07-14: implementation contract; live provider path not reference-verified.

The canonical public capability inventory is
[`src/config/capabilities.ts`](../src/config/capabilities.ts). An implemented adapter means code
exists; it does not establish provider access, production reliability, or a successful live run.

## Product boundary

Bestdecks OSS is an Apache-2.0, self-hosted, bring-your-own-key application. The public core owns
the full implemented path from seller and target intake through research, planning, evidence
evaluation, rendering, and artifact persistence. It does not require a Bestdecks subscription,
hosted entitlement, or bundled provider allowance.

A future private `bestdecks-cloud` service may consume the public core and operate managed hosting,
queues, upgrades, monitoring, storage, backups, scheduling, teams, analytics, billing, and managed
provider credits. Cloud code may depend on a released core contract; the public core must not
depend on private cloud modules. See
[`ADR 0001`](./adr/0001-oss-core-cloud-boundary.md).

## Runtime components

| Component | Responsibility | Primary source |
| --- | --- | --- |
| Next.js application | Authenticated workspace and HTTP API | `app/`, `components/` |
| Domain contracts | Intake, seller context, run settings, and evidence validation | `src/domain/` |
| Repository | Tenant-scoped persistence and idempotent artifact/event writes | `src/server/repository.ts` |
| Durable queue | Leases, attempts, transitions, checkpoints, cancellation, and recovery | `src/server/run-queue.ts` |
| Worker | Separately claims leased runs and records terminal evidence | `src/bin/run-worker.ts`, `src/server/run-executor.ts` |
| Provider adapters | Cloudflare crawl, Perplexity research, Gemini planning, Presenton rendering | `src/integrations/`, `src/server/ai-brief-builder.ts`, `src/server/slide-planner.ts` |
| Database | SQLite locally or libSQL/Turso when configured | `src/server/db.ts` |
| Authentication | Better Auth sessions and user ownership | `src/server/auth.ts` |

The supported baseline is Node.js 24.18.0 and pnpm 11.7.0. Dependency constraints and supply-chain
policy live in `package.json`, `.nvmrc`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`.

The web process only persists and exposes run state. It does not execute provider stages inline.
`node --import tsx src/bin/run-worker.ts` is a separate long-running process; without it, queued
runs remain queued.

## Reference run path

```text
authenticated intake
  -> atomically persist run, targets, event, and queued job
  -> worker claims a bounded lease
  -> Cloudflare Browser Rendering crawl
  -> Perplexity enrichment
  -> Gemini brief construction
  -> Gemini slide plan with claim provenance
  -> deterministic evidence evaluation
  -> deterministic Bestdecks-owned rich-static SlideModel.ui composition
  -> Presenton create -> exact UI update -> PPTX export for eligible targets
  -> exact text and visual-profile artifact verification
  -> persist artifacts, checkpoints, receipt, and terminal state
```

The canonical provider sequence is Cloudflare → Perplexity → Gemini → Presenton. Alai, Plus AI,
and Deepcrawl adapters are outside the durable reference path and are never automatic fallbacks.
The run API rejects the legacy crawl-exception flag; a failed Cloudflare crawl blocks that target
instead of silently changing which provider receives its URL.

No live reference receipt is checked in yet. Until one exists, the sequence above is an implemented
path to verify, not proof that third-party credentials, permissions, models, or artifact delivery
work in a production environment.

## Durable run lifecycle

The queue state machine uses these persisted states:

```text
queued -> crawling -> enriching -> brief_ready -> planning -> rendering
                                                         -> delivered
                                                         -> partially_completed
                                                         -> failed
any active state ----------------------------------------> cancelled
```

Workers mutate a run only while holding its lease. Compare-and-set transitions reject stale
attempts. Stage checkpoints, deterministic idempotency keys, bounded attempts, heartbeats, and
retry timestamps make interruption and replay visible. The queue and user-facing run state are
updated together at the persistence boundary.

## Evidence and delivery

`src/domain/evidence.ts` parses a claim ledger into four explicit support labels:
`source_backed`, `seller_supplied`, `model_inference`, and `unsupported`. Evidence coverage is the
measured fraction of external factual claims backed by retained sources. It is not a subjective
deck quality score.

The source boundary is exact and URL-specific. `src/server/ai-brief-builder.ts` accepts a brief
claim with `basis: source` only when the normalized claim text occurs verbatim in the retained
evidence corpus for that claim's canonical URL. It persists the accepted text/URL pair in
`CompanyBrief.sourceClaims`. `src/server/slide-planner.ts` derives stable source IDs from canonical
URLs and accepts `source_backed` only when the rendered claim text exactly matches a retained
source claim and every cited ID is in that claim's URL-bound set. An arbitrary retained URL cannot
support unrelated text, and an exact claim cited to the wrong retained URL fails closed.

This contract establishes deterministic provenance containment. It does not independently verify
that retained source text is true, interpret whether the source semantically entails a broader
claim, or admit paraphrases. Those limitations are deliberate until a reviewed semantic-evidence
contract exists.

Malformed ledgers and dangling citations fail closed. Unsupported factual claims block automated
delivery for the affected target. Seller statements and model inferences remain visibly distinct
from externally sourced facts. The implemented contract and remaining live release proof are
tracked in [`ADR 0003`](./adr/0003-evidence-coverage-delivery-gate.md) and
[`release-readiness.md`](./release-readiness.md).

## Artifact download boundary

The authenticated download route does not proxy an arbitrary stored URL. It requires tenant
ownership plus a strictly parsed `presentation_delivery` artifact whose outcome is `delivered`,
whose readiness fields—including `visualProfileVerified`—are all true, and whose export and
verification URLs agree. It then applies the renderer allowlist, DNS/outbound policy, response
length, file signature, and recorded SHA-256. The upstream fetch is limited to 32 MiB and 60
seconds.

Renderer-fetch capacity is reserved per user and globally within each application process. Once
the bounded remote body is fully buffered and verified, the same reservation remains held while
the browser drains its response stream. The stream releases it on completion, cancellation,
error, or its two-minute egress deadline, so a slow client cannot evade the concurrency bound.

The implementation intentionally distinguishes upstream fetch pressure from downstream client
speed, but the current counters and rate window are process-local and the accepted artifact is
fully buffered in memory. A multi-process or multi-host deployment needs shared aggregate limits
at the proxy/service boundary and memory sizing for its maximum concurrent verified buffers.

## Production container topology

```text
internet -> Caddy -> app -------------------> shared SQLite volume
                       |                              ^
                       | internal health/readiness   |
                       v                              |
                    Presenton <--- internal --- worker
                    (no egress)                    |
                                                    v
                                          provider-only egress
                                    (Cloudflare, Perplexity, Gemini)
```

`deploy/app/Dockerfile` has distinct `runner` and `worker` targets. `runner` contains the minimal
Next.js standalone output. `worker` contains the locked dependency tree, `src/`, `tsconfig.json`,
and the `tsx` loader needed to execute the TypeScript entry point. The Compose deployment runs both
as numeric UID/GID `10001`, with root-owned code and a read-only root filesystem. They share only
the persistent `/app/.data` mount plus isolated writable home, temporary, and app runtime-cache
mounts.

The `backend` network is internal and connects app, worker, and Presenton. Only the worker joins the
separate provider-egress network used for Cloudflare, Perplexity, and Gemini; Presenton has no
provider-egress network and receives no provider credential. Neither worker nor Presenton publishes
a port, and neither joins the Caddy-facing frontend network. The SQLite volume assumes app and worker run on the same host.
Moving workers to another host requires a reviewed shared database contract, not a shared SQLite
file over an arbitrary network filesystem.

The v0.1 renderer identity is recorded in
[`deploy/presenton/rich-static-v1.manifest.json`](../deploy/presenton/rich-static-v1.manifest.json).
The manifest binds Presenton source commit
`882a826f274ddbd4650cdb21b3a9ff4d16276fe9`, OCI image
`ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88`,
and the exact Bestdecks-owned inline UI schema, deterministic layout identifiers, palette, font,
and no-media policy. The profile is `bestdecks_inline_vector_v1` / `bestdecks_green_v1`, uses Arial,
and identifies its content-free UI schema with SHA-256
`3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f`. Operators must deploy
those exact manifest values for a qualifying reference run; merely using another digest-shaped
Presenton image does not establish profile compatibility.

## Persistence and tenancy

Core data includes:

- user-owned workspace and seller settings;
- encrypted, user-owned integration settings;
- runs and targets;
- durable jobs, attempts, transitions, and checkpoints;
- artifacts, events, evidence ledgers, receipts, and delivery records.

Every user-facing read and write must prove ownership. A missing owner is not a wildcard. Fresh OSS
databases create no `user_credits` table, hosted-credit columns, Stripe schema, or referral schema,
and the public application exposes no credit, checkout, webhook, or referral routes. Upgraded
databases may retain legacy cloud-only tables or columns because migration is nondestructive; the
current OSS runtime does not read them as entitlement or billing state.

Application migrations and Better Auth schema introspection/DDL share the persisted, leased
`_migration_lock`. Authentication startup first completes the application schema, then reacquires
that same cross-process lease for Better Auth; process-local promises only coalesce callers within
one web or worker process. File-backed SQLite is placed in persistent WAL mode and each migration
connection uses a bounded busy timeout so read-only lease observation cannot starve the active
schema writer; remote libSQL retains its provider-managed journal behavior.

## Security invariants

- Credentials are supplied through environment configuration or encrypted user-owned settings;
  they never belong in source, logs, receipts, URLs, or client payloads.
- Provider URLs are validated against the outbound URL policy; private and reserved destinations
  are denied unless an explicitly supported self-hosted boundary permits them.
- API errors and logs expose stable categories, not raw provider bodies or secrets.
- Artifact fetches use an allowlist, DNS pinning/outbound policy, tenant ownership checks, bounded
  size and time, exact checksum verification, and a separate client-egress deadline.
- Authentication, authorization, worker leases, and idempotency are separate controls; one never
  substitutes for another.
- Outbound email drafting and sending are retired from the active run contract. No recipient-email
  field, draft artifact, send job, or email-provider integration is part of OSS execution.
- The mandatory `rich_static_v1` PPTX profile admits only `imagePolicy=never`,
  `visualDensity=rich`, and `visualContentTypes=[]`. This excludes requested generated or remote
  media; it does not permit a visually sparse fallback.
- Bestdecks owns the complete deterministic native-vector `SlideModel.ui` for every slide. It calls
  Presenton only to create a blank shell, apply those exact slides, and export PPTX; no renderer
  content generation, rewriting, layout selection, web search, or image generation is invoked.
- The renderer is self-hosted and Basic-authenticated. Presenton Cloud and bearer/API-key
  configuration fail closed. Presenton receives no provider credential and has no egress network.
- `pptx_ooxml_rich_static_v2` is a closed allowlist for exact approved DrawingML text,
  native-vector backgrounds and accents, explicit high-contrast typography, the pinned
  manifest font, and the manifest palette. Unknown package parts, external
  relationships, pictures, media, charts, OLE objects, and animation fail closed.
- The delivery receipt must contain the verifier's closed visual-profile attestation and set
  `visualProfileVerified=true`; planning-stage receipts deliberately keep it false.
- Custom tone/style text is treated as untrusted style data and carried to the appropriate
  provider boundary; generated media is not an implemented capability.
- Managed-cloud billing is outside the OSS execution surface and belongs in a separate private
  cloud service if it is ever implemented.

## Current caveats

- Exact URL-bound text matching favors false-negative abstention: source-backed paraphrases are not
  supported, and the check is not semantic fact verification.
- Artifact fetch/rate counters are process-local, and successful upstream responses are buffered
  in memory up to the shared 32 MiB artifact ceiling before egress.
- Target admission rejects locally resolved private addresses, but Cloudflare Browser Rendering
  later resolves and fetches the original hostname remotely. The application cannot bind its DNS
  result to that remote fetch; a reviewed provider-side SSRF guarantee and deployment egress
  controls remain required before this boundary is called proven.
- Nondestructive upgrades can retain inert legacy billing state even though fresh OSS databases do
  not create it.
- Email drafting/delivery has no active implementation; direct sending and external outbound tools
  remain future design work.
- Credential containment, approved history remediation, hosted repository controls, a clean-room
  install, and the live reference receipt remain unverified release blockers.
- Deterministic verifier fixtures establish local parser and allowlist behavior only. A controlled
  export from the exact manifest-pinned Presenton image and Bestdecks inline UI profile has not yet
  passed the verifier, so live renderer compatibility and visual fidelity are not Reference-verified.
- Final post-reconciliation verification totals are pending; no earlier local tally is current
  release evidence.

## Verification boundary

Repository tests can prove schemas, state transitions, tenant isolation, idempotency, failure
handling, deterministic slide-UI composition, and the local PPTX allowlist. They cannot prove that the
pinned Presenton runtime emits an accepted deck, or prove live provider permissions, cost,
latency, artifact quality, or hosted reliability. Those claims require a redacted, reproducible
run receipt containing the commit, manifest identity, configuration names, provider identifiers,
attempts, timings, artifact checksum, visual-profile verification, and exact reproduction steps.
