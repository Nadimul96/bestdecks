# ADR 0002: Canonical capability truth contract

- Status: Accepted
- Date: 2026-07-13

## Context

The landing page, README, workspace copy, and implementation previously disagreed about providers, outputs, scale, quality scoring, pricing, and enterprise features. A prose-only audit cannot prevent that drift from returning.

## Decision

`src/config/capabilities.ts` is the canonical public capability inventory. Each entry has one of four exact states:

- `implemented`: an inspectable code path exists;
- `reference-verified`: a controlled live path passed and has a checked-in, reproducible receipt;
- `experimental`: code exists, but the surface is disabled, incomplete, or lacks required proof;
- `planned`: the capability is not available.

`Implemented` never implies production reliability, provider permission, security review, cost, or successful live execution. `Reference-verified` is reserved and must remain absent until its receipt exists.

Every entry cites repository evidence. Public UI reads directly from the metadata module. Documentation mirrors the same list and must be checked for drift.

Illustrative UI, fixtures, and examples must visibly say `Sample data`. Plausible numbers, names, customer stories, model output, and historical generation are not product evidence.

## Receipt requirements

A reference-verification receipt records at least:

- commit SHA;
- configuration names without values;
- exact provider sequence;
- target fixture identity;
- attempt, timeout, retry, and resume behavior;
- artifact location and checksum;
- timestamps and measured durations;
- verifier and reproduction instructions.

It must exclude credentials, personal data, private provider payloads, and customer material.

## Consequences

- Marketing language becomes a generated view of engineering evidence.
- An unavailable or blocked measurement remains visibly unavailable.
- Planned work cannot be sold as a feature.
- Any new capability requires metadata, evidence, tests, and documentation in the same change.
