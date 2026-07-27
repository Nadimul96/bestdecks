# ADR 0001: OSS core and managed-cloud boundary

- Status: Accepted
- Date: 2026-07-13

## Context

Bestdecks needs a credible open-source distribution and may later offer managed operation. Putting incomplete cloud billing and enterprise promises into the public product makes the OSS contract unclear and creates pressure to withhold core functionality.

## Decision

Bestdecks OSS is licensed under Apache-2.0, self-hosted, and bring-your-own-key. The public core remains capable of running the complete implemented research-to-artifact pipeline without a Bestdecks Cloud account.

The public core owns:

- seller context and target intake;
- run and provider contracts;
- crawl and research orchestration;
- brief and slide planning;
- evidence ledger, readiness rules, and receipts when implemented;
- renderer adapters;
- artifact persistence and local operator surfaces;
- self-hosting documentation and diagnostics.

A separate private `bestdecks-cloud` service may own:

- managed deployment and upgrades;
- hosted queues, scheduling, storage, monitoring, and backups;
- managed provider credits;
- teams, hosted analytics, and cloud administration;
- billing, subscriptions, referrals, and commercial operations;
- hosted abuse prevention and support tooling.

The dependency direction is one-way: private cloud code may consume a released public core contract. Public core code must not import private cloud modules or require a hosted entitlement to execute core pipeline behavior.

## Consequences

- OSS users pay and govern their own provider usage.
- Managed-service value comes from operation, reliability, collaboration, and scale rather than disabling the public pipeline.
- Cloud billing and operations require their own security and release tests.
- Public capability documentation cannot imply that a private hosted service is available.
- Changes shared by both distributions should land in the public core first.

## Current conformance

The public workspace no longer fetches or displays a hosted credit balance, starts checkout, or
branches on a paid allowance. Hosted billing routes are retired from the OSS execution path.
Legacy billing persistence may remain temporarily for nondestructive migration compatibility; it
is not an availability promise, entitlement, or part of the public capability matrix. Structural
extraction into a private cloud repository remains release-gated work.
