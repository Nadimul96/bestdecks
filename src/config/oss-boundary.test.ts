import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("the OSS workspace has no hosted credit or checkout contract", () => {
  const businessContext = read("lib/business-context.tsx");
  assert.doesNotMatch(
    businessContext,
    /\/api\/credits|refreshCredits|UserCredits|monthlyAllowance|planTier/,
  );

  const workspaceSurface = [
    "components/workspace-header.tsx",
    "components/workspace/views/overview-view.tsx",
    "components/workspace/views/pipeline-view.tsx",
    "components/workspace/views/structure-view.tsx",
    "components/workspace/views/target-intake-view.tsx",
    "components/command-menu.tsx",
    "components/nav-user.tsx",
    "lib/workspace-navigation.ts",
  ]
    .map(read)
    .join("\n");

  assert.doesNotMatch(
    workspaceSurface,
    /CreditCard|CreditCounter|insufficientCredits|VISUAL_CREDIT_COST|credit_refund|>\s*Billing\s*</,
  );
  assert.equal(existsSync(resolve(root, "components/credit-counter.tsx")), false);

  const pricing = read("components/workspace/views/pricing-view.tsx");
  assert.doesNotMatch(pricing, /api\/stripe|handleCheckout|\$\d+|Buy now|Upgrade/);

  for (const route of [
    "app/api/credits/route.ts",
    "app/api/stripe/checkout/route.ts",
    "app/api/stripe/webhook/route.ts",
    "app/api/referral/apply/route.ts",
  ]) {
    assert.equal(existsSync(resolve(root, route)), false, `${route} is cloud-only`);
  }

  const database = read("src/server/db.ts");
  assert.doesNotMatch(database, /CREATE TABLE IF NOT EXISTS user_credits/);
  assert.doesNotMatch(database, /ensureColumn\(c, "(?:user_credits|runs)", "(?:stripe_|plan_tier|monthly_allowance|bonus_credits|reset_date|credits_charged)/);
});

test("shared schemas expose neither hosted credits nor synthetic deck scores", () => {
  const schemas = read("src/domain/schemas.ts");
  const workspaceTypes = read("lib/workspace-types.ts");

  assert.doesNotMatch(
    `${schemas}\n${workspaceTypes}`,
    /deckScore|DeckScore|userCredits|UserCredits|planTierSchema|aiModelSchema/,
  );
});

test("seller context exposes input completion without a synthetic strength claim", () => {
  const schemas = read("src/domain/schemas.ts");
  const sellerContextView = read("components/workspace/views/seller-context-view.tsx");

  assert.match(schemas, /computeSellerContextCompletion/);
  assert.match(sellerContextView, /Seller context coverage/);
  assert.match(sellerContextView, /Tracks input presence only; it does not predict results\./);
  assert.doesNotMatch(
    `${schemas}\n${sellerContextView}`,
    /computeOfferStrengthScore|Offer Strength|\/10 strength|Better input = better decks/,
  );
});

test("the Docker build context excludes local agent and tool state", () => {
  const ignored = new Set(
    read(".dockerignore")
      .split(/\r?\n/u)
      .map((line) => line.trim().replace(/\/$/u, ""))
      .filter((line) => line && !line.startsWith("#")),
  );

  for (const directory of [".agents", ".claude", ".codex", ".firecrawl", ".pnpm-store", ".vercel"]) {
    assert.equal(ignored.has(directory), true, `${directory} must stay outside the Docker context`);
  }
});

test("production builds verify that standalone output excludes operator state", () => {
  const nextConfig = read("next.config.ts");
  const verifier = read("scripts/check-standalone-boundary.mjs");
  const ci = read(".github/workflows/ci.yml");

  assert.match(nextConfig, /outputFileTracingExcludes/);
  for (const boundary of [".data", "app_data", ".env", ".git", ".agents", ".codex"]) {
    assert.equal(nextConfig.includes(boundary), true, `${boundary} must be excluded from tracing`);
    assert.equal(verifier.includes(boundary), true, `${boundary} must be rejected after build`);
  }
  assert.match(ci, /Verify the standalone runtime boundary/);
  assert.match(ci, /pnpm verify:standalone/);
  assert.match(verifier, /realpath\(absolutePath\)/);
  assert.match(verifier, /expectedLibsqlNativePackage/);

  const dockerfile = read("deploy/app/Dockerfile");
  assert.match(dockerfile, /pnpm build \\/);
  assert.match(dockerfile, /&& pnpm verify:standalone/);
  assert.match(
    dockerfile,
    /check-standalone-boundary\.mjs --root \/app/,
  );
});

test("production builds keep native libSQL packages outside the Webpack bundle", () => {
  const nextConfig = read("next.config.ts");

  assert.match(nextConfig, /serverExternalPackages/);
  assert.match(nextConfig, /outputFileTracingIncludes/);
  assert.match(nextConfig, /libsql@\*\/node_modules\/@libsql\/\*\/index\.node/);
  for (const packageName of ["@libsql/client", "@libsql/kysely-libsql", "libsql"]) {
    assert.equal(nextConfig.includes(`"${packageName}"`), true, packageName);
  }
});

test("self-hosted Presenton is digest-pinned and isolated as a render-only service", () => {
  const helper = read("scripts/start-presenton.sh");
  const compose = read("deploy/docker-compose.prod.yml");
  const presentonService = compose.match(/\n  presenton:\n(?<body>[\s\S]*?)\n  caddy:/u)?.groups?.body;

  assert.match(helper, /@sha256:\[0-9a-f\]\{64\}\$/);
  assert.doesNotMatch(helper, /!= \*@sha256:\*/);
  assert.match(helper, /docker network inspect/);
  assert.match(helper, /--internal/);
  assert.match(helper, /\.Internal/);
  assert.match(helper, /127\.0\.0\.1:\$\{PRESENTON_PORT\}:80/);
  assert.match(helper, /CAN_CHANGE_KEYS="true"/);
  assert.match(helper, /LLM="openai"/);
  assert.match(helper, /DISABLE_IMAGE_GENERATION="true"/);
  assert.match(helper, /PRESENTON_AUTH_USERNAME:\?/);
  assert.match(helper, /PRESENTON_AUTH_PASSWORD:\?/);
  assert.doesNotMatch(helper, /-e\s+OPENAI_(?:API_KEY|MODEL)/);
  assert.match(helper, /OPENAI_API_KEY=\*\|OPENAI_MODEL=\*/);
  assert.doesNotMatch(helper, /^\s*(?:source|\.)\s+/mu);
  assert.doesNotMatch(helper, /docker\s+(?:container\s+)?rm|--network\s+host/);

  assert.ok(presentonService, "the production Compose file must define Presenton");
  assert.match(presentonService, /CAN_CHANGE_KEYS:\s*"true"/);
  assert.match(presentonService, /LLM:\s*openai/);
  assert.match(presentonService, /AUTH_USERNAME:/);
  assert.match(presentonService, /AUTH_PASSWORD:/);
  assert.match(presentonService, /DISABLE_IMAGE_GENERATION:\s*"true"/);
  assert.match(presentonService, /networks:\s*\n\s*- backend/);
  assert.doesNotMatch(presentonService, /OPENAI_API_KEY|OPENAI_MODEL/);
  assert.doesNotMatch(presentonService, /\n\s*-\s+provider-egress\s*(?:\n|$)/u);

  assert.match(compose, /backend:\s*\n\s*internal:\s*true/);
  assert.match(read(".env.example"), /PRESENTON_TEMPLATE=bestdecks_inline_vector_v1/);
  assert.match(read(".env.production.example"), /PRESENTON_TEMPLATE=bestdecks_inline_vector_v1/);
});
