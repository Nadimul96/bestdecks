# Provider Notes

These notes capture the implementation constraints that shape the current repository.

## Cloudflare Browser Rendering `/crawl`

- Primary crawler for V1.
- Supports starting a crawl job and polling for results.
- The crawl docs state jobs can run for up to 7 days and results remain available for 14 days after completion.
- The robots reference says Browser Rendering respects `robots.txt`, including `crawl-delay`.

References:

- https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/
- https://developers.cloudflare.com/browser-rendering/reference/robots-txt/
- https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/

## Deepcrawl adapter (outside the reference path)

- Adapter code exists behind the generic `CrawlProvider` contract, but the durable worker does not
  dispatch it and the run API rejects the legacy crawl-exception flag.
- A failed Cloudflare crawl blocks the affected target. There is no automatic provider switch.
- Any future activation would require a new explicit product contract, security review of the
  changed data recipient, durable dispatch/resume semantics, tests, and a reference receipt.
- Deepcrawl's documented `getMarkdown`, `readUrl`, and `extractLinks` operations are not assumed to
  be feature-identical to Cloudflare's asynchronous crawl job.
- The retained adapter now has a strict local response schema, bounded GET retries, abort-aware
  timeouts, stable metadata, and constructor-only health. Its API remains unversioned in the
  checked-in contract, so no model, cost, usage, reachability, or live-success value is inferred.

Reference:

- https://deepcrawl.dev/
- https://deepcrawl.dev/docs
- https://deepcrawl.dev/docs/features/links/extract-links

## Experimental Alai and Plus AI renderers

- Both adapters expose stable provider metadata and explicit experimental capability labels.
- Configuration checks are constructor-only. `reachable` and `liveSmokePassed` remain `null`
  until a separately authorized check retains evidence.
- Create responses and poll responses are parsed through strict local Zod contracts. HTTP 401,
  403, 408, 429, 5xx, malformed, empty, failed-generation, and bounded poll-timeout outcomes are
  normalized without retaining provider response bodies.
- Paid create operations are replayed only after an explicit 429. Network, timeout, and 5xx
  outcomes are indeterminate and are never replayed automatically.
- Alai request bodies are deterministic for identical inputs and honor `imagePolicy: never`.
- Neither retained response contract supplies an unambiguous usage amount plus unit or monetary
  amount plus currency. Observability therefore omits usage and cost rather than estimating them.
- These are local fixture-backed contracts only. Neither adapter is dispatched by the durable
  reference worker, and neither has a checked-in live receipt proving current API compatibility,
  permissions, exports, cost, or artifact verification.

## Presenton

- Used only as the deterministic PPTX rendering/export layer, not the research, writing, or slide-
  planning layer.
- The v0.1 adapter is self-hosted-only. It requires HTTP Basic authentication and rejects
  Presenton Cloud, bearer/API-key configuration, missing Basic credentials, and mixed modes.
- Bestdecks first calls `POST /api/v1/ppt/presentation/create` for a blank shell, then
  `PATCH /api/v1/ppt/presentation/update` with the complete caller-built `SlideModel.ui` array,
  and finally `POST /api/v1/ppt/presentation/edit` with an empty edit list and `export_as="pptx"`.
- The adapter validates the exact create echo, exact full update echo, export presentation ID, and
  same-origin unsigned `.pptx` path. It persists only the presentation ID and normalized export URL;
  editor paths and provider response extras are discarded.
- Presenton may support additional exports, but this project's v0.1 reference path admits only
  PPTX and persists no editor link as a deliverable.
- The mandatory request profile is `imagePolicy=never`, `visualDensity=rich`, and
  `visualContentTypes=[]`; non-empty requested image URLs fail before dispatch. The absence of
  generated media is not a minimal-design fallback.
- Bestdecks builds the exact native-vector component tree and deterministic layout variation before
  dispatch. The adapter never invokes Presenton's content-generation, rewriting, layout-selection,
  web-search, or image-generation route.
- Presenton receives no OpenAI key, model ID, image-provider key, or other provider credential. The
  pinned image's required `LLM=openai` startup selector is an inert compatibility value on this path;
  the renderer has no provider-egress network.
- A fetched artifact is deliverable only if `pptx_ooxml_rich_static_v2` proves exact approved text
  and the closed native-vector/font/palette profile. Each slide needs a vector background, vector
  accent, explicit allowlisted typography, and high text/background contrast; a multi-slide deck
  also needs measured layout variation. Pictures, media, charts, OLE objects, animation, custom
  geometry, external relationships, overlaps, and noncanonical or unknown package parts fail
  closed. The durable readiness record must set `visualProfileVerified=true`.
- [`deploy/presenton/rich-static-v1.manifest.json`](../deploy/presenton/rich-static-v1.manifest.json)
  binds source commit `882a826f274ddbd4650cdb21b3a9ff4d16276fe9`, image
  `ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88`,
  plus template `bestdecks_inline_vector_v1`, theme `bestdecks_green_v1`, the exact four layout
  identifiers, content-free UI schema SHA-256
  `3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f`, palette, Arial font,
  and no-media policy.
- Unit fixtures establish the local request and verifier contracts only. Compatibility with a
  live export from that exact pinned image and inline UI profile remains an unchecked release-
  receipt gate; fixture success must not be reported as live renderer verification.

References:

- https://github.com/presenton/presenton
- https://docs.presenton.ai/using-presenton-api

## Perplexity

- Used for external personalization and evidence-backed enrichment.
- Keep citations and source URLs as first-class data so later steps can distinguish sourced facts from model inferences.
- The v0.1 JSON contract accepts only `sonar` and `sonar-pro`. Reasoning and deep-research
  models prepend reasoning text to their content, so they remain unsupported unless a separate,
  bounded parser and live contract receipt are added.

References:

- https://docs.perplexity.ai/docs/sonar/quickstart
- https://docs.perplexity.ai/docs/sonar/features
- https://docs.perplexity.ai/docs/sonar/models/sonar-reasoning-pro
- https://docs.perplexity.ai/docs/sonar/models/sonar-deep-research

## Gemini image generation (disabled experimental adapter)

- Adapter code is retained for future evaluation, but the canonical worker does not instantiate or
  dispatch it and the run admission boundary rejects generated media.
- It has no live reference receipt, artifact-provenance contract, storage lifecycle, or attested
  renderer placement. It must not be presented as available in v0.1.
- Activation requires a separate product/security review, deterministic media provenance, safe
  object storage, renderer verification, and controlled live receipts.
- The adapter's static contract validates the configured model, bounds three intentional image
  calls, propagates cancellation, strictly parses inline image payloads, and never replays an
  indeterminate paid POST. An explicit 429 is the only retryable generation response.
- When Gemini explicitly returns token counts in `usageMetadata`, those counts are emitted with
  normalized token units. No price or currency is inferred, and no cost is emitted. Constructor
  health remains offline-only with `reachable: null` and `liveSmokePassed: null`.

References:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/
