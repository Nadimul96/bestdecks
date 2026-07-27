# Evidence-first release narrative

Status: gated planning document. Nothing here authorizes publication.

Bestdecks should be introduced through inspected behavior, not invented outcomes. The useful
story is the correction: an old prototype had real pipeline code, but its marketing claims,
execution paths, and release evidence did not agree. The OSS reset makes those boundaries
explicit.

## Publication gate

Do not announce a release until all of the following are true:

- the exposed sign-in credential is revoked and the public Git history is clean;
- required CI passes from a clean checkout;
- the supported provider path has a retained, redacted live receipt;
- the README and landing page match the capability registry; and
- the published commit is the commit represented by the receipt and release.

The authoritative status is [release readiness](./release-readiness.md).

## Evidence-backed topics

After the gate passes, content may demonstrate:

- one target moving through crawl, cited research, typed brief, typed plan, and rendering;
- how evidence labels block unsupported factual claims;
- how leases, checkpoints, and idempotency support restart and replay;
- what a redacted run receipt proves and what it does not prove; and
- measured reliability, latency, and provider cost from retained controlled runs.

## Metric contract

A number may be published only with its definition, denominator, observation window, timestamp,
and source receipt. Customer outcomes, time saved, conversion lift, scale, and cost comparisons
require their own study; a generated deck or internal estimate is not evidence.

The first public benchmark requires at least 30 completed reference runs. Report p50 and p95
provider cost per delivered deck, stage latency, failure rate, and refund rate without turning them
into customer-outcome claims.
Hosted prices and included deck allowances remain unpublished until that benchmark exists.

## Deferred channel work

Outbound email delivery is deliberately outside the v0.1 OSS release path. Direct sending,
Instantly, and agent-mailbox providers should be evaluated later against consent, reputation,
suppression, tenancy, audit, and retry requirements before any integration is selected.
