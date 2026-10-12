# Changelog

All notable project changes will be recorded here. This project has not published its first release.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and released versions will follow semantic versioning when a stable public package exists.

## [Unreleased]

### Added

- Canonical public capability metadata with `Implemented`, `Reference-verified`, `Experimental`, and `Planned` states.
- Apache-2.0 license and initial security, contribution, conduct, self-hosting, release-readiness, roadmap, and architecture-decision documents.
- A leased SQLite worker state machine with checkpoints, heartbeats, bounded retries, cancellation,
  idempotent dispatch records, resumable Cloudflare jobs, and versioned run receipts.
- A free default path: a robots-aware, SSRF-safe built-in crawler and first-party site research
  summarized by Gemini, selected with `CRAWL_PROVIDER` and `RESEARCH_PROVIDER`.
- A root `docker-compose.yml` with a first-run setup service, healthchecks, and a SQLite volume.
- A per-claim evidence ledger in the pipeline and delivery views, served by
  `GET /api/runs/:runId/evidence`.
- An actionable `pnpm doctor` checklist and key-free `pnpm smoke:crawl`.

### Changed

- Reset public and workspace copy to distinguish implemented code from live verification.
- Reframed the product around the self-hosted BYOK core and a deferred managed-service boundary.
- Replaced generated deck-quality scores with deterministic factual-claim coverage, unsupported-
  claim gating, five separate readiness checks, and an explicit unavailable state for invalid or
  missing receipts.
- Marked illustrative product and archetype previews as `Sample data`.

### Removed

- Public prices, allowances, referrals, enterprise promises, unsupported model selection, outcome claims, and synthetic activity or quality metrics.

### Security

- Public release remains blocked pending the checks in `docs/release-readiness.md`.

[Unreleased]: ./
