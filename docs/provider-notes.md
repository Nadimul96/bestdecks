# Provider Notes

These notes capture the implementation constraints that shaped the scaffold.

## Cloudflare Browser Rendering `/crawl`

- Primary crawler for V1.
- Supports starting a crawl job and polling for results.
- The crawl docs state jobs can run for up to 7 days and results remain available for 14 days after completion.
- The robots reference says Browser Rendering respects `robots.txt`, including `crawl-delay`.

References:

- https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/
- https://developers.cloudflare.com/browser-rendering/reference/robots-txt/
- https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/

## Deepcrawl fallback

- Used only as the fallback crawler when Cloudflare fails.
- This should be wrapped behind the same `CrawlProvider` contract so switching providers does not leak through the rest of the system.
- Deepcrawl's public docs currently describe `getMarkdown`, `readUrl`, and `extractLinks` as the core endpoints, and the site also warns that the project is early-stage and APIs may change.
- That means the fallback may need to be composed from multiple calls instead of assuming a feature-identical async crawl job.

Reference:

- https://deepcrawl.dev/
- https://deepcrawl.dev/docs
- https://deepcrawl.dev/docs/features/links/extract-links

## Presenton

- Used as the presentation-generation layer, not the research layer.
- Best fit here is self-hosted REST API mode rather than Presenton Cloud.
- It is open source and self-hostable, but still uses paid model providers unless you switch to local models.
- The public README documents `POST /api/v1/ppt/presentation/generate` and response fields including `presentation_id`, `path`, and `edit_path`.
- The README documents `pptx` and `pdf` as export formats. This project treats `presenton_editor` as a delivery mode that uses `edit_path` as the primary URL.
- Presenton appears more renderer-oriented than Gamma, so slide control will come mostly from our intermediary brief, instructions, and templates.

References:

- https://github.com/presenton/presenton
- https://docs.presenton.ai/using-presenton-api

## Perplexity

- Used for external personalization and evidence-backed enrichment.
- Keep citations and source URLs as first-class data so later steps can distinguish sourced facts from model inferences.

References:

- https://docs.perplexity.ai/docs/getting-started/quickstart
- https://docs.perplexity.ai/docs/grounded-llm/output-control/structured-outputs

## Gemini image generation

- Use only when the image strategy says it adds value.
- Treat image generation as optional support, not the default basis of the proposal.
- Gemini returns image payloads that should be uploaded to object storage before being handed to the presentation engine as presentation assets.

References:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/
