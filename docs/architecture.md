# bestdecks Architecture

## Overview

bestdecks is an AI-powered platform that generates personalized sales/outreach presentation decks. Users provide their business context + target company URLs, and the system crawls, researches, and generates custom pitch decks for each target.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Next.js API routes (server-side), TypeScript |
| Database | SQLite via Turso (prod) / local file (dev), Kysely query builder |
| Auth | Better Auth + Google OAuth |
| Payments | Stripe (subscriptions + credit system) |
| Hosting | Render (primary), Vercel (configured as secondary) |
| AI | Gemini 2.5 Flash (slide planning, brief building, images), GPT-4o (Presenton) |

## Pipeline Architecture

```
User Input (seller context + target URLs + deck settings)
│
├─ Step 1: PREFLIGHT
│  └─ Resolve integrations, validate API keys, mark targets as "processing"
│
├─ Step 2: PREPARATION (parallel per target)
│  ├─ CloudflareCrawler.crawlSite() → fallback: DeepcrawlCrawler
│  ├─ PerplexityEnrichment.enrichCompany()
│  ├─ [optional] CommunityIntel.gatherInsights()
│  └─ AiBriefBuilder.buildCompanyBrief() [Gemini]
│     └─ Extracts: anchorMetric, contrarianAngle, compoundingLogic
│
├─ Step 3: GENERATION (per target, sequential due to SQLite)
│  ├─ [parallel] ImageProvider.generateAssets() [Gemini]
│  ├─ [parallel] SlidePlanner.planSlides() [Gemini]
│  │   └─ Uses Thiel/Raskin/Challenger Sale narrative framework
│  └─ DeckProvider.createDeck()
│     └─ Priority: Alai → Plus AI → Presenton (fallback chain)
│
└─ Step 4: DELIVERY
   └─ Persist artifacts (crawl, brief, deck URL) to SQLite
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/orchestrator.ts` | Main pipeline coordinator |
| `src/server/run-executor.ts` | Run lifecycle manager (preflight → generation → delivery) |
| `src/server/ai-brief-builder.ts` | Gemini-powered target company analysis |
| `src/server/slide-planner.ts` | Narrative architecture + slide-by-slide content planning |
| `src/domain/deck.ts` | Final rendering prompt builder (sent to deck providers) |
| `src/integrations/providers.ts` | Core types: CompanyBrief, DeckGenerationInput |
| `src/integrations/plusai.ts` | Plus AI (Google Slides) integration |
| `src/integrations/presenton.ts` | Presenton (self-hosted) integration |
| `src/integrations/alai.ts` | Alai (primary deck provider) integration |
| `src/server/db.ts` | Database schema, migrations, queries |
| `lib/business-context.tsx` | Multi-business React context |
| `components/workspace/` | All workspace view components |

## Deck Archetypes

| Archetype | Use Case |
|-----------|----------|
| `cold_outreach` | First-touch to unknown prospects |
| `warm_intro` | Shared connection or prior interaction |
| `agency_proposal` | Formal scope/deliverables/pricing proposal |
| `investor_pitch` | Fundraising pitch deck |
| `case_study` | Results-driven proof deck |
| `competitive_displacement` | Switch from incumbent |
| `thought_leadership` | Education-first positioning |
| `product_launch` | New feature/product announcement |
| `custom` | User-defined prompt → full creative control |

## Narrative Framework (baked into prompts)

The slide planner uses a synthesis of three proven frameworks:

1. **Andy Raskin's "Greatest Sales Deck"** — tension → vision → solution → proof → CTA
2. **Peter Thiel's Founders Fund** — every claim backed by data, one organizing metric, contrarian positioning
3. **Challenger Sale** — lead with insight, reframe the conversation, teach the prospect something new

Key concepts:
- **Anchor Metric**: One stat that organizes the entire deck (SpaceX: "cost per kg to orbit")
- **Contrarian Angle**: Non-obvious framing competitors wouldn't use (Anthropic: safety over capability)
- **Compounding Logic**: Solving X enables Y, which unlocks Z (the flywheel)
- **Headline Narrative Test**: Reading only headlines = 70-80% understanding of the story

## Database Schema

```
workspace_state     — user workspace data (seller context, questionnaire, drafts)
integration_settings — encrypted API key storage
runs                — proposal generation runs
run_targets         — individual target companies per run
run_artifacts       — crawl results, briefs, deck URLs (by type)
run_events          — activity log per run
user_credits        — credit-based billing (balance, plan, Stripe sub)
```

## Environment Variables

See `src/config/env.ts` for the complete list. Key ones:

| Variable | Service | Required |
|----------|---------|----------|
| `CLOUDFLARE_ACCOUNT_ID` + `_API_TOKEN` | Primary web crawler | Yes |
| `PERPLEXITY_API_KEY` | Company enrichment | Yes |
| `GEMINI_API_KEY` | Slide planning, brief building, images | Yes |
| `TURSO_DB_URL` + `_AUTH_TOKEN` | Production database | Prod only |
| `BETTER_AUTH_SECRET` + `_URL` | Authentication | Yes |
| `STRIPE_SECRET_KEY` | Payments | Yes |
| `ALAI_API_KEY` | Primary deck provider | Optional |
| `PLUSAI_API_KEY` | Google Slides deck provider | Optional |
| `PRESENTON_BASE_URL` | Self-hosted deck provider | Optional |

## Latency Profile

| Phase | Time | Notes |
|-------|------|-------|
| Crawl + Enrichment | 30-45s | Parallel per target |
| Slide Planning | 15-40s | Gemini API call |
| Image Generation | 10-30s | Parallel with planning |
| Deck Generation | 30-90s per target | Sequential (SQLite constraint) |
| **Total (3 targets)** | **~4-9 minutes** | Depends on API response times |

## Known Limitations

1. **No caching** — crawl/enrichment results are not cached between runs
2. **Sequential deck generation** — SQLite write lock prevents parallel deck creation
3. **No CI/CD** — deploys are manual via Render git push
4. **No APM/monitoring** — only a health check endpoint exists
