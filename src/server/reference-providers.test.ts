import assert from "node:assert/strict";
import test from "node:test";

import { selectReferenceProviders } from "@/src/config/provider-selection";
import { BUILTIN_CRAWLER_METADATA } from "@/src/integrations/builtin-crawler";
import { CLOUDFLARE_CRAWLER_METADATA } from "@/src/integrations/cloudflare";
import { PERPLEXITY_ENRICHMENT_METADATA } from "@/src/integrations/perplexity";
import { SITE_RESEARCH_METADATA } from "@/src/integrations/site-research";

import { createCrawlAndResearchProviders } from "./reference-providers";

const free = selectReferenceProviders({ cloudflareConfigured: false, perplexityConfigured: false });
const paid = selectReferenceProviders({ cloudflareConfigured: true, perplexityConfigured: true });

test("the free path needs only a Gemini key", () => {
  const providers = createCrawlAndResearchProviders(free, { geminiApiKey: "gemini-fixture-key" });
  assert.equal(providers.ok, true);
  if (!providers.ok) return;
  assert.equal(providers.crawler.providerId, BUILTIN_CRAWLER_METADATA.providerId);
  assert.equal(providers.enrichmentProvider.providerId, SITE_RESEARCH_METADATA.providerId);
  assert.deepEqual(providers.configurationNames, ["crawl.builtin", "research.site"]);
  assert.deepEqual(providers.provenance.map(({ stage }) => stage), ["crawling", "enriching"]);

  assert.deepEqual(createCrawlAndResearchProviders(free, {}), { ok: false, missing: "gemini" });
});

test("paid adapters keep working and report exactly which credential is missing", () => {
  const providers = createCrawlAndResearchProviders(paid, {
    cloudflareAccountId: "account_123",
    cloudflareApiToken: "fixture-token",
    perplexityApiKey: "fixture-key",
  });
  assert.equal(providers.ok, true);
  if (!providers.ok) return;
  assert.equal(providers.crawler.providerId, CLOUDFLARE_CRAWLER_METADATA.providerId);
  assert.equal(providers.enrichmentProvider.providerId, PERPLEXITY_ENRICHMENT_METADATA.providerId);
  assert.ok(!JSON.stringify(providers.configurationNames).includes("fixture"));

  assert.deepEqual(
    createCrawlAndResearchProviders(paid, { cloudflareAccountId: "account_123", perplexityApiKey: "k" }),
    { ok: false, missing: "cloudflare" },
  );
  assert.deepEqual(
    createCrawlAndResearchProviders(paid, { cloudflareAccountId: "a", cloudflareApiToken: "t" }),
    { ok: false, missing: "perplexity" },
  );
});
