import test from "node:test";
import assert from "node:assert/strict";
import { PerplexityCommunityIntelProvider } from "./community-intel";

// ── Helpers ──────────────────────────────────────────

function mockFetch(response: unknown, status = 200) {
  const original = globalThis.fetch;
  let capturedBody: unknown;
  let capturedUrl: string | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
    return new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    restore: () => { globalThis.fetch = original; },
    getCapturedBody: () => capturedBody,
    getCapturedUrl: () => capturedUrl,
  };
}

const VALID_PARAMS = {
  industry: "SaaS",
  companyName: "Acme Corp",
  websiteUrl: "https://acme.com",
  sellerOffer: "We sell productivity tools",
};

// ── Tests ────────────────────────────────────────────

test("PerplexityCommunityIntelProvider parses valid JSON response", async () => {
  const resultPayload = {
    summary: "SaaS teams are frustrated with onboarding churn.",
    trendingPainPoints: ["Churn at day 7", "Pricing confusion"],
    industryTrends: ["PLG adoption", "AI-first demos"],
    communityBenchmarks: ["Average churn: 12%", "NPS 40+"],
    sources: ["Reddit r/SaaS", "X #saastwitter"],
  };

  const mock = mockFetch({
    choices: [{ message: { content: JSON.stringify(resultPayload) } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, resultPayload.summary);
    assert.deepEqual(result.trendingPainPoints, resultPayload.trendingPainPoints);
    assert.deepEqual(result.industryTrends, resultPayload.industryTrends);
    assert.deepEqual(result.communityBenchmarks, resultPayload.communityBenchmarks);
    assert.deepEqual(result.sources, resultPayload.sources);
    assert.equal(result.provider, "perplexity_community");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider handles JSON wrapped in markdown code blocks", async () => {
  const resultPayload = {
    summary: "Teams are exploring new tools.",
    trendingPainPoints: ["Cost"],
    industryTrends: ["AI"],
    communityBenchmarks: ["ROI 3x"],
    sources: ["Reddit r/tech"],
  };

  const wrappedContent = "```json\n" + JSON.stringify(resultPayload) + "\n```";

  const mock = mockFetch({
    choices: [{ message: { content: wrappedContent } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, resultPayload.summary);
    assert.equal(result.provider, "perplexity_community");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider returns empty result when no content", async () => {
  const mock = mockFetch({
    choices: [{ message: { content: null } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, "");
    assert.deepEqual(result.trendingPainPoints, []);
    assert.deepEqual(result.industryTrends, []);
    assert.deepEqual(result.communityBenchmarks, []);
    assert.deepEqual(result.sources, []);
    assert.equal(result.provider, "perplexity_community");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider returns empty result when choices array is empty", async () => {
  const mock = mockFetch({ choices: [] });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, "");
    assert.equal(result.provider, "perplexity_community");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider falls back to raw text on invalid JSON", async () => {
  const rawText = "This is not valid JSON but contains useful information about the industry.";

  const mock = mockFetch({
    choices: [{ message: { content: rawText } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, rawText);
    assert.deepEqual(result.trendingPainPoints, []);
    assert.equal(result.provider, "perplexity_community");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider truncates raw text fallback to 500 chars", async () => {
  const longText = "A".repeat(1000);

  const mock = mockFetch({
    choices: [{ message: { content: longText } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary.length, 500);
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider sends correct API request", async () => {
  const mock = mockFetch({
    choices: [{ message: { content: JSON.stringify({ summary: "ok", trendingPainPoints: [], industryTrends: [], communityBenchmarks: [], sources: [] }) } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("my-api-key", "sonar");
    await provider.gatherCommunityInsights(VALID_PARAMS);

    const body = mock.getCapturedBody() as Record<string, unknown>;
    assert.equal(body.model, "sonar");
    assert.equal(body.temperature, 0.3);
    assert.equal(body.search_mode, "auto");
    assert.ok(Array.isArray(body.messages));

    const url = mock.getCapturedUrl();
    assert.equal(url, "https://api.perplexity.ai/chat/completions");
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider omits companyName line when not provided", async () => {
  const mock = mockFetch({
    choices: [{ message: { content: JSON.stringify({ summary: "ok", trendingPainPoints: [], industryTrends: [], communityBenchmarks: [], sources: [] }) } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    await provider.gatherCommunityInsights({
      industry: "Fitness",
      websiteUrl: "https://gym.com",
      sellerOffer: "Fitness equipment",
    });

    const body = mock.getCapturedBody() as { messages: Array<{ content: string }> };
    const userContent = body.messages[1].content;
    assert.ok(!userContent.includes("Company context:"));
  } finally {
    mock.restore();
  }
});

test("PerplexityCommunityIntelProvider fills missing fields with defaults", async () => {
  const partialPayload = {
    summary: "Partial data",
    // Missing: trendingPainPoints, industryTrends, communityBenchmarks, sources
  };

  const mock = mockFetch({
    choices: [{ message: { content: JSON.stringify(partialPayload) } }],
  });

  try {
    const provider = new PerplexityCommunityIntelProvider("test-key");
    const result = await provider.gatherCommunityInsights(VALID_PARAMS);

    assert.equal(result.summary, "Partial data");
    assert.deepEqual(result.trendingPainPoints, []);
    assert.deepEqual(result.industryTrends, []);
    assert.deepEqual(result.communityBenchmarks, []);
    assert.deepEqual(result.sources, []);
  } finally {
    mock.restore();
  }
});
