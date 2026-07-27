import assert from "node:assert/strict";
import test from "node:test";

import {
  DEEPCRAWL_CRAWLER_METADATA,
  DeepcrawlCrawler,
} from "./deepcrawl";
import { ProviderAdapterError } from "./provider-contract";
import type { CrawlRequest } from "./providers";

const crawlRequest: CrawlRequest = {
  websiteUrl: "https://example.com/?token=private#fragment",
  maxPages: 2,
  requestedFormats: ["markdown"],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertProviderError(
  error: unknown,
  code: ProviderAdapterError["code"],
  status?: number,
) {
  assert.ok(error instanceof ProviderAdapterError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
}

test("DeepcrawlCrawler exposes stable experimental metadata and validates config offline", () => {
  assert.equal(DEEPCRAWL_CRAWLER_METADATA.providerId, "deepcrawl.read-links.crawl");
  assert.equal(DEEPCRAWL_CRAWLER_METADATA.modelId, null);
  assert.equal(DEEPCRAWL_CRAWLER_METADATA.contractVersion, 1);
  assert.equal(DEEPCRAWL_CRAWLER_METADATA.releaseStatus, "experimental");

  const configured = new DeepcrawlCrawler({ apiKey: "<deepcrawl-api-key>" });
  assert.equal(configured.providerId, DEEPCRAWL_CRAWLER_METADATA.providerId);
  assert.deepEqual(configured.capabilities, DEEPCRAWL_CRAWLER_METADATA.capabilities);

  assert.throws(() => new DeepcrawlCrawler({ apiKey: "" }), (error: unknown) => {
    assertProviderError(error, "configuration");
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /deepcrawl-api-key/u);
    return true;
  });
  assert.throws(
    () => new DeepcrawlCrawler({
      apiKey: "<deepcrawl-api-key>",
      baseUrl: "https://attacker.example",
    }),
    (error: unknown) => assertProviderError(error, "configuration"),
  );
});

test("DeepcrawlCrawler validates, bounds, and minimizes request and source URLs", async () => {
  const originalFetch = globalThis.fetch;
  const requestedTargets: string[] = [];
  let observabilityCalls = 0;
  globalThis.fetch = (async (input) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL ? input.toString() : input.url,
    );
    const target = url.searchParams.get("url");
    assert.ok(target);
    requestedTargets.push(target);

    if (url.pathname === "/links") {
      return jsonResponse({
        links: [
          "https://example.com/about?tracking=1#team",
          "https://example.com/about?tracking=2",
        ],
      });
    }
    return jsonResponse({
      url: `${target}?tracking=provider#fragment`,
      title: "Example",
      markdown: "# Example",
    });
  }) as typeof fetch;

  try {
    const crawler = new DeepcrawlCrawler({ apiKey: "<deepcrawl-api-key>" });
    const result = await crawler.crawlSite(crawlRequest, {
      onObservability: () => {
        observabilityCalls += 1;
      },
    });

    assert.equal(result.pages.length, 2);
    assert.deepEqual(result.discoveredUrls, [
      "https://example.com/",
      "https://example.com/about",
    ]);
    assert.deepEqual(result.pages.map(({ url }) => url), [
      "https://example.com/",
      "https://example.com/about",
    ]);
    assert.deepEqual(requestedTargets, [
      "https://example.com/",
      "https://example.com/",
      "https://example.com/about",
    ]);
    assert.equal(observabilityCalls, 0, "Deepcrawl exposes no documented usage value");
    assert.doesNotMatch(JSON.stringify(result), /token=private|tracking=|#fragment/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepcrawlCrawler classifies every required HTTP failure with bounded GET retries", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    [401, "authentication"],
    [403, "authorization"],
    [408, "timeout"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const;

  try {
    for (const [status, code] of cases) {
      let attempts = 0;
      globalThis.fetch = (async () => {
        attempts += 1;
        return new Response("provider-controlled diagnostic", { status });
      }) as typeof fetch;
      const crawler = new DeepcrawlCrawler({
        apiKey: "<deepcrawl-api-key>",
        maxRetries: 0,
      });
      await assert.rejects(
        () => crawler.crawlSite(crawlRequest),
        (error: unknown) => {
          assertProviderError(error, code, status);
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /provider-controlled diagnostic/u);
          return true;
        },
      );
      assert.equal(attempts, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepcrawlCrawler rejects empty, malformed, and schema-invalid responses", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    ["", "empty_response"],
    ["{", "malformed_response"],
    [JSON.stringify({ links: [], unexpected: true }), "malformed_response"],
  ] as const;

  try {
    for (const [body, code] of cases) {
      globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
      const crawler = new DeepcrawlCrawler({ apiKey: "<deepcrawl-api-key>" });
      await assert.rejects(
        () => crawler.crawlSite(crawlRequest),
        (error: unknown) => assertProviderError(error, code),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepcrawlCrawler propagates AbortSignal to provider requests", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async (_input, init) => {
    attempts += 1;
    assert.equal(init?.signal?.aborted, true);
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch;

  try {
    const crawler = new DeepcrawlCrawler({ apiKey: "<deepcrawl-api-key>" });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => crawler.crawlSite(crawlRequest, { signal: controller.signal }),
      (error: unknown) => assertProviderError(error, "aborted"),
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
