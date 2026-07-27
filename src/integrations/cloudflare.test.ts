import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUDFLARE_CRAWLER_METADATA,
  CloudflareCrawler,
  CloudflareProviderError,
} from "./cloudflare";

const crawlRequest = {
  websiteUrl: "https://target.example.com",
  requestedFormats: ["markdown" as const],
};

function jsonResponse(body: unknown, status = 200, browserMilliseconds?: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(browserMilliseconds === undefined
        ? {}
        : { "X-Browser-Ms-Used": String(browserMilliseconds) }),
    },
  });
}

test("CloudflareCrawler validates every envelope and returns retained crawl records", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) return jsonResponse({ success: true, result: "job-1" }, 200, 100);
    if (callCount === 2) {
      return jsonResponse({ success: true, result: { status: "completed" } }, 200, 200);
    }
    return jsonResponse({
      success: true,
      result: {
        status: "completed",
        records: [{
          url: "https://target.example.com/?token=transient#section",
          status: "completed",
          markdown: "# Target",
          metadata: { status: 200, title: "Target" },
        }],
      },
    }, 200, 300);
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 0,
      pollDelayMs: 0,
    });
    const observations: unknown[] = [];
    const result = await crawler.crawlSite(crawlRequest, {
      onObservability: (value) => observations.push(value),
    });

    assert.equal(crawler.providerId, CLOUDFLARE_CRAWLER_METADATA.providerId);
    assert.equal(result.rawJobId, "job-1");
    assert.equal(result.status, "completed");
    assert.deepEqual(result.pages, [{
      url: "https://target.example.com/",
      title: "Target",
      html: undefined,
      markdown: "# Target",
      statusCode: 200,
    }]);
    assert.equal(callCount, 3);
    assert.deepEqual(observations, [
      {
        usage: [{ metric: "browser_time", unit: "milliseconds", amount: 100 }],
      },
      {
        usage: [{ metric: "browser_time", unit: "milliseconds", amount: 500 }],
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler normalizes target URLs before forwarding them", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedBody = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    forwardedBody = String(init?.body ?? "");
    return jsonResponse({ success: true, result: "job-normalized" });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 0,
    });
    await crawler.startCrawl({
      ...crawlRequest,
      websiteUrl: "https://target.example.com/path?token=secret#fragment",
    });
    assert.equal(
      (JSON.parse(forwardedBody) as { url: string }).url,
      "https://target.example.com/path",
    );

    await assert.rejects(
      crawler.startCrawl({
        ...crawlRequest,
        websiteUrl: "https://user:password@target.example.com/private",
      }),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "client_request"
        && error.retryable === false
        && !error.message.includes("password"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler rejects provider source URLs with embedded credentials", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) return jsonResponse({ success: true, result: "job-unsafe-url" });
    if (callCount === 2) {
      return jsonResponse({ success: true, result: { status: "completed" } });
    }
    return jsonResponse({
      success: true,
      result: {
        status: "completed",
        records: [{
          url: "https://user:password@target.example.com/private",
          status: "completed",
          markdown: "# Target",
        }],
      },
    });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 0,
      pollDelayMs: 0,
    });
    await assert.rejects(
      crawler.crawlSite(crawlRequest),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "contract"
        && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler does not retry authentication failures", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return jsonResponse({ error: "nope" }, 401);
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "secret-token",
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      crawler.crawlSite(crawlRequest),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "authentication"
        && error.status === 401
        && error.retryable === false
        && !error.message.includes("secret-token"),
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler does not replay an ambiguous start failure", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({}, 503)
      : jsonResponse({ success: true, result: "duplicate-job" });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 1,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      crawler.crawlSite(crawlRequest),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "provider_unavailable"
        && error.retryable === true,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler retries an explicit start rate limit", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) return jsonResponse({}, 429);
    if (callCount === 2) return jsonResponse({ success: true, result: "job-rate-limit" });
    if (callCount === 3) {
      return jsonResponse({ success: true, result: { status: "completed" } });
    }
    return jsonResponse({ success: true, result: { status: "completed", records: [] } });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 1,
      retryBaseDelayMs: 0,
      pollDelayMs: 0,
    });
    const result = await crawler.crawlSite(crawlRequest);
    assert.equal(result.rawJobId, "job-rate-limit");
    assert.equal(callCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler rejects malformed success envelopes without retrying", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return jsonResponse({ success: true, result: {} });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      crawler.crawlSite(crawlRequest),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "contract"
        && error.retryable === false,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler recognizes documented cancelled job states", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({ success: true, result: "job-cancelled" })
      : jsonResponse({
          success: true,
          result: { status: "cancelled_due_to_limits" },
        });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 0,
    });
    await assert.rejects(
      crawler.crawlSite(crawlRequest),
      (error: unknown) =>
        error instanceof CloudflareProviderError
        && error.code === "job_failed"
        && error.retryable === false,
    );
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler bounds retained records and text to the requested crawl scope", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  // Three-byte text makes the 64 KiB boundary land inside a code point.
  const largeMarkdown = "€".repeat(500_000);
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) return jsonResponse({ success: true, result: "job-bounded" });
    if (callCount === 2) {
      return jsonResponse({ success: true, result: { status: "completed" } });
    }
    return jsonResponse({
      success: true,
      result: {
        status: "completed",
        cursor: "provider-has-more",
        records: [1, 2, 3].map((index) => ({
          url: `https://target.example.com/${index}`,
          status: "completed",
          markdown: largeMarkdown,
          html: largeMarkdown,
          metadata: { status: 200, title: `Page ${index}` },
        })),
      },
    });
  }) as typeof fetch;

  try {
    const crawler = new CloudflareCrawler({
      accountId: "account_1",
      apiToken: "token-value",
      maxRetries: 0,
      pollDelayMs: 0,
    });
    const result = await crawler.crawlSite({ ...crawlRequest, maxPages: 2 });

    assert.equal(result.pages.length, 2);
    assert.equal(result.discoveredUrls.length, 2);
    assert.ok(result.pages.every((page) => page.html === undefined));
    assert.ok(result.pages.every(
      (page) => Buffer.byteLength(page.markdown ?? "", "utf8") <= 64 * 1024,
    ));
    assert.ok(result.pages.every((page) => !(page.markdown ?? "").includes("�")));
    assert.ok(
      result.pages.reduce(
        (total, page) => total + Buffer.byteLength(page.markdown ?? "", "utf8"),
        0,
      ) <= 256 * 1024,
    );
    assert.equal(callCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudflareCrawler constructor errors never echo credentials", () => {
  const secret = "must-not-appear";
  assert.throws(
    () => new CloudflareCrawler({ accountId: "invalid/account", apiToken: secret }),
    (error: unknown) =>
      error instanceof TypeError
      && error.message === "Cloudflare crawler configuration is invalid."
      && !error.message.includes(secret),
  );
});
