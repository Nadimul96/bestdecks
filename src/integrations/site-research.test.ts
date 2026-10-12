import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ProviderCallObservability } from "@/src/domain/provider-observability";

import { extractReadableDocument } from "./html-text";
import { ProviderAdapterError } from "./provider-contract";
import { selectPassages, SITE_RESEARCH_METADATA, SiteResearchProvider } from "./site-research";
import {
  fixtureResolver,
  fixtureTransport,
  readWebFixture,
  type FixtureRoute,
} from "./web-fixture.test-helper";

const SITE = "https://northwind.example.com";
const API_KEY = "fixture-gemini-key-not-real";

// Hand-authored in the documented generateContent response shape. It includes
// one sentence with a number the passages do not contain (3,400 stores) and
// one unlabeled sentence, to exercise the summary hygiene rules.
const summaryFixture = JSON.parse(readFileSync(
  new URL("./fixtures/gemini/site-research-summary.json", import.meta.url),
  "utf8",
)) as unknown;

const request = {
  websiteUrl: `${SITE}/`,
  companyName: "Northwind Freight",
  sellerPositioningSummary: "Seller builds route-optimization software.",
  requestedSignals: ["recent activity", "buyer signals", "observable proof points"],
};

function routes(overrides: Record<string, FixtureRoute> = {}): Record<string, FixtureRoute> {
  return {
    [`${SITE}/robots.txt`]: { file: "northwind-robots.txt", contentType: "text/plain" },
    [`${SITE}/`]: { file: "northwind-home.html" },
    [`${SITE}/about`]: { file: "northwind-about.html" },
    [`${SITE}/customers`]: { file: "northwind-customers.html" },
    [`${SITE}/news/feed.xml`]: { file: "northwind-news-feed.xml", contentType: "application/rss+xml" },
    ...overrides,
  };
}

async function withGemini<T>(
  responses: Array<{ status: number; body: unknown }>,
  run: (calls: Array<{ url: string; headers: Headers; body: string }>) => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers; body: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: String(init?.body) });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function provider(transportRoutes = routes(), options: { retryBaseDelayMs?: number } = {}) {
  const { transport, requests } = fixtureTransport(transportRoutes);
  return {
    requests,
    research: new SiteResearchProvider(API_KEY, {
      transport,
      resolver: fixtureResolver(),
      retryBaseDelayMs: options.retryBaseDelayMs ?? 0,
    }),
  };
}

test("site research retains verbatim first-party passages keyed by canonical URL", async () => {
  const { research, requests } = provider();
  const observed: ProviderCallObservability[] = [];

  const result = await withGemini([{ status: 200, body: summaryFixture }], () =>
    research.enrichCompany(request, { onObservability: (value) => observed.push(value) })
  );

  assert.deepEqual(result.evidence.map((item) => item.url), [
    `${SITE}/`,
    `${SITE}/customers`,
    `${SITE}/about`,
    `${SITE}/news/feed.xml`,
  ]);

  // The evidence gate depends on this: every retained passage is copied
  // from the readable text of the URL it is attributed to.
  for (const [url, fixture] of [
    [`${SITE}/`, "northwind-home.html"],
    [`${SITE}/customers`, "northwind-customers.html"],
    [`${SITE}/about`, "northwind-about.html"],
  ] as const) {
    const pageText = extractReadableDocument(readWebFixture(fixture), url).text;
    const item = result.evidence.find((entry) => entry.url === url)!;
    for (const passage of item.snippet.split("\n\n")) {
      assert.ok(pageText.includes(passage), `${url} passage must be verbatim: ${passage}`);
    }
  }
  assert.ok(result.evidence[1]!.snippet.includes("cut produce shrink by 18%"));
  assert.ok(result.evidence[3]!.snippet.includes(
    "The Omaha site adds 120,000 square feet of temperature-controlled capacity.",
  ));

  // Signal pages only: the news index 404s, subdomains and query links are skipped.
  assert.equal(requests.some((entry) => entry.url.includes("careers.")), false);
  assert.equal(requests.some((entry) => entry.url.includes("?ref=")), false);
  assert.equal(observed.at(-1)?.usage?.[0]?.metric, "http_requests");
});

