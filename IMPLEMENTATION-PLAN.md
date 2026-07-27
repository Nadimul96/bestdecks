# Bestdecks implementation status

Last reconciled: 2026-07-13

This file records remaining gates. Detailed contracts live in `PROJECT_CONTEXT.md`, `docs/architecture.md`, and `docs/release-readiness.md`.

This status describes an uncommitted local worktree based on
`2f19d61815784d379b2c277f96e45e0f21100e34`; `origin/main` still points to that baseline. No push,
deployment, history rewrite, credential rotation, or repository-setting change was made.

| Gate | Local implementation | External proof or action still required |
| --- | --- | --- |
| P0 credential containment | Worktree credentials quarantined; auth defaults removed; redacting worktree/history scanner added; exact all-ref Git bundle preserved | Rotate exposed credential/sessions; approve and perform history remediation; verify a fresh clone and GitHub security settings |
| P1 reproducible source | Node/pnpm pinned; lint, non-incremental typecheck, 478/478 unit tests, examples, production build, standalone boundary, runtime security smoke, dependency audits, and documentation/link reconciliation pass locally | Repeat from a fresh clone and attach a hosted-CI run on protected `main` |
| P2 durable execution | One leased SQLite/libSQL job state machine, attempts, retries, cancellation, checkpoints, terminal receipt, worker CLI, replay/partial-failure coverage, and a passing separate-process crash/resume regression | Prove the combined duplicate-launch, timeout, cancellation, partial-failure, and zero-stuck-run gate in the deployment profile |
| P3 reference providers | Cloudflare → Perplexity → Gemini → Presenton code path with stable identifiers, strict response contracts, bounded retries, and no inferred live status | Retain a single redacted live receipt, then prove ten consecutive runs across at least three ordinary public sites with zero stuck runs and honest failure accounting |
| P4 evidence readiness | Typed claim ledger, exact coverage, CTA/field/provenance checks, artifact checksum, unsupported-fact block, and bounded delivery-UI projection | Complete human review and adversarial live validation |
| P5 OSS packaging | Apache-2.0 core, public/cloud boundary, docs, issue forms, security policy, contribution files | Verify clean self-host quickstart and repository metadata |
| P6 paid cloud | Intentionally outside this public repository | Build and test billing/operations in a private `bestdecks-cloud` consumer only after cost evidence |

## Next smallest safe sequence

1. Review the archive inventory and local diff; do not push yet.
2. Repeat the recorded verification ladder from a fresh clone after an approved history repair.
3. Rotate the exposed credential and invalidate sessions through the owning service.
4. Review the preserved exact Git bundle and history-remediation plan.
5. After explicit approval, remediate the public remote and verify a fresh clone.
6. Configure scoped live-provider test credentials and run one reference receipt, then the exact
   ten-run, three-site, zero-stuck gate.

Email sending remains deliberately deferred. Evaluate direct delivery, Instantly, AgentMail, or another sender only after the deck pipeline and consent/deliverability requirements are stable.
