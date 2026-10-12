# Changelog

All notable project changes are recorded here. Versions are source releases; see `docs/release-readiness.md` for the separate Reference-verified gate.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and released versions will follow semantic versioning when a stable public package exists.

## [Unreleased]

## [0.2.0] - 2026-10-12

### Added

- A free default path: a robots-aware, SSRF-safe built-in crawler and first-party site research
  summarized by Gemini, selected with `CRAWL_PROVIDER` and `RESEARCH_PROVIDER`.
- A root `docker-compose.yml` with a first-run setup service, healthchecks, and a SQLite volume.
- A per-claim evidence ledger in the pipeline and delivery views, served by
  `GET /api/runs/:runId/evidence`.
- An actionable `pnpm doctor` checklist and key-free `pnpm smoke:crawl`.

### Changed

- Dependencies updated to current stable releases (Next.js 16.4, React 19.3, Better Auth 1.7, ESLint 10).
- The landing page and console lead with the evidence gate; setup prompts no longer cover the console.

### Fixed

- Production builds returned HTTP 500 on `/login` and `/console` because Better Auth rejected a relative base URL.

### Removed

- The unused `/api/intake/normalize` route and empty `vercel.json` / `render.yaml`.

## [0.1.0] - 2026-07-27

### Added

- Canonical public capability metadata with `Implemented`, `Reference-verified`, `Experimental`, and `Planned` states.
- Apache-2.0 license and initial security, contribution, conduct, self-hosting, release-readiness, roadmap, and architecture-decision documents.
- A leased SQLite worker state machine with checkpoints, heartbeats, bounded retries, cancellation,
  idempotent dispatch records, resumable Cloudflare jobs, and versioned run receipts.

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

- A Reference-verified release remains gated on the checks in `docs/release-readiness.md`.

[Unreleased]: https://github.com/Nadimul96/bestdecks/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Nadimul96/bestdecks/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Nadimul96/bestdecks/releases/tag/v0.1.0
