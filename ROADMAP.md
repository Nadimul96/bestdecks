# Bestdecks roadmap

This roadmap records intended sequence, not dates, availability promises, or commercial commitments. Status is governed by [`src/config/capabilities.ts`](./src/config/capabilities.ts) and the [release gate](./docs/release-readiness.md).

## Current foundation

- typed seller context and target intake;
- eight named deck archetypes plus custom framing in the runtime schema;
- Cloudflare crawl, Perplexity enrichment, Gemini planning, and renderer adapter code;
- local persistence and artifact delivery paths;
- Apache-2.0 licensing and BYOK self-hosting documentation.

These are implemented code paths, not reference-verified production claims.

## Milestone 1: evidence-safe delivery — implemented, live proof pending

- bind each verifiable deck claim to source provenance;
- classify claims as `source-backed`, `seller-supplied`, `model-inference`, or `unsupported`;
- calculate deterministic evidence coverage from the claim ledger;
- block delivery while unsupported claims remain;
- expose required-field, CTA, readability, and provenance checks without collapsing them into a synthetic score;
- add versioned readiness receipts and regression tests.

## Milestone 2: reproducible reference path — blocked on controlled credentials

- run Cloudflare → Perplexity → Gemini → one renderer under controlled credentials;
- capture redacted request and response metadata, artifact checksums, timing, retry behavior, and commit SHA;
- complete repeated-run verification, including failure and resume paths;
- move qualifying capability states to `Reference-verified` only after receipts are checked in.

## Milestone 3: OSS packaging — in progress

- keep the durable worker entry point and public core contracts stable;
- verify the digest-pinned container topology and reproducible dependency policy from a clean host;
- observe the checked-in continuous integration, dependency review, and secret scan on hosted CI;
- verify a clean-room self-host installation from the public documentation;
- publish the first versioned release only after the release gate passes.

## Milestone 4: outbound delivery — planned

- define a provider-neutral email contract;
- require explicit human approval and evidence readiness before sending;
- implement idempotency, audit logs, suppression handling, opt-out policy, and safe retry behavior;
- evaluate direct sending and external delivery providers without coupling the OSS core to one vendor.

## Milestone 5: managed service, if justified

- keep billing, managed queues, monitoring, storage, scheduling, teams, analytics, and managed provider credits in a separate private cloud service;
- measure at least 30 completed runs and p95 cost per delivered artifact before publishing allowances or prices;
- validate billing replay, tenant isolation, backup/restore, privacy, abuse controls, and support operations before accepting customers.
