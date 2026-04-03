# Shareable Links Handoff for Claude

## What shipped

- Added the `shareable_decks` table and indexes in `src/server/db.ts`.
- Added server-side share link ownership, slug creation, expiry, view counting, and minimal public payload assembly in `src/server/shareable-decks.ts`.
- Re-exported the new shareable-link functions from `src/server/repository.ts`.
- Added authenticated create/deactivate endpoints:
  - `POST /api/delivery/[deckId]/share`
  - `DELETE /api/delivery/[deckId]/share`
- Added the public JSON endpoint:
  - `GET /api/share/[slug]`
- Added the public share viewer page:
  - `app/share/[slug]/page.tsx`
  - `components/shareable-deck-viewer.tsx`
- Exported `SlidePreview` from `components/archetype-preview-modal.tsx` so the share page reuses the existing visual renderer instead of forking it.
- Added delivery-page share actions in `components/workspace/views/delivery-view.tsx`:
  - `Share` for first-time creation
  - `Copy link` when an active share already exists
  - `Stop sharing` to deactivate the link
- Hardened `app/api/delivery/[deckId]/download/route.ts` so it now checks target ownership instead of only requiring a logged-in session.

## Data and behavior notes

- Share links are scoped to `run_targets.id` because the delivery UI is already target-based.
- Creating a link is idempotent while an active, unexpired link exists for that target. The existing slug is returned.
- Deactivation flips `is_active = 0`. A later share request creates a fresh slug.
- Expired links are treated as unavailable by the public API/page even if the row remains active.
- View counts increment on:
  - `GET /api/share/[slug]`
  - Direct visits to `/share/[slug]`
- The public viewer is built from the persisted `slide_plan` artifact. If a deck has no `slide_plan`, sharing is rejected with `409 Deck is not ready to share.`
- The public payload intentionally exposes only `share`, `target`, and `viewer`. Raw seller context, questionnaire data, and artifacts are not returned.

## Slide-plan compatibility

The share viewer supports both:

- The current in-repo `SlidePlanner` artifact shape:
  - `title`
  - `anchorMetric`
  - `slides[].headline`
  - `slides[].bulletPoints`
  - `slides[].speakerNotes`
  - `slides[].purpose`
- The PRD-style legacy shape:
  - `slides[].role`
  - `slides[].title`
  - `slides[].subtitle`
  - `slides[].bullets`
  - `slides[].keyMetric`
  - `slides[].keyMetricLabel`

The mapper is in `mapSlidePlanToExampleSlides()`.

## Public URL origin behavior

- Share URLs are generated through `src/server/share-url.ts`.
- In production-style requests, `console.bestdecks.co` is collapsed to `bestdecks.co`.
- In local development, localhost origins are preserved.

## Tests and verification run

- `node --import tsx --test src/server/db.test.ts src/server/share-url.test.ts src/server/shareable-decks.test.ts`
- `node --import tsx --test src/server/repository.test.ts src/server/shareable-decks.test.ts`
- `pnpm build`

All of the above passed.

## Repo caveat

The shareable-links slice is green, but repo-wide `pnpm typecheck` still has unrelated pre-existing failures in other files outside this feature. This cleanup does not change that status.

## Likely next steps

- Add analytics beyond `view_count` if you want per-slide engagement later.
- If you want decks without `slide_plan` to become shareable, the pipeline needs to persist a renderable slide schema for those runs.
- If you want edit-after-share, reuse `mapSlidePlanToExampleSlides()` as the bridge into the editor state shape.
