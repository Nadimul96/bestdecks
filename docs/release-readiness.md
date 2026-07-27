# Release readiness

Status as of 2026-07-14: **Blocked**

Source of capability truth: [`src/config/capabilities.ts`](../src/config/capabilities.ts)

This checklist is the release contract. A checked box requires a reproducible artifact, command result, or reviewed external receipt. Implementation presence alone is insufficient.

As of this review, the implementation and packaging statements describe an uncommitted local
worktree based on `2f19d61815784d379b2c277f96e45e0f21100e34`. Read-only remote inspection found
`origin/main` still at that commit without the local CI workflow, Dependabot configuration,
`SECURITY.md`, or `LICENSE`; the remote also retains the legacy public copy and credential history.
No push, deployment, history rewrite, or repository-setting change was made.

## Blocking conditions

Public release remains blocked while any of these conditions is true:

- the canonical live provider path lacks a checked-in, redacted receipt;
- credential containment, approved full-history remediation, and a fresh-clone secret scan are incomplete;
- tenant isolation or internal execution authorization is unproven;
- billing, referrals, or hosted-service promises remain public without release tests;
- any hosted-credit, checkout, Stripe-webhook, or referral route or fresh-install schema remains in
  the OSS runtime;
- a clean-room self-host install has not passed from public documentation;
- required legal, security, support, dependency, and release controls are missing.

## Product-truth gate

- [x] Canonical capability metadata distinguishes `Implemented`, `Reference-verified`, `Experimental`, and `Planned`.
- [x] Public pricing, allowances, referrals, unsupported models, enterprise promises, and outcome metrics are absent from the owned public surfaces.
- [x] Illustrative landing and archetype previews display the exact label `Sample data`.
- [x] Synthetic deck-quality generation is removed from the delivery UI.
- [x] Valid receipts expose measured evidence coverage; missing or malformed receipts are represented as unavailable, never as passing.
- [x] Fresh OSS databases create no cloud billing schema, and public credit, checkout, webhook, and referral routes are absent.
- [x] Outbound email drafting and sending are absent from the active run contract; future delivery remains planned, not implied.
- [x] The remaining primary public surfaces were scanned against the same claim policy: 105 files
  reviewed, with no active pricing, billing, email-send, unsupported-completion, or unlabeled sample
  claim remaining.
- [x] A consistency test prevents README and primary UI capability drift from `src/config/capabilities.ts`.

## Evidence and delivery gate

- [x] Extract every headline and bullet claim from the typed slide plan.
- [x] Accept a brief source claim only when its normalized text occurs verbatim in retained evidence for the same canonical URL.
- [x] Accept a slide claim as `source_backed` only when its text exactly matches a retained brief claim and every citation belongs to that claim's URL-bound source-ID set.
- [x] Classify unmatched claims as `unsupported`; never silently drop them from the denominator.
- [x] Calculate deterministic evidence coverage.
- [x] Expose required-field, CTA, evidence-gate, readability, and provider-provenance checks separately.
- [x] Block rendering and delivery while any unsupported factual claim remains.
- [x] Persist rubric version, redacted claim ledger, artifact checksum, and non-null commit SHA in every delivered readiness receipt.
- [x] Test supported, missing, ambiguous, malformed, rounding-boundary, allowed-URL paraphrase, and exact-claim/wrong-URL provenance cases.

The exact-text rule is provenance containment, not semantic fact verification. It intentionally
rejects paraphrases rather than allowing an unproven source-backed label.

## Mandatory rich-static PPTX gate

- [x] Reference-run admission requires `imagePolicy=never`, `visualDensity=rich`,
  `visualContentTypes=[]`, and PPTX output; generated or remote media requests fail closed.
- [x] Bestdecks deterministically constructs every complete native-vector `SlideModel.ui`, then
  calls Presenton's blank-create, exact-update, and PPTX-export routes. It does not invoke renderer
  content generation, rewriting, layout selection, web search, or image generation.
- [x] The renderer requires self-hosted HTTP Basic authentication, rejects Presenton Cloud and
  bearer/API-key configuration, receives no model-provider credentials, and has no provider-egress
  network in the documented local or production topology.
