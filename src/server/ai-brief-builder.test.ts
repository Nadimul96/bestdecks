import test from "node:test";
import assert from "node:assert/strict";

import {
  AiBriefBuilder,
  GEMINI_BRIEF_BUILDER_METADATA,
  GeminiBriefProviderError,
} from "./ai-brief-builder";
import type { SellerDiscoveryResult } from "@/src/integrations/providers";

const sellerBrief: SellerDiscoveryResult = {
  positioningSummary: "We build research-backed decks.",
  offerSummary: "Research-backed decks.",
  proofPoints: ["Fast turnaround"],
  preferredAngles: ["Evidence-first", "Personalized"],
};

const baseInput = {
  target: {
    websiteUrl: "https://target.example.com",
    companyName: "Target Co",
    role: "Founder",
  },
  sellerBrief,
  crawlMarkdown: "# Target Co\nWorkflow software for revenue teams\nMiami, FL\nCustomer logos",
  crawlEvidence: [
    {
      url: "https://target.example.com",
      text: "# Target Co\nWorkflow software for revenue teams\nMiami, FL\nCustomer logos",
    },
    {
      url: "https://target.example.com/about",
      text: "Fast onboarding",
    },
  ],
  sourceUrls: ["https://target.example.com", "https://target.example.com/about"],
  enrichmentSummary: "Target Co is growing in Miami, FL and expanding sales coverage.",
};

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("AiBriefBuilder returns structured company briefs from Gemini JSON", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  companyName: {
                    text: "Target Co",
                    basis: "source",
                    sourceUrl: "https://target.example.com",
                  },
                  industry: { text: "B2B SaaS", basis: "inference", sourceUrl: null },
                  offer: {
                    text: "Workflow software for revenue teams",
                    basis: "source",
                    sourceUrl: "https://target.example.com",
                  },
                  locale: {
                    text: "Miami, FL",
                    basis: "source",
                    sourceUrl: "https://target.example.com",
                  },
                  likelyBuyer: { text: "Founder", basis: "inference", sourceUrl: null },
                  whyNow: {
                    text: "Scaling outbound teams may create handoff pressure",
                    basis: "inference",
                    sourceUrl: null,
                  },
                  painPoints: [
                    { text: "Slow lead routing", basis: "inference", sourceUrl: null },
                    { text: "Manual reporting", basis: "inference", sourceUrl: null },
                  ],
                  proofPoints: [
                    {
                      text: "Customer logos",
                      basis: "source",
                      sourceUrl: "https://target.example.com",
                    },
                    {
                      text: "Fast onboarding",
                      basis: "source",
                      sourceUrl: "https://target.example.com/about",
                    },
                  ],
                  pitchAngles: [
                    { text: "Automate handoff", basis: "inference", sourceUrl: null },
                  ],
                  anchorMetric: null,
                  contrarianAngle: null,
                  compoundingLogic: null,
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 90,
        cachedContentTokenCount: 10,
        candidatesTokenCount: 30,
        toolUsePromptTokenCount: 2,
        thoughtsTokenCount: 4,
        totalTokenCount: 126,
      },
    });
  }) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, { maxRetries: 0 });
    const observations: unknown[] = [];
    const brief = await builder.buildCompanyBrief(baseInput, {
      onObservability: (value) => observations.push(value),
    });

    assert.match(requestBody, /BEGIN_UNTRUSTED_INPUT/);
    assert.match(requestBody, /websiteEvidence/);
    const parsedRequest = JSON.parse(requestBody) as {
      generationConfig: { responseFormat?: unknown; responseSchema?: unknown };
    };
    assert.ok(parsedRequest.generationConfig.responseFormat);
    assert.equal(parsedRequest.generationConfig.responseSchema, undefined);
    assert.equal(brief.companyName, "Target Co");
    assert.equal(brief.industry, "[Inference] B2B SaaS");
    assert.equal(brief.locale, "Miami, FL");
    assert.deepEqual(brief.painPoints, [
      "[Inference] Slow lead routing",
      "[Inference] Manual reporting",
    ]);
    assert.deepEqual(brief.pitchAngles, ["[Inference] Automate handoff"]);
    assert.deepEqual(brief.proofPoints, ["Customer logos", "Fast onboarding"]);
    assert.deepEqual(brief.sourceClaims, [
      { text: "Target Co", sourceUrl: "https://target.example.com/" },
      { text: "Workflow software for revenue teams", sourceUrl: "https://target.example.com/" },
      { text: "Miami, FL", sourceUrl: "https://target.example.com/" },
      { text: "Customer logos", sourceUrl: "https://target.example.com/" },
      { text: "Fast onboarding", sourceUrl: "https://target.example.com/about" },
    ]);
    assert.deepEqual(observations, [{
      usage: [
        { metric: "input_tokens", unit: "tokens", amount: 90 },
        { metric: "cached_input_tokens", unit: "tokens", amount: 10 },
        { metric: "output_tokens", unit: "tokens", amount: 30 },
        { metric: "tool_input_tokens", unit: "tokens", amount: 2 },
        { metric: "reasoning_tokens", unit: "tokens", amount: 4 },
        { metric: "total_tokens", unit: "tokens", amount: 126 },
      ],
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder fails closed when Gemini returns no text", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    createJsonResponse({ candidates: [{ content: { parts: [{}] } }] })) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      builder.buildCompanyBrief(baseInput),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "empty_response"
        && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder normalizes target URLs before forwarding them", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  let fetchCount = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    fetchCount += 1;
    requestBody = String(init?.body ?? "");
    return createJsonResponse({ candidates: [{ content: { parts: [{}] } }] });
  }) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      builder.buildCompanyBrief({
        ...baseInput,
        target: {
          ...baseInput.target,
          websiteUrl: "https://target.example.com/path?token=secret#fragment",
        },
      }),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "empty_response",
    );
    assert.match(requestBody, /https:\/\/target\.example\.com\/path/u);
    assert.doesNotMatch(requestBody, /token=secret|fragment/u);

    await assert.rejects(
      builder.buildCompanyBrief({
        ...baseInput,
        target: {
          ...baseInput.target,
          websiteUrl: "https://user:password@target.example.com/private",
        },
      }),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "client_request"
        && error.retryable === false
        && !error.message.includes("password"),
    );
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder does not replay an ambiguous Gemini 5xx", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return createJsonResponse({}, 503);
  }) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, {
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });
    await assert.rejects(
      builder.buildCompanyBrief(baseInput),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "provider_unavailable"
        && error.retryable === true,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder rejects invented source metrics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => createJsonResponse({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            companyName: { text: "Target Co", basis: "source", sourceUrl: "https://target.example.com" },
            industry: { text: "Unknown industry", basis: "unknown", sourceUrl: null },
            offer: { text: "Unknown offer", basis: "unknown", sourceUrl: null },
            locale: null,
            likelyBuyer: null,
            whyNow: null,
            painPoints: [],
            proofPoints: [],
            pitchAngles: [],
            anchorMetric: {
              text: "47% of customers churn",
              basis: "source",
              sourceUrl: "https://target.example.com",
            },
            contrarianAngle: null,
            compoundingLogic: null,
          }),
        }],
      },
    }],
  })) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      builder.buildCompanyBrief(baseInput),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "unsupported_metric",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder rejects a paraphrase that merely names an allowed source URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => createJsonResponse({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            companyName: { text: "Target Co", basis: "source", sourceUrl: "https://target.example.com" },
            industry: { text: "Unknown industry", basis: "unknown", sourceUrl: null },
            offer: {
              text: "Target Co makes every revenue workflow faster",
              basis: "source",
              sourceUrl: "https://target.example.com",
            },
            locale: null,
            likelyBuyer: null,
            whyNow: null,
            painPoints: [],
            proofPoints: [],
            pitchAngles: [],
            anchorMetric: null,
            contrarianAngle: null,
            compoundingLogic: null,
          }),
        }],
      },
    }],
  })) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      builder.buildCompanyBrief(baseInput),
      (error: unknown) =>
        error instanceof GeminiBriefProviderError
        && error.code === "contract"
        && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder exposes stable metadata without exposing invalid credentials", () => {
  assert.equal(GEMINI_BRIEF_BUILDER_METADATA.defaultModelId, "gemini-2.5-flash");
  assert.throws(
    () => new AiBriefBuilder(""),
    (error: unknown) =>
      error instanceof TypeError
      && error.message === "Gemini company brief configuration is invalid.",
  );
});
