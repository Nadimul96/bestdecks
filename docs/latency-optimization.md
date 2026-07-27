# Latency measurement and optimization

Status: measurement protocol. No production latency or scale benchmark has been established.

The reference worker processes persisted stages with leases and checkpoints. That design favors
recoverability and evidence integrity. Optimization must preserve those properties and be driven
by retained run timings rather than estimated provider speeds.

## Measurement source

Use the stage timings and attempts in the persisted run receipt. For each controlled run, retain:

- deployed commit and configuration names;
- target count and target class;
- provider and model identifiers;
- stage start, completion, duration, and attempt count;
- terminal state and failure code; and
- verified artifact bytes and checksum for delivered targets.

Report distributions, not a single best case. At minimum use p50 and p95 after 30 completed
reference runs, while accounting separately for failed and cancelled runs.

## Optimization order

1. Investigate the stage contributing most to measured p95 latency.
2. Remove redundant provider work by reusing completed, contract-valid checkpoints.
3. Add caching only with an explicit key, freshness policy, provenance, and invalidation test.
4. Add target concurrency only after proving lease safety, provider limits, deterministic ordering,
   and SQLite write behavior under contention.
5. Change infrastructure only when a reproduced bottleneck justifies the operational cost.

Never trade away source retention, evidence gating, cancellation boundaries, artifact verification,
or idempotency merely to improve an elapsed-time number.

## Required regression proof

Any latency change must keep restart/resume, replay, cancellation, partial-failure, tenant
isolation, and receipt tests green. A load claim requires a controlled load receipt; the configured
100-target schema maximum is not itself evidence that the system can process that load reliably.
