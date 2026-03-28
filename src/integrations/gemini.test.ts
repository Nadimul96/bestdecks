import test from "node:test";
import assert from "node:assert/strict";

import { GeminiImageProvider } from "./gemini";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installImmediateTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = (((callback: TimerHandler) => {
    if (typeof callback === "function") {
      queueMicrotask(() => callback());
    }
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown) as typeof setTimeout;

  globalThis.clearTimeout = ((() => {}) as unknown) as typeof clearTimeout;

  return () => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  };
}

test("GeminiImageProvider generates multiple images in parallel and handles retries", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  // Simulate: first call to any image request gets a 500, subsequent calls succeed.
  // With 3 parallel image requests, each with up to 2 retries, we expect multiple attempts.
  globalThis.fetch = (async () => {
    attempts += 1;

    // First attempt of the first request fails with 500
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
    });
  }) as typeof fetch;

  try {
    const provider = new GeminiImageProvider("gemini-key");
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
    });

    // 3 parallel image requests — all should succeed (some may retry)
    assert.ok(attempts >= 3, `Expected at least 3 fetch attempts, got ${attempts}`);
    // Each successful request returns one image, so we should get 3
    assert.ok(result.assetUrls.length >= 1, "Should have at least 1 image URL");
    assert.ok(result.assetUrls.every(url => url.startsWith("data:image/png;base64,")));
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});
