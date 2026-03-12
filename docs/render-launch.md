# Bestdecks Launch Path

## Why Vercel is not the final production host

The current app persists auth, onboarding state, runs, and artifacts in SQLite. That is acceptable locally and on a host with a persistent disk, but it is not durable on Vercel because Vercel Functions provide a read-only filesystem with only writable `/tmp` scratch space up to 500 MB.

Source:

- https://vercel.com/docs/functions/runtimes

## Fastest safe launch architecture

Use two Render services in the same region:

1. `bestdecks-app`
   - Hosts the Next.js app
   - Stores SQLite on a Render persistent disk
2. `bestdecks-presenton`
   - Hosts Presenton
   - Stores Presenton data on its own Render persistent disk

This keeps the current codebase intact and avoids a last-minute database migration.

Sources:

- https://render.com/docs/web-services
- https://render.com/docs/disks
- https://render.com/docs/blueprint-spec
- https://render.com/docs/custom-domains
- https://docs.presenton.ai/quickstart
- https://docs.presenton.ai/using-presenton-api

## Files already prepared in this repo

- `render.yaml`
- `deploy/presenton/Dockerfile`
- `app/api/health/route.ts`

## Exact setup steps

### 1. Push the latest repo state

```bash
git add .
git commit -m "Prepare Render launch"
git push origin main
```

### 2. Create the Render Blueprint

In Render:

1. Open `Blueprints`
2. Click `New Blueprint Instance`
3. Select `Nadimul96/bestdecks`
4. Approve the `render.yaml`

Render will create:

- `bestdecks-app`
- `bestdecks-presenton`

### 3. Fill in the required environment variables

For `bestdecks-app`:

- `BETTER_AUTH_URL`
- `RENDER_EXTERNAL_URL`
- `PRESENTON_BASE_URL`
- `ADMIN_PASSWORD`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `DEEPCRAWL_API_KEY`
- `PERPLEXITY_API_KEY`
- `GEMINI_API_KEY`

Recommended values:

- `BETTER_AUTH_URL=https://bestdecks.co`
- `ADMIN_PASSWORD=Nazmul89?`
- `CLOUDFLARE_ACCOUNT_ID=2c273fce90c0a8c566807aad975e95c3`
- `CLOUDFLARE_API_TOKEN=<Browser Rendering token>`
- `DEEPCRAWL_API_KEY=<Deepcrawl key>`
- `PERPLEXITY_API_KEY=<Perplexity key>`
- `GEMINI_API_KEY=<Gemini key>`

For `RENDER_EXTERNAL_URL` and `PRESENTON_BASE_URL`, use the initial `onrender.com` URLs first. Replace them with custom domains after DNS is live.

For `bestdecks-presenton`:

- `OPENAI_API_KEY`

Recommended value:

- `OPENAI_API_KEY=<OpenAI key with quota>`

### 4. Wait for both services to finish deploying

Validation targets:

- App health: `https://<app>.onrender.com/api/health`
- Presenton UI: `https://<presenton>.onrender.com/`

### 5. Add custom domains in Render

On `bestdecks-app`, add:

- `bestdecks.co`
- `www.bestdecks.co`

On `bestdecks-presenton`, add:

- `presenton.bestdecks.co`

Render will show the exact DNS targets and verification records.

### 6. Create the Cloudflare DNS records

After Render shows the DNS targets, create:

- apex/root record for `bestdecks.co`
- `www`
- `presenton`
- any verification records Render asks for

Use DNS only while validating. If you enable Cloudflare proxying later, do it after TLS is confirmed working.

### 7. Replace temporary URLs with custom domains

Once DNS and TLS are healthy:

For `bestdecks-app`:

- `BETTER_AUTH_URL=https://bestdecks.co`
- `RENDER_EXTERNAL_URL=https://bestdecks.co`
- `PRESENTON_BASE_URL=https://presenton.bestdecks.co`

Redeploy `bestdecks-app`.

### 8. Final smoke test

1. Visit `https://bestdecks.co/login`
2. Sign in with:
   - `nadimul96@gmail.com`
   - `Nazmul89?`
3. Save onboarding
4. Submit one test website
5. Launch a run
6. Confirm:
   - crawl succeeds
   - research completes
   - brief is saved
   - Presenton editor opens remotely

## What still changes after launch

This path is the fastest launch-safe option. It is not the final scaling architecture.

Later improvements:

- move app persistence from SQLite to Postgres
- add a real queue/worker service
- make Presenton internal-only and proxy editor access if needed
