# ADR 0003: Deterministic evidence coverage and delivery gate

- Status: Accepted
- Date: 2026-07-13

## Context

A generated deck may combine crawled facts, external research, seller-supplied claims, and model inference. A synthetic 0–100 quality score cannot establish factual support and can create a false “ready to send” signal.

The higher-cost error is a false positive: delivering an unsupported claim as if it were verified. While provenance is incomplete, the system should abstain and require review.

## Decision

Represent every verifiable deck claim in a deterministic ledger:

```ts
type ClaimProvenance =
  | "source_backed"
  | "seller_supplied"
  | "model_inference"
  | "unsupported";
```

The persisted enum uses underscores. Public display labels may render the first three values with
hyphens, but the stored contract is not rewritten.

The v1 ledger records a stable claim ID, exact visible text, claim class, support status, and cited
source IDs. Canonical claim IDs encode slide and field position. Each source record retains its
stable ID, redacted HTTP(S) URL, title, retrieval timestamp, and provider. The receipt separately
retains the ledger-schema version and exact-claim rubric version.

Captured excerpts, seller-input field paths, and free-form inference rationales are not part of the
v1 portable ledger. They must not be claimed as retained provenance; adding them requires a new
schema/rubric version, migration decision, and validation fixtures.

Evidence coverage is calculated from the complete claim set. Unmatched claims remain `unsupported` and stay in the denominator; parse failure cannot produce an empty passing ledger.

The delivery-readiness object reports separate deterministic checks:

- evidence coverage;
- unsupported claim count;
- required seller fields;
- CTA presence;
- readability constraints;
- artifact and source provenance;
- ledger-schema, rubric, and source-commit version.

No composite quality, persuasion, personalization, or visual score is inferred from those checks.

## Delivery rule

Automated delivery is blocked when any claim is `unsupported` or when the claim ledger cannot be produced. `seller_supplied` and `model_inference` claims remain visibly distinguished from `source_backed` claims even when delivery is otherwise allowed.

Human override, if introduced, must be explicit, attributable, scoped to a specific receipt, and cannot relabel unsupported material as verified.

## Implementation evidence and remaining validation

The deterministic ledger, delivery gate, versioned readiness receipt, source commit, and artifact checksum are
implemented in `src/domain/evidence.ts`, `src/domain/run-receipt.ts`, and
`src/server/run-executor.ts`. Unit fixtures cover supported, unsupported, seller-supplied, and
model-inference claims; malformed contracts; complete-denominator behavior; delivery blocking;
and renderer dispatch recovery.

The following live validation remains required before the reference path can be called
reference-verified:

- controlled runs containing numbers, quotations, and attribution;
- repeated-run agreement on captured provider inputs;
- human review of representative rendered outputs;
- a reproducible, redacted end-to-end receipt from the complete reference path.

Until that live proof exists, the product must distinguish implemented code from
reference-verified behavior and require human review.
