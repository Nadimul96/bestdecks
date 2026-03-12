# V1 Architecture

## Goal

Build a batch workflow that accepts up to 100 target-company websites, understands both the seller and the targets, and generates one tailored deck per target using Presenton.

## Product contract

- One run contains 1 to 100 target rows.
- One row maps to one target company.
- `websiteUrl` is the only mandatory target-row field.
- Deck settings apply per run, not per row.
- Output format is one of `presenton_editor`, `pdf`, or `pptx`.
- Human review is optional per run.
- User-approved crawl exceptions are a product concept, but the primary Cloudflare crawler still respects `robots.txt`.

## Pipeline

### Step 0: Seller discovery

This step exists because target analysis alone is not enough to create a persuasive deck.

- If the seller provides a website, crawl it and build a seller brief.
- If no seller website exists, require typed seller context.
- Extract the seller's positioning, offer, differentiators, target customer, proof points, and preferred pitch angles.

Output:

- `seller_brief.md`
- `seller_profile.json`

### Step 1: Target intake

Input sources:

- CSV upload
- paste-in multiline text
- optional contact metadata fields

Normalization rules:

- dedupe by normalized domain
- reject more than 100 target rows
- preserve original row metadata for personalization

Output:

- `run_manifest.json`

### Step 2: Target crawl

Primary crawler:

- Cloudflare Browser Rendering `/crawl`

Fallback crawler:

- Deepcrawl

Rules:

- default to Cloudflare first
- store crawl job identifiers and provider name
- persist returned pages immediately even if the upstream results are temporary
- mark blocked URLs and skipped URLs so QA can detect weak coverage
- if Deepcrawl is used, be prepared to compose site understanding from link extraction plus page reads instead of assuming a single equivalent crawl job

Output:

- `crawl_result.json`
- `crawl_pages/*`

### Step 3: External enrichment

Provider:

- Perplexity

Purpose:

- fill in recent facts or weakly represented context
- validate location, industry, recent activity, and market framing
- gather supporting evidence for personalization

Rules:

- preserve citations and source URLs
- separate sourced facts from inferred facts
- do not let Perplexity override directly observed site evidence without explanation

Output:

- `enrichment_result.json`

### Step 4: Company brief generation

This is the intermediary AI-agent layer.

Inputs:

- crawl output
- seller brief
- Perplexity enrichment
- target-row metadata

Required outputs:

- company summary
- industry
- offer
- locale if visible
- likely buyer
- observable pain points
- proof points
- relevant pitch angles for the seller
- source URL list

Rules:

- every non-obvious claim should trace back to evidence
- unsupported assumptions are labeled as hypotheses
- keep the brief compact enough to fit downstream generation constraints

Output:

- `company_brief.md`
- `company_brief.json`

### Step 5: Deck strategy generation

Inputs:

- normalized questionnaire
- seller brief
- company brief

Generate:

- slide-by-slide outline
- per-slide objective
- evidence snippets to surface
- CTA framing
- visual direction
- image plan

Rules:

- do not send raw crawls to the presentation engine
- produce a strict `deck_generation_input`
- respect run-level output format and card-count limits

Output:

- `deck_spec.md`
- `deck_generation_input.json`

### Step 6: Image strategy

Default rule:

- `auto` means the system decides.

Recommended triggers for image generation:

- the target site is visually weak and a concept image would materially improve comprehension
- a cover card needs industry-specific atmosphere
- a before/after or editorial composition would support the pitch

Recommended skip conditions:

- strong brand assets already exist on the target site
- generated imagery would risk looking fake or irrelevant
- the deck is strongly analytical and does not benefit from decorative visuals

Provider:

- Gemini image generation models

Output:

- image asset URLs
- rationale

Operational note:

- if the image provider returns binary or data-URL payloads, upload them to storage first and pass stable asset URLs into the presentation engine

### Step 7: Presenton generation

Default mode:

- Presenton self-hosted REST API

Generation path:

- `POST /api/v1/ppt/presentation/generate`

Inputs:

- condensed deck generation input
- generation instructions
- optional asset references if later templates support them more explicitly

Output:

- Presenton editor URL
- optional export URL depending on chosen run format

### Step 8: Review and delivery

If review is enabled:

- hold the deck for inspection
- allow approve, reject, or regenerate

If review is disabled:

- deliver immediately after successful generation

## Data model

Suggested core tables:

- `runs`
- `seller_profiles`
- `target_rows`
- `crawl_jobs`
- `crawl_pages`
- `enrichment_jobs`
- `company_briefs`
- `deck_specs`
- `generated_assets`
- `deliverables`

## Queue model

Suggested queue names:

- `seller-discovery`
- `target-crawl`
- `target-enrichment`
- `company-brief`
- `deck-strategy`
- `image-generation`
- `presentation-generation`
- `delivery`

## Failure policy

- Retry transient provider failures with backoff.
- Fall back from Cloudflare to Deepcrawl.
- Fail one target row without failing the entire run when possible.
- Mark runs as `partially_completed` when at least one deliverable succeeds.
- Require explicit user approval before using any exception path that departs from normal crawl compliance.
