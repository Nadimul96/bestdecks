# Custom Proposals

Contract-first scaffold for a batch company-research and deck-generation system.

## Current scope

- Intake up to 100 target companies per run.
- Require only `websiteUrl` for each target row.
- Discover seller context first, either from the seller's website or from typed answers.
- Crawl target websites with Cloudflare Browser Rendering `/crawl` as primary.
- Fall back to Deepcrawl when Cloudflare fails.
- Enrich company understanding with Perplexity-backed external research.
- Produce a structured deck brief before sending anything to Presenton.
- Generate one output format per run: `presenton_editor`, `pdf`, or `pptx`.

## Project status

This repository currently contains:

- typed schemas for run intake and questionnaire normalization
- a pipeline planner and state model
- provider contracts for crawling, enrichment, image generation, and presentation delivery
- live HTTP clients for Cloudflare crawl, Perplexity enrichment, Gemini image generation, and Presenton generation
- architecture notes and workspace conventions

No live provider calls are wired yet because credentials have not been supplied.

## Scripts

```bash
pnpm install
pnpm check
```

`pnpm check` performs:

- TypeScript typecheck
- example manifest validation
- example plan rendering

Smoke tests:

- `pnpm doctor`
- `pnpm smoke:perplexity`
- `pnpm smoke:gemini`
- `pnpm smoke:cloudflare`
- `pnpm smoke:presenton`

## Important documents

- [Architecture](./docs/architecture.md)
- [Cloudflare Setup](./docs/cloudflare-setup.md)
- [Presenton Setup](./docs/presenton-setup.md)
- [Questionnaire](./docs/questionnaire.md)
- [Provider Notes](./docs/provider-notes.md)
