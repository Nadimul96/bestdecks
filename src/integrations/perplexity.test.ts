import assert from "node:assert/strict";
import test from "node:test";

import {
  PERPLEXITY_ENRICHMENT_METADATA,
  PerplexityEnrichmentProvider,
  PerplexityProviderError,
} from "./perplexity";

const enrichmentRequest = {
  websiteUrl: "https://target.example.com",
  companyName: "Target Co",
  sellerPositioningSummary: "Research-backed decks",
  requestedSignals: ["recent activity"],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validResponse() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          synthesizedSummary: "Target Co publishes workflow guidance.",
          confidence: "high",
        }),
      },
    }],
    search_results: [{
      title: "Target guidance",
      url: "https://target.example.com/guidance?token=transient#details",
      snippet: "Workflow guidance",
    }],
    citations: [
      "https://target.example.com/guidance",
      "https://news.example.com/target?utm_source=provider#story",
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      citation_tokens: 8,
      num_search_queries: 2,
      reasoning_tokens: 4,
      cost: {
        total_cost: 0.01,
      },
    },
  };
}

test("Perplexity retains search results and citation-only sources", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return jsonResponse(validResponse());
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 0,
    });
    const observations: unknown[] = [];
    const result = await provider.enrichCompany(enrichmentRequest, {
      onObservability: (value) => observations.push(value),
    });

    assert.equal(provider.providerId, PERPLEXITY_ENRICHMENT_METADATA.providerId);
    assert.equal(provider.modelId, "sonar-pro");
    assert.equal(requestedUrl, "https://api.perplexity.ai/v1/sonar");
    const parsedRequest = JSON.parse(requestBody) as {
      response_format: { json_schema: Record<string, unknown> };
    };
    assert.equal("strict" in parsedRequest.response_format.json_schema, false);
    assert.equal("name" in parsedRequest.response_format.json_schema, false);
    assert.equal(result.synthesizedSummary, "[Inference] Target Co publishes workflow guidance.");
    assert.equal(result.confidence, "high");
    assert.deepEqual(result.evidence.map((item) => item.url), [
      "https://target.example.com/guidance",
      "https://news.example.com/target",
    ]);
    assert.deepEqual(observations, [{
      usage: [
        { metric: "input_tokens", unit: "tokens", amount: 120 },
        { metric: "output_tokens", unit: "tokens", amount: 30 },
        { metric: "total_tokens", unit: "tokens", amount: 150 },
        { metric: "citation_tokens", unit: "tokens", amount: 8 },
        { metric: "reasoning_tokens", unit: "tokens", amount: 4 },
        { metric: "search_queries", unit: "queries", amount: 2 },
      ],
    }]);
    assert.equal("cost" in (observations[0] as Record<string, unknown>), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity rejects provider source URLs with embedded credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({
    ...validResponse(),
    search_results: [{
      title: "Unsafe source",
      url: "https://user:password@target.example.com/private",
      snippet: "Unsafe",
    }],
  })) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 0,
    });
    await assert.rejects(
      provider.enrichCompany(enrichmentRequest),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "contract"
        && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity normalizes request URLs before forwarding them", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  let fetchCount = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    fetchCount += 1;
    requestBody = String(init?.body ?? "");
    return jsonResponse(validResponse());
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 0,
    });
    await provider.enrichCompany({
      ...enrichmentRequest,
      websiteUrl: "https://target.example.com/path?token=secret#fragment",
    });
    assert.match(requestBody, /Target website: https:\/\/target\.example\.com\/path/u);
    assert.doesNotMatch(requestBody, /token=secret|fragment/u);

    await assert.rejects(
      provider.enrichCompany({
        ...enrichmentRequest,
        websiteUrl: "https://user:password@target.example.com/private",
      }),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "client_request"
        && error.retryable === false
        && !error.message.includes("password"),
    );
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity does not retry 401 and does not expose its key", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return jsonResponse({}, 401);
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("secret-key", undefined, {
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      provider.enrichCompany(enrichmentRequest),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "authentication"
        && error.retryable === false
        && !error.message.includes("secret-key"),
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity does not replay an ambiguous 5xx generation", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return callCount === 1 ? jsonResponse({}, 503) : jsonResponse(validResponse());
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 1,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      provider.enrichCompany(enrichmentRequest),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "provider_unavailable"
        && error.retryable === true,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity retries an explicit rate limit", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return callCount === 1 ? jsonResponse({}, 429) : jsonResponse(validResponse());
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 1,
      retryBaseDelayMs: 0,
    });
    await provider.enrichCompany(enrichmentRequest);
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity rejects malformed model JSON as nonretryable", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return jsonResponse({ choices: [{ message: { content: "not json" } }] });
  }) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      provider.enrichCompany(enrichmentRequest),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "contract"
        && error.retryable === false,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity marks uncited enrichment low confidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          synthesizedSummary: "[Unknown] No source-backed activity was found.",
          confidence: "high",
        }),
      },
    }],
  })) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 0,
    });
    const result = await provider.enrichCompany(enrichmentRequest);
    assert.equal(result.confidence, "low");
    assert.deepEqual(result.evidence, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity rejects a metric absent from retained search evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          synthesizedSummary: "[Sourced] Target Co grew 47%.",
          confidence: "high",
        }),
      },
    }],
    search_results: [{
      title: "Target update",
      url: "https://target.example.com/update",
      snippet: "Target published a company update.",
    }],
  })) as typeof fetch;

  try {
    const provider = new PerplexityEnrichmentProvider("api-key", undefined, {
      maxRetries: 0,
    });
    await assert.rejects(
      provider.enrichCompany(enrichmentRequest),
      (error: unknown) =>
        error instanceof PerplexityProviderError
        && error.code === "unsupported_claim",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Perplexity validates model configuration without echoing the API key", () => {
  const secret = "must-not-appear";
  assert.throws(
    () => new PerplexityEnrichmentProvider(secret, "unknown-model"),
    (error: unknown) =>
      error instanceof TypeError
      && error.message === "Perplexity enrichment configuration is invalid."
      && !error.message.includes(secret),
  );
});

test("Perplexity rejects reasoning-prefixed models outside the JSON contract", () => {
  for (const model of ["sonar-reasoning-pro", "sonar-deep-research"]) {
    assert.throws(
      () => new PerplexityEnrichmentProvider("api-key", model),
      (error: unknown) =>
        error instanceof TypeError
        && error.message === "Perplexity enrichment configuration is invalid.",
    );
  }
});
