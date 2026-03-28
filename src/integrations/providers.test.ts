import test from "node:test";
import assert from "node:assert/strict";

import {
  crawlWithFallback,
  type CrawlProvider,
  type CrawlRequest,
} from "./providers";

const request: CrawlRequest = {
  websiteUrl: "https://example.com",
  requestedFormats: ["markdown"],
};

test("crawlWithFallback returns primary results when crawl succeeds", async () => {
  let fallbackCalled = false;

  const primary: CrawlProvider = {
    name: "cloudflare",
    async crawlSite() {
      return {
        provider: "cloudflare",
        pages: [{ url: request.websiteUrl, markdown: "# Example" }],
        blockedUrls: [],
        discoveredUrls: [request.websiteUrl],
      };
    },
  };

  const fallback: CrawlProvider = {
    name: "deepcrawl",
    async crawlSite() {
      fallbackCalled = true;
      throw new Error("should not run");
    },
  };

  const result = await crawlWithFallback(request, primary, fallback);

  assert.equal(result.provider, "cloudflare");
  assert.equal(fallbackCalled, false);
});

test("crawlWithFallback uses fallback when the primary crawler throws", async () => {
  const primary: CrawlProvider = {
    name: "cloudflare",
    async crawlSite() {
      throw new Error("primary failed");
    },
  };

  const fallback: CrawlProvider = {
    name: "deepcrawl",
    async crawlSite() {
      return {
        provider: "deepcrawl",
        pages: [{ url: request.websiteUrl, markdown: "# Example" }],
        blockedUrls: [],
        discoveredUrls: [request.websiteUrl],
      };
    },
  };

  const result = await crawlWithFallback(request, primary, fallback);

  assert.equal(result.provider, "deepcrawl");
});
