import test from "node:test";
import assert from "node:assert/strict";

import {
  GEMINI_IMAGE_PROVIDER_METADATA,
  GeminiImageProvider,
} from "./gemini";
import { ProviderAdapterError } from "./provider-contract";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
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

test("GeminiImageProvider isolates parallel failures without replaying paid POSTs", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  // One of the three intentional image requests fails after provider dispatch.
  // It must not be replayed; the other two results remain usable.
  globalThis.fetch = (async () => {
    attempts += 1;

    if (attempts === 1) {
      return new Response(JSON.stringify({
        error: {
          code: 500,
          message: "Internal error encountered.",
          status: "INTERNAL",
        },
      }), { status: 500 });
    }

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "abc123",
                },
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });
  }) as typeof fetch;

  try {
    const provider = new GeminiImageProvider("gemini-key");
    const observations: unknown[] = [];
    const result = await provider.generateSupportingAssets({
      companyBrief: {
        websiteUrl: "https://example.com",
        companyName: "Example Co",
        industry: "Fitness",
        offer: "Gym memberships",
        painPoints: ["Retention"],
        proofPoints: ["Large facility"],
        pitchAngles: ["Local reach"],
        sourceUrls: ["https://example.com"],
      },
      sellerPositioningSummary: "We build tailored outbound decks.",
      visualStyle: "premium_modern",
      objective: "Create a sales deck",
    }, {
      onObservability: (value) => observations.push(value),
    });

    assert.equal(attempts, 3);
    assert.equal(result.assetUrls.length, 2);
    assert.ok(result.assetUrls.every(url => url.startsWith("data:image/png;base64,")));
    assert.deepEqual(observations, [
      {
        usage: [
          { metric: "input_tokens", unit: "tokens", amount: 10 },
          { metric: "output_tokens", unit: "tokens", amount: 5 },
          { metric: "total_tokens", unit: "tokens", amount: 15 },
        ],
      },
      {
        usage: [
          { metric: "input_tokens", unit: "tokens", amount: 10 },
          { metric: "output_tokens", unit: "tokens", amount: 5 },
          { metric: "total_tokens", unit: "tokens", amount: 15 },
        ],
      },
    ]);
    assert.ok(observations.every((value) => !("cost" in (value as object))));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GeminiImageProvider does not expose provider response bodies in errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("sensitive provider diagnostics", { status: 400 });
  }) as typeof fetch;

  try {
    const provider = new GeminiImageProvider("gemini-key");
    await assert.rejects(
      () => provider.generateSupportingAssets({
        companyBrief: {
          websiteUrl: "https://example.com",
          companyName: "Example Co",
          industry: "Software",
          offer: "Workflow software",
          painPoints: ["Manual work"],
          proofPoints: [],
          pitchAngles: ["Automation"],
          sourceUrls: ["https://example.com"],
        },
        sellerPositioningSummary: "We build tailored outbound decks.",
        visualStyle: "minimal",
        objective: "Book a call",
      }),
      (error: unknown) => {
        assertProviderError(error, "client_request", 400);
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /sensitive provider diagnostics/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GeminiImageProvider exposes stable experimental metadata and validates config offline", () => {
  assert.equal(GEMINI_IMAGE_PROVIDER_METADATA.providerId, "google.gemini.image-generation");
  assert.equal(GEMINI_IMAGE_PROVIDER_METADATA.modelId, "gemini-3.1-flash-image-preview");
  assert.equal(GEMINI_IMAGE_PROVIDER_METADATA.contractVersion, 1);
  assert.equal(GEMINI_IMAGE_PROVIDER_METADATA.releaseStatus, "experimental");

  const provider = new GeminiImageProvider("<gemini-api-key>");
  assert.equal(provider.providerId, GEMINI_IMAGE_PROVIDER_METADATA.providerId);
  assert.equal(provider.modelId, GEMINI_IMAGE_PROVIDER_METADATA.modelId);
  assert.deepEqual(provider.capabilities, GEMINI_IMAGE_PROVIDER_METADATA.capabilities);

  assert.throws(() => new GeminiImageProvider(""), (error: unknown) => {
    assertProviderError(error, "configuration");
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /gemini-api-key/u);
    return true;
  });
  assert.throws(
    () => new GeminiImageProvider("<gemini-api-key>", "unverified-model"),
    (error: unknown) => assertProviderError(error, "configuration"),
  );
});

test("GeminiImageProvider classifies every required HTTP failure", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    [401, "authentication"],
    [403, "authorization"],
    [408, "timeout"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const;
  const request = {
    companyBrief: {
      websiteUrl: "https://example.com",
      industry: "Software",
      offer: "Workflow software",
      painPoints: [],
      proofPoints: [],
      pitchAngles: [],
      sourceUrls: ["https://example.com"],
    },
    sellerPositioningSummary: "Tailored outbound decks",
    visualStyle: "minimal",
    objective: "Book a call",
  };

  try {
    for (const [status, code] of cases) {
      let attempts = 0;
      globalThis.fetch = (async () => {
        attempts += 1;
        return new Response("provider-controlled diagnostic", { status });
      }) as typeof fetch;
      const provider = new GeminiImageProvider(
        "<gemini-api-key>",
        undefined,
        { maxRetries: 0 },
      );
      await assert.rejects(
        () => provider.generateSupportingAssets(request),
        (error: unknown) => {
          assertProviderError(error, code, status);
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /provider-controlled diagnostic/u);
          return true;
        },
      );
      assert.equal(attempts, 3, "only the three intentional image calls may run");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GeminiImageProvider rejects empty, malformed, and schema-invalid responses", async () => {
  const originalFetch = globalThis.fetch;
  const request = {
    companyBrief: {
      websiteUrl: "https://example.com",
      industry: "Software",
      offer: "Workflow software",
      painPoints: [],
      proofPoints: [],
      pitchAngles: [],
      sourceUrls: ["https://example.com"],
    },
    sellerPositioningSummary: "Tailored outbound decks",
    visualStyle: "minimal",
    objective: "Book a call",
  };
  const cases = [
    ["", "empty_response"],
    ["{", "malformed_response"],
    [JSON.stringify({ candidates: [], unexpected: true }), "malformed_response"],
  ] as const;

  try {
    for (const [body, code] of cases) {
      globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
      const provider = new GeminiImageProvider("<gemini-api-key>");
      await assert.rejects(
        () => provider.generateSupportingAssets(request),
        (error: unknown) => assertProviderError(error, code),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GeminiImageProvider aborts before dispatch when its signal is already cancelled", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("must not dispatch");
  }) as typeof fetch;

  try {
    const provider = new GeminiImageProvider("<gemini-api-key>");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => provider.generateSupportingAssets({
        companyBrief: {
          websiteUrl: "https://example.com",
          industry: "Software",
          offer: "Workflow software",
          painPoints: [],
          proofPoints: [],
          pitchAngles: [],
          sourceUrls: ["https://example.com"],
        },
        sellerPositioningSummary: "Tailored outbound decks",
        visualStyle: "minimal",
        objective: "Book a call",
      }, { signal: controller.signal }),
      (error: unknown) => assertProviderError(error, "aborted"),
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
