# Latency Optimization Guide

## Current Bottlenecks (ranked by impact)

### 1. Sequential Deck Generation (HIGHEST IMPACT)
**Problem**: Deck generation runs one target at a time because SQLite can't handle concurrent writes.
**Time cost**: 30-90s per target (so 3 targets = 90-270s wasted sequentially).
**Fix options**:
- **Short term**: Buffer deck results in memory, batch-write to SQLite after all targets complete
- **Medium term**: Switch to Turso HTTP API (supports concurrent writes)
- **Long term**: Queue system (BullMQ + Redis) for async deck generation

### 2. No Crawl/Enrichment Caching (HIGH IMPACT)
**Problem**: Same target company re-crawled and re-enriched on every run.
**Time cost**: 30-45s per duplicate target.
**Fix**: Cache crawl results and enrichment summaries in `run_artifacts` table with TTL.
```
Before each crawl:
1. Check run_artifacts for recent crawl (< 48h) of same URL
2. If found, reuse it
3. If not, crawl fresh and store
```

### 3. Presenton Cold Start (MEDIUM IMPACT)
**Problem**: Self-hosted Presenton container on Render starter plan may cold-start (spin-down after inactivity).
**Time cost**: 15-45s cold start.
**Fix**: Keep-alive ping every 10 minutes via Render cron job, or upgrade to always-on plan.

### 4. Gemini API Latency (LOW IMPACT — already parallelized)
**Problem**: Slide planning and image generation each take 15-40s.
**Current state**: Already running in parallel. No further optimization needed unless we batch multiple Gemini calls.

## Quick Wins (implement in order)

1. **Crawl result caching** — 2-3 hours of work, saves 30-45s per duplicate target
2. **Batch SQLite writes** — 1-2 hours, enables parallel deck generation
3. **Presenton keep-alive** — 30 minutes, eliminates cold start penalty
4. **Progress streaming** — Add SSE/WebSocket progress updates so users see real-time status instead of a spinner

## Infrastructure Scaling Path

| Stage | Setup | Monthly Cost | Handles |
|-------|-------|-------------|---------|
| Current | Render starter × 2 | ~$14/mo | 5-10 runs/day |
| Growth | Render standard + Redis | ~$50/mo | 50-100 runs/day |
| Scale | Render pro + managed Postgres + BullMQ | ~$150/mo | 500+ runs/day |
| Enterprise | AWS/GCP with queue workers | ~$500/mo | 5000+ runs/day |