- [x] `pptx_ooxml_rich_static_v2` verifies exact approved text plus a closed native-vector,
  font, palette, geometry, contrast, relationship, and package allowlist. Every accepted slide has
  a full-slide vector background, a vector accent, and explicitly styled text.
- [x] Delivery requires a closed visual-profile attestation and
  `visualProfileVerified=true`; planning-only or partially attested artifacts cannot be served.
- [x] [`deploy/presenton/rich-static-v1.manifest.json`](../deploy/presenton/rich-static-v1.manifest.json)
  records qualifying Presenton source commit `882a826f274ddbd4650cdb21b3a9ff4d16276fe9`, the
  digest-pinned OCI image, Bestdecks-owned inline UI schema, theme and layout IDs, palette, font,
  and fixed media policy.
- [x] The closed visual attestation accepts only the manifest's exact identity and measured
  richness satisfying every-slide and multi-layout thresholds. The current identity is
  `b823d08063d0b57924b27a953d2fb4cf6585edf5297cd4b5560cf335db864cd4`.
- [ ] A controlled export from image
  `ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88`
  and the exact Bestdecks inline UI profile passes the exact text and visual-profile verifier and
  is retained with its receipt.
- [ ] That same pinned live export is opened in a supported presentation viewer and retained page
  renders confirm the mandatory rich-static layouts without clipping or unreadable text.

Unit fixtures establish the local request, parser, and allowlist contracts only. They do not prove
that the exact pinned Presenton runtime emits a conforming PPTX; the two live-export checks above
remain release blockers and must not be inferred from fixture success.

## Credential and repository gate

- [ ] Complete the approved history remediation and prove a fresh-clone worktree/history secret
  scan is clean. Rotate or invalidate a credential only if separate evidence establishes that a
  live authority was exposed; repository pattern presence alone is not that evidence.
- [x] Replace concrete credentials and personal deployment values in the current worktree with placeholders.
- [ ] Scan the working tree, all Git history, branches, tags, remotes, release artifacts, and known forks.
- [x] Record the scanner, ruleset/version, scope, timestamp, commit baseline, and redacted result.
- [ ] Enable automated secret scanning and reviewed dependency updates.
- [ ] Verify that examples, logs, fixtures, and receipts contain no customer or provider secrets.

## Authorization and tenancy gate

- [x] Every implemented user-facing read and write proves ownership at the repository or service boundary.
- [x] Internal execution routes fail closed when an internal secret is absent.
- [x] Session authentication never substitutes for tenant ownership.
- [x] Legacy null-owner records have an explicit migration or denial policy.
- [x] Cross-tenant identifier, share-link, export, and cancellation tests pass.
- [ ] Logs are redacted and do not reveal credentials, raw provider payloads, or personal data.

## Durable execution gate

- [x] The API atomically persists the run, targets, initial event, and queued job; it does not rely
  on an unawaited in-process promise.
- [x] One leased worker owns the canonical state machine and resumes from durable, versioned
  checkpoints.
- [x] Provider dispatch and response boundaries prevent ambiguous paid side effects from being
  replayed.
- [x] Duplicate launch, retry/resume, timeout, cooperative cancellation, permanent target failure,
  and final-attempt partial-delivery behavior have focused local regression coverage.
- [x] Kill one worker process against retained file-backed SQLite, wait from its persisted lease
  expiry, and prove a fresh process resumes the same durable crawl job without another paid start.
- [ ] Exercise duplicate launch, timeout, cancellation, and partial failure in one controlled
  deployment profile and account for every run with zero jobs stuck in an active state.

## Artifact download gate

- [x] Downloads require tenant ownership and a strict delivered artifact record whose export and verification URLs agree.
- [x] Artifact URLs pass the renderer allowlist and DNS/outbound policy before the pinned fetch.
- [x] Upstream artifact fetches are bounded to 32 MiB and 60 seconds and must match the recorded byte length, signature, and SHA-256.
- [x] The renderer-fetch reservation remains held until the verified response drains, is cancelled, errors, or reaches its deadline.
- [x] The response stream has a two-minute egress deadline and releases its reservation on every terminal path.
- [ ] Multi-instance deployment-wide fetch/rate enforcement is not implemented; current counters are process-local and require an external aggregate control.

## Provider reference-path gate

