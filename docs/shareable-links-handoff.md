# Shareable links implementation notes

## What shipped

- Added the `shareable_decks` table and indexes in `src/server/db.ts`.
- Added server-side share link ownership, slug creation, expiry, bounded mutation quotas, and minimal public payload assembly in `src/server/shareable-decks.ts`.
- Re-exported the new shareable-link functions from `src/server/repository.ts`.
- Added authenticated create/deactivate endpoints:
  - `POST /api/delivery/[deckId]/share`
  - `DELETE /api/delivery/[deckId]/share`
- Added the public JSON endpoint:
  - `GET /api/share/[slug]`
- Added the public share viewer page:
  - `app/share/[slug]/page.tsx`
  - `components/shareable-deck-viewer.tsx`
- Added a recipient-safe renderer in `components/shareable-deck-viewer.tsx`. It is deliberately isolated from the sample-only archetype renderer so demo charts, testimonials, contacts, and CTA labels cannot enter live share links.
- Added delivery-page share actions in `components/workspace/views/delivery-view.tsx`:
  - `Share` for first-time creation
  - `Copy link` when an active share already exists
  - `Stop sharing` to deactivate the link
- Hardened `app/api/delivery/[deckId]/download/route.ts` so it now checks target ownership instead of only requiring a logged-in session.

## Data and behavior notes

- Share links are scoped to `run_targets.id` because the delivery UI is already target-based.
- New slugs contain 144 bits of randomness in a 24-character base64url value. Legacy short slugs fail closed at the read boundary.
- Creating a link is idempotent while an active, unexpired link exists for that target. The active-link lookup and any insert run in one serialized write transaction, so concurrent requests return the same slug instead of creating duplicates.
- Per-user mutation limits retain history while bounding database growth: 100 new rows per rolling 24 hours, 1,000 active unexpired links, and 10,000 lifetime rows. Reusing an existing active link does not consume quota. A rejected mutation returns `429`, a stable quota code, `Retry-After`, and `Cache-Control: private, no-store`.
- Deactivation flips `is_active = 0`. A later share request creates a fresh slug.
- Expired links are treated as unavailable by the public API/page even if the row remains active.
- Public reads are read-only. The legacy `view_count` column remains for schema compatibility, but page/API requests do not mutate it or create an anonymous tracking write per view.
- A deck is shareable only when its target status is `delivered` and both exact committed v1 worker checkpoints satisfy the canonical contract: a ready planning checkpoint with consistent claim evidence and planning-time gates, plus a delivered rendering checkpoint with a verification receipt and all delivery-readiness gates true. Missing, wrong-stage, malformed, contradictory, or legacy checkpoints fail closed with `409 Deck is not ready to share.`
- Eligibility is revalidated from `run_checkpoints` on every public read. `run_artifacts` are mirrors and do not establish state-machine completion.
- Public reads also require a non-null run owner and exact agreement between the share row and the deck owner/run/target linkage. Legacy or mismatched rows remain stored but resolve as not found.
- Delivery cards derive `canShare` from the same verified checkpoint-pair parser, and expose an active slug only when its owner and run match the requested deck.
- The public payload intentionally exposes only `share`, `target`, and `viewer`. Its document title is deterministic (`Proposal for <target>`); only claim-ledger-mapped slide headlines and bullets carry substantive content. Raw seller context, questionnaire data, model-generated plan titles, artifacts, speaker notes, evidence receipts, renderer metadata, inferred metrics, and sample visualization identifiers are not returned.
- The public target website is reduced to a credential-, path-, query-, and fragment-free HTTPS origin. The original crawl URL never enters the public payload.
- The public page emits `noindex`, `nofollow`, `noarchive`, `nosnippet`, and `noimageindex` robot metadata. The JSON endpoint returns the equivalent `X-Robots-Tag` header on both success and not-found responses.
- Provider verification, worker delivery, receipts, gallery eligibility, sharing, and downloads use the same 32 MiB artifact ceiling from `src/domain/artifact-limits.ts`.

## Slide-plan contract

The share viewer accepts only the current worker checkpoint envelope:

- `PlanningCheckpoint.plan.title`
- `PlanningCheckpoint.plan.slides[].headline`
- `PlanningCheckpoint.plan.slides[].bulletPoints`

`src/server/shareable-deck-contract.ts` owns the pure, fail-closed pair parser and exact checkpoint-key helper used by share reads and delivery eligibility. `mapSlidePlanToPublicSlides()` rejects raw top-level and legacy plans; current planner speaker notes, evidence ledgers, and rendering receipts remain private even when present in storage.

## Public URL origin behavior

- Share URLs are generated through `src/server/share-url.ts`.
- In production-style requests, `console.bestdecks.co` is collapsed to `bestdecks.co`.
- In local development, localhost origins are preserved.

## Tests and verification run

- `node --import tsx --test src/server/shareable-decks.test.ts`
- Focused ESLint and repository type checking are rerun as part of the current release audit; authoritative results live in `docs/release-readiness.md`.

## Verification scope

The commands above describe the original focused verification. Current repository-wide results are recorded in `docs/release-readiness.md`; this note is not a release receipt.

## Likely next steps

- If recipient analytics are added later, define an explicit privacy/retention contract and a buffered event path instead of restoring a write on every anonymous page read.
- If you want decks without `slide_plan` to become shareable, the pipeline needs to persist a renderable slide schema for those runs.
- If you want edit-after-share, define a separate authenticated editor projection. Do not widen the public-share projection or reuse sample-only renderer state.
