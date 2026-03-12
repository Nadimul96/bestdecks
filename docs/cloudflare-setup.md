# Cloudflare Setup

Cloudflare Browser Rendering does require credentials. The `/crawl` endpoint is not anonymous.

## What you need

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## Required permission

Create a custom API token with:

- `Browser Rendering - Edit`

This comes from Cloudflare's Browser Rendering REST API docs and general token-creation docs.

## How to get the account ID

According to Cloudflare Fundamentals:

1. Log in to the Cloudflare dashboard.
2. Go to Account home and locate the account you want to use.
3. Copy the Account ID from the account menu or the API section.

Cloudflare also documents that you can find the Account ID in Workers & Pages under Account details.

## How to create the API token

According to Cloudflare's API token docs:

1. Open the Cloudflare dashboard.
2. Go to `My Profile > API Tokens` for a user token, or `Manage Account > API Tokens` for an account token.
3. Select `Create Token`.
4. Create a custom token.
5. Add the permission `Browser Rendering - Edit`.
6. Scope the token to the specific account you want the app to use.
7. Create the token and copy the value once.

## Why this is required

Cloudflare's Browser Rendering REST API docs explicitly say:

- create a custom API token before using the REST API
- use `Authorization: Bearer <apiToken>`
- call account-scoped endpoints under `/accounts/{account_id}/browser-rendering/...`

## Recommended environment variables

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_browser_rendering_token
```

## Verification

After setting both variables:

```bash
pnpm smoke:cloudflare
```

## References

- https://developers.cloudflare.com/browser-rendering/rest-api/
- https://developers.cloudflare.com/browser-rendering/rest-api/crawl-endpoint/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