The reference sequence is Cloudflare → Perplexity → Gemini → one renderer.

- [ ] Credentials are scoped, isolated to the test environment, and excluded from receipts.
- [ ] Preflight proves required provider permissions without printing secret material.
- [ ] A successful single-target run produces a viewable artifact.
- [ ] A controlled live receipt records commit SHA, configuration names, attempt counts, timings, artifact checksum, and provider request identifiers where safe.
- [ ] Failure, timeout, retry, resume, and duplicate-trigger behavior are exercised.
- [ ] Deployment egress restricts worker provider destinations, keeps the renderer without egress,
  and gives Cloudflare's remote crawl resolution a reviewed provider-side SSRF contract or an
  equivalent compensating control.
- [ ] Ten consecutive controlled live runs pass across at least three ordinary public sites, with
  zero stuck runs and every failed attempt represented honestly in retained receipts.
- [ ] Only then is the qualifying capability marked `Reference-verified`.

## OSS packaging gate

- [x] Apache-2.0 license is present.
- [x] README, security policy, contribution guide, code of conduct, changelog, roadmap, self-hosting guide, and initial ADRs are present.
- [x] Public core and private cloud dependency direction is enforced in repository structure.
- [x] A supported CLI or documented worker entry point exists.
- [ ] Containers and toolchain versions are reproducible and reviewed.
- [ ] Continuous integration runs focused tests, typecheck, build, dependency review, and secret scanning.
- [ ] A clean environment completes the quickstart without unpublished knowledge.
- [ ] Repository metadata, issue forms, vulnerability reporting, and support ownership are configured.
- [x] Final local post-reconciliation lint, typecheck, unit, build, secret-scan, and documentation/link totals are recorded.

## Automated CI gate

The local [CI workflow definition](../.github/workflows/ci.yml) is intentionally fail-closed and uses
Node 24 from `.nvmrc` plus pnpm 11.7.0. Its three independent jobs (one pull-request-only) provide:

- a full-depth worktree and reachable-Git-blob secret scan that reports only rule IDs and
  locations, never matched values;
- a frozen-lockfile install followed by the repository's explicit lint contract, typecheck, unit
  tests, and production build;
- a pull-request dependency review that rejects newly introduced dependencies with known
  vulnerabilities rated moderate or higher;
- read-only GitHub token permissions, immutable GitHub Action commit pins, and checkout cleanup
  disabled;
- no deployment, publication, auto-merge, credential use, or live-provider call.

[`scripts/check-secrets.mjs`](../scripts/check-secrets.mjs) fails closed on unreadable symlinks,
files or blobs larger than its documented scan limit, malformed Git object output, and configured
credential patterns. Run its in-memory boundary cases and both scan scopes with:

```bash
node scripts/check-secrets.mjs --self-test
node scripts/check-secrets.mjs --worktree --history
```

Status as of 2026-07-13: the scanner self-test and current-worktree scan pass locally. The complete
history scan fails, as required, on redacted historical credential-pattern findings and generated
artifacts. The repository scan does not establish that any live credential authority was
compromised. Public release remains blocked until history is remediated through the approved
process and the same full scan passes from a fresh clone. Credential rotation or session
invalidation becomes mandatory only if independent evidence establishes live-authority exposure.

The quality job also refuses to proceed unless `package.json` defines a non-empty `lint` script;
the repository now supplies that contract. A passing hosted workflow run has not yet been observed
and must be attached to the release receipt.

[Dependabot](../.github/dependabot.yml) is configured to check the pnpm dependency graph and pinned
GitHub Actions weekly once this work lands and the repository enables it. Small open-pull-request
limits, disabled automatic rebasing, and no auto-merge keep updates behind the same CI and review
gates. No hosted Dependabot run has been observed.

## Local verification evidence

The following 2026-07-13 local results describe the earlier uncommitted worktree based on
`2f19d61815784d379b2c277f96e45e0f21100e34`. They predate the deterministic render-only path and
are historical implementation evidence, not a current release receipt:

- the pinned Node `24.18.0` and pnpm `11.7.0` toolchain passed lint and a non-incremental
  TypeScript check;
- the complete unit suite passed `478/478`, including a real two-process lease-expiry and
  same-job recovery regression against retained file-backed SQLite;
