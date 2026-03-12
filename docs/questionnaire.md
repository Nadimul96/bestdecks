# Questionnaire Contract

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
- Output format
- Tone
- Card count
- Call to action
- Visual style
- Image policy
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
  - review enabled or disabled
  - crawl-exception setting

## Normalization notes

- `Deck type` maps to `cold_outreach`, `warm_intro`, or `agency_proposal`.
- `Output format` is singular for the whole run.
- `Image policy` should default to `auto`.
- `Optional review` should default to `true`.
