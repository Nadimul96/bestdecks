# Questionnaire contract

The product should present a short guided intake that normalizes free-form user intent into typed fields.

## Seller context

Required:

- offer summary
- services
- differentiators
- target customer
- desired outcome

At least one anchor:

- seller website URL
- seller company name

Optional:

- proof points
- constraints

## Run-level deck settings

- Goal
- Audience
- Deck type
- Output format (PPTX in the v0.1 reference profile)
- Tone
- Card count
- Call to action
- Visual style
- Image policy (fixed to `never` in the v0.1 reference profile)
- Visual density (fixed to `rich`)
- Visual content types (fixed to an empty list)
- Must include
- Must avoid
- Extra instructions

## Recommended UX rules

- Ask seller-context questions before target questions.
- Make `websiteUrl` the only required target-row field.
- Let users paste newline-separated domains and expand them into rows.
- Let users upload CSV files with optional metadata columns.
- Show a summary before launch:
  - number of targets
  - output format
  - mandatory `rich_static_v1` vector profile
  - no requested generated or remote media

## Normalization notes

- `Deck type` maps to one of the eight named archetypes or `custom` in
  [`src/domain/schemas.ts`](../src/domain/schemas.ts).
- `Output format` is singular for the whole run and is admitted only as `pptx`.
- The admitted tuple is exactly `imagePolicy=never`, `visualDensity=rich`, and
  `visualContentTypes=[]`. Generated or remote media requests fail admission, but `never` does not
  mean visually minimal: the renderer and artifact verifier require deterministic native-vector
  backgrounds, accents, typography, palette, and layout variation.
- The standard Presenton template and deterministic four-layout cycle are renderer-owned contract
  values, not questionnaire options. User visual-style text can guide planning within that closed
  profile but cannot widen the package, media, font, palette, or geometry allowlists.
- Optional review and crawl exceptions are forced off. They are not implemented v0.1 features.