- both example validation commands passed, and importing the public entry point exposed 69 exports
  without an import failure;
- the production build passed, the standalone boundary verifier passed, and the compiled server
  passed 11 runtime checks covering liveness, auth boundaries, two independent CSP nonces,
  script-CSP and framing policy, a runtime origin different from the build origin, and rejection of
  a cross-origin mutation;
- `git diff --check` passed with no unmerged paths;
- both full and production dependency audits reported no known vulnerabilities;
- the scanner's 8-case self-test passed and 292 current worktree files had zero findings; its
  reachable-history scan correctly failed with 43 redacted configured-pattern findings across 656
  blobs, so history remediation remains a release blocker;
- the documentation audit found 25 active Markdown files, 39 links (38 local and one external),
  zero broken links, 105 primary public-surface files, 12 capability rows in exact README parity,
  and 20/20 existing evidence paths;
- production Compose configuration validation passed with synthetic digest-shaped image
  references and placeholder-only environment values. No image build or digest provenance was
  asserted.

A frozen-lockfile install also passed earlier in this work session against the current unchanged
lockfile. That does not substitute for the unchecked fresh-clone and clean-host gate.

Local checks cannot prove credential containment, remediated public history, repository-host security
controls, a fresh-clone/clean-host install, a live provider run, paid-cloud behavior, or a published
release. Those items remain independently unchecked.

## Current caveats

- Exact URL-bound evidence uses normalized verbatim containment. It rejects legitimate paraphrases
  and does not independently establish truth or semantic entailment.
- Artifact download concurrency/rate state is process-local, and verified artifacts are buffered in
  memory up to 32 MiB before client egress.
- The mandatory `rich_static_v1` profile is visually rich through deterministic native-vector
  backgrounds, accents, layout variation, typography, and palette—not generated media. Its strict
  structural, text, and visual attestation is locally fixture-backed, but a live artifact from the
  exact manifest-pinned Presenton image and Bestdecks inline UI profile has not yet satisfied the
  profile.
- Public-target DNS preflight cannot pin its result into Cloudflare Browser Rendering's remote
  resolution. Provider-side SSRF behavior and deployed egress controls remain unverified.
- Nondestructive upgrades may retain inert legacy billing tables or columns; only fresh OSS schema
  absence and runtime isolation are asserted.
- Outbound email drafting and sending are not implemented. Recipient handling, human approval,
  suppression, reputation, audit, and provider selection remain future work.
- The final local verification totals above are not hosted-CI or clean-room evidence, and no current
  live provider receipt exists.

## Hosted-service gate

This gate belongs to a future private `bestdecks-cloud` release. It is not an instruction to add
billing, referrals, or managed-credit code back to the OSS repository.

- [ ] Billing charges a defined delivered unit rather than an attempted run.
- [ ] Credit reservation, capture, cancellation, and refund transitions are atomic and idempotent.
- [ ] Stripe webhook events and referrals have replay ledgers.
- [ ] Upgrade, downgrade, failed-payment, cancellation, and duplicate-event tests pass.
- [ ] Cross-user and cross-workspace isolation tests cover every object, job, artifact, credit,
  schedule, team, and analytics boundary.
- [ ] Signup, referral attribution, allowance reset, overage, and cancellation behavior have one
  canonical contract with replay-safe tests.
- [ ] Encryption, key rotation, export, deletion disposition, backup/restore, privacy, abuse, and crawl-policy tests pass.
- [ ] Terms, privacy notice, provider disclosures, support contact, and incident ownership are
  published and reviewed for the hosted service.
- [ ] At least 30 completed runs establish p50 and p95 provider cost per delivered deck, stage
  latency, failure rate, and refund rate.
- [ ] No hosted allowance or price is published before that evidence exists.

## Release receipt

When all gates pass, create a release receipt containing:

- release version and commit SHA;
- exact commands and results;
- clean-room environment description;
- dependency and image locks;
- secret-scan metadata and redacted result;
- controlled live-run receipt identifiers;
- artifact checksums;
- known limitations and rollback procedure;
- reviewer and approval record.

Until that receipt exists, the correct status is **Blocked**, not “ready with caveats.”
