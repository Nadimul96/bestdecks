# Bestdecks project context

Last reconciled: 2026-07-13

Bestdecks is an Apache-2.0, self-hosted, bring-your-own-key pipeline that turns seller context and target URLs into retained research, a typed evidence ledger, a slide plan, and a bounded presentation-artifact contract.

## Source of truth

- Public capability status: `src/config/capabilities.ts`
- Runtime architecture: `docs/architecture.md`
- Release blockers and proof: `docs/release-readiness.md`
- Security reporting and expectations: `SECURITY.md`
- Product/technical handoff: the private 2026-07-13 cold-start implementation brief; this repository contains the durable public contract derived from it.

Do not infer live reliability from implemented code. No checked-in live Cloudflare → Perplexity → Gemini → Presenton receipt exists yet.

This context describes an uncommitted local worktree based on
`2f19d61815784d379b2c277f96e45e0f21100e34`. Read-only remote inspection found `origin/main` still
at that commit without the local CI workflow, Dependabot configuration, `SECURITY.md`, or `LICENSE`.
The remote retains the legacy public copy and credential history; no remote mutation was made.

## Canonical runtime

```text
authenticated API
  -> atomic run + target + event + queued-job persistence
  -> leased worker
  -> Cloudflare crawl
  -> Perplexity cited enrichment
  -> Gemini brief with exact retained text bound to its canonical source URL
  -> Gemini typed slide plan + exact-claim evidence ledger
  -> unsupported-claim delivery gate
  -> Presenton render + bounded artifact verification
  -> atomic run receipt + terminal state
```

States: `queued → crawling → enriching → brief_ready → planning → rendering`, followed by `delivered`, `partially_completed`, `failed`, or `cancelled`.

Deepcrawl, Gemini image generation, Alai, and Plus AI remain experimental adapters. They are
disabled or outside the durable reference path and are not automatic fallbacks.
Outbound email drafting and sending, hosted billing, managed provider credits, and enterprise
operations are outside the OSS runtime. Fresh OSS installs create no cloud billing schema and
expose no credit, checkout, webhook, or referral route. Upgrades preserve any legacy cloud-only
tables or columns nondestructively, but current execution does not consume them.

## Toolchain and commands

- Node.js: `24.18.0` (`.nvmrc`; package engine accepts supported Node 24 releases)
- pnpm: `11.7.0`

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm worker
```

The web process and worker process must run together against the same persistent database. Live smoke commands make external requests and may incur provider charges; they are opt-in only.

## Invariants

- Every run and provider setting has an explicit owner; null ownership fails closed.
- Provider credentials stay in environment configuration or encrypted tenant-owned settings.
- Logs, errors, and receipts contain stable categories, never raw provider payloads or secret values.
- Source URLs reject embedded credentials and shed query parameters and fragments before durable
  checkpoints or cross-provider forwarding.
- A brief claim is source-derived only when its normalized text occurs verbatim in retained evidence
  for the same canonical URL. A slide claim is `source_backed` only when its text exactly matches
  that retained claim and every citation belongs to the claim's URL-bound source-ID set. An allowed
  URL alone is not support; unsupported facts block rendering.
- Every paid provider call records a durable dispatch before the request and a durable response before downstream work. A dispatch with no recorded response fails as indeterminate instead of being reissued.
- The public core has no entitlement, Stripe, referral, managed-credit, email-drafting, or email-send dependency.
- Artifact downloads verify owner, a strict delivered artifact record, allowed URL, byte length,
  file signature, and SHA-256. The 32 MiB/60-second upstream fetch reservation remains held through
  browser egress and is released on drain, cancellation, error, or the independent two-minute
  response deadline.
- The locally enforced v0.1 presentation profile is text-only. Visual-style direction is retained,
  but generated media is rejected until the artifact contract can attest it. A live Presenton
  artifact has not yet made this path Reference-verified.
- Files and state are never permanently deleted; superseded material goes to the dated deletion-review archive with a manifest.

## Current caveats

- Exact retained-text matching is intentionally high precision. It rejects legitimate paraphrases
  and proves provenance containment, not the truth or semantic entailment of a statement.
- Artifact fetch concurrency and rate counters are in-process only. Accepted artifacts are fully
  buffered in memory; multi-instance deployments need external aggregate controls.
- Public-target DNS screening cannot bind Cloudflare Browser Rendering's later remote resolution;
  provider-side SSRF behavior and deployment egress policy remain external proof obligations.
- Legacy upgraded databases can still contain inert cloud-only columns or tables because migration
  is nondestructive. Fresh databases do not create them.
- There is no recipient-email field, outbound draft, send job, or email-provider integration in the
  active run contract.
- Final local reconciliation passed lint, non-incremental typecheck, 478/478 unit tests, example
  validation/planning, production build, standalone-boundary verification, runtime security smoke,
  dependency audits, worktree secret scanning, and documentation/link checks. These results apply
  only to the uncommitted worktree and are not a release receipt.

## Current release blockers

- Rotate the credential exposed in public history and invalidate related sessions.
- Review the preserved exact Git bundle, obtain explicit approval, then remediate public history and verify a fresh clone.
- Enable/verify GitHub branch protection, secret scanning/push protection, dependency alerts, and private vulnerability reporting.
- Exercise duplicate launch, cancellation, timeout, and partial failure together in one controlled
  deployment profile and account for every run with zero stuck jobs. The separate-process local
  kill/restart/lease-expiry/resume regression now passes against retained file-backed SQLite.
- Complete ten consecutive controlled live reference runs across at least three ordinary public
  sites, retain redacted receipts, and account honestly for every failure with zero stuck runs.
  Thirty completed runs are required before pricing evidence.
- Verify the hosted CI workflow and a clean self-host deployment from a published commit.
- Repeat the recorded local verification from a fresh clone after approved history remediation and
  retain the hosted-CI and clean-host evidence.

Do not deploy, push, rewrite history, rotate credentials, or publish a release without explicit authority for that external action.