test("site research summary drops unsupported numbers and labels every sentence", async () => {
  const { research } = provider();
  const result = await withGemini([{ status: 200, body: summaryFixture }], () =>
    research.enrichCompany(request)
  );

  assert.equal(result.synthesizedSummary.includes("3,400"), false);
  assert.ok(result.synthesizedSummary.includes("[Inference] The company emphasizes temperature telemetry."));
  assert.ok(result.synthesizedSummary.includes("[Sourced] Prairie Fresh Markets cut produce shrink by 18%"));
  assert.ok(result.synthesizedSummary.includes("[Unknown] The passages do not describe current hiring."));
  assert.equal(result.confidence, "high");
});

test("site research calls Gemini without search grounding and keeps the key out of the body", async () => {
  const { research } = provider();
  await withGemini([{ status: 200, body: summaryFixture }], async (calls) => {
    await research.enrichCompany(request);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `https://generativelanguage.googleapis.com/v1beta/models/${SITE_RESEARCH_METADATA.defaultModelId}:generateContent`,
    );
    assert.equal(calls[0]!.headers.get("x-goog-api-key"), API_KEY);
    const body = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    assert.equal("tools" in body, false);
    assert.equal(calls[0]!.body.includes(API_KEY), false);
    assert.ok(calls[0]!.body.includes("BEGIN_UNTRUSTED_INPUT"));
    assert.ok(calls[0]!.body.includes("cut produce shrink by 18%"));
  });
});

test("site research skips Gemini entirely when no first-party page is retrievable", async () => {
  const { research } = provider({ [`${SITE}/robots.txt`]: { status: 503 } });
  await withGemini([{ status: 200, body: summaryFixture }], async (calls) => {
    const result = await research.enrichCompany(request);
    assert.equal(calls.length, 0);
    assert.deepEqual(result.evidence, []);
    assert.equal(result.confidence, "low");
    assert.match(result.synthesizedSummary, /^\[Unknown\]/u);
  });
});

test("site research retries only explicit rate limits and never leaks the key", async () => {
  const limited = provider();
  await withGemini([{ status: 429, body: {} }, { status: 200, body: summaryFixture }], async (calls) => {
    await limited.research.enrichCompany(request);
    assert.equal(calls.length, 2);
  });

  const invalidKey = {
    error: {
      message: API_KEY,
      status: "INVALID_ARGUMENT",
      details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
    },
  };
  for (const [status, code, body] of [
    [401, "authentication", { error: { message: API_KEY } }],
    // Gemini reports an invalid key as HTTP 400, not 401.
    [400, "authentication", invalidKey],
    [400, "client_request", { error: { message: API_KEY, status: "INVALID_ARGUMENT" } }],
    [500, "provider_unavailable", { error: { message: API_KEY } }],
  ] as const) {
    const { research } = provider();
    await withGemini([{ status, body }], async (calls) => {
      await assert.rejects(research.enrichCompany(request), (error: unknown) => {
        assert.ok(error instanceof ProviderAdapterError);
        assert.equal(error.code, code);
        assert.equal(error.message.includes(API_KEY), false);
        return true;
      });
      assert.equal(calls.length, 1);
    });
  }
});

test("site research rejects invalid configuration without echoing it", () => {
  assert.throws(() => new SiteResearchProvider(""), (error: unknown) =>
    error instanceof TypeError && !error.message.includes("key")
  );
  assert.throws(() => new SiteResearchProvider(API_KEY, { model: "../escape" }), TypeError);
});

test("passage selection keeps whole paragraphs in document order within budget", () => {
  const text = [
    "# Heading",
    "Short.",
    "Our platform serves 200 customers across retail and logistics in North America.",
    "A paragraph about nothing in particular that still meets the minimum length.",
    "We launched a partnership with three regional grocers last spring to expand.",
  ].join("\n\n");
  const selected = selectPassages(text, 160);
  assert.equal(
    selected,
    "Our platform serves 200 customers across retail and logistics in North America.\n\nWe launched a partnership with three regional grocers last spring to expand.",
  );
});
