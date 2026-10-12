import assert from "node:assert/strict";
import test from "node:test";

import { selectReferenceProviders } from "./provider-selection";

test("new installs default to the free crawl and research path", () => {
  assert.deepEqual(
    selectReferenceProviders({ cloudflareConfigured: false, perplexityConfigured: false }),
    {
      crawl: { provider: "builtin", reason: "free_default" },
      research: { provider: "site", reason: "free_default" },
    },
  );
});

test("existing paid credentials keep their adapters until a choice is explicit", () => {
  assert.deepEqual(
    selectReferenceProviders({ cloudflareConfigured: true, perplexityConfigured: true }),
    {
      crawl: { provider: "cloudflare", reason: "existing_credentials" },
      research: { provider: "perplexity", reason: "existing_credentials" },
    },
  );
  assert.deepEqual(
    selectReferenceProviders({
      crawlProvider: "builtin",
      researchProvider: "site",
      cloudflareConfigured: true,
      perplexityConfigured: true,
    }),
    {
      crawl: { provider: "builtin", reason: "explicit" },
      research: { provider: "site", reason: "explicit" },
    },
  );
});

test("an explicit paid choice is honored even before its credentials exist", () => {
  const selection = selectReferenceProviders({
    crawlProvider: "cloudflare",
    researchProvider: "perplexity",
    cloudflareConfigured: false,
    perplexityConfigured: false,
  });
  assert.equal(selection.crawl.provider, "cloudflare");
  assert.equal(selection.research.provider, "perplexity");
});
