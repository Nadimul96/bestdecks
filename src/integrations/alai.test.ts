import test from "node:test";
import assert from "node:assert/strict";

import {
  ALAI_DECK_PROVIDER_METADATA,
  AlaiDeckProvider,
  pickAlaiTheme,
  pickAlaiTone,
} from "./alai";
import { ProviderAdapterError } from "./provider-contract";
import type { DeckGenerationInput } from "./providers";

const baseInput: DeckGenerationInput = {
  companyBrief: {
    websiteUrl: "https://example.com",
    companyName: "Example Co",
    industry: "Software",
    offer: "B2B workflow software",
    painPoints: ["Manual reporting", "Slow follow-up"],
    proofPoints: ["Clear ICP"],
    pitchAngles: ["Faster sales motion"],
    sourceUrls: ["https://example.com"],
  },
  sellerPositioningSummary: "We build tailored outreach decks.",
  archetype: "cold_outreach",
  objective: "Win an intro call",
  audience: "Founder",
  cardCount: 8,
  callToAction: "Book a call",
  tone: "consultative",
  visualStyle: "sales_polished",
  mustInclude: ["Specific observations"],
  mustAvoid: ["Buzzwords"],
  outputFormat: "bestdecks_editor",
  imagePolicy: "never",
};

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

/* ── Theme mapping tests ──────────────────────────────────────── */

test("pickAlaiTheme maps known styles to correct themes", () => {
  assert.equal(pickAlaiTheme("minimal"), "Simple Light");
  assert.equal(pickAlaiTheme("editorial"), "Light Cool Creative");
  assert.equal(pickAlaiTheme("sales_polished"), "Royal Blue");
  assert.equal(pickAlaiTheme("premium_modern"), "Aurora Flux");
  assert.equal(pickAlaiTheme("playful"), "Prismatica");
  assert.equal(pickAlaiTheme("dark_executive"), "Midnight Ember");
  assert.equal(pickAlaiTheme("dark_minimal"), "Simple Dark");
  assert.equal(pickAlaiTheme("custom"), "Simple Light");
});

test("pickAlaiTheme is deterministic for auto", () => {
  assert.equal(pickAlaiTheme("auto"), "Simple Light");
  assert.equal(pickAlaiTheme("auto"), pickAlaiTheme("auto"));
});

test("pickAlaiTheme is deterministic for mixed", () => {
  assert.equal(pickAlaiTheme("mixed"), "Aurora Flux");
  assert.equal(pickAlaiTheme("mixed"), pickAlaiTheme("mixed"));
});

test("pickAlaiTheme falls back to Simple Light for unknown styles", () => {
  assert.equal(pickAlaiTheme("nonexistent"), "Simple Light");
});

/* ── Tone mapping tests ───────────────────────────────────────── */

test("pickAlaiTone maps known tones correctly", () => {
  assert.equal(pickAlaiTone("concise"), "PROFESSIONAL");
  assert.equal(pickAlaiTone("executive"), "AUTHORITATIVE");
  assert.equal(pickAlaiTone("bold"), "PERSUASIVE");
  assert.equal(pickAlaiTone("consultative"), "PROFESSIONAL");
  assert.equal(pickAlaiTone("friendly"), "CASUAL");
  assert.equal(pickAlaiTone("custom"), "CUSTOM");
});

test("pickAlaiTone falls back to PROFESSIONAL for unknown tones", () => {
  assert.equal(pickAlaiTone("nonexistent"), "PROFESSIONAL");
});

/* ── Successful generation flow ───────────────────────────────── */

test("AlaiDeckProvider creates a deck with slide-plan prompt and returns URLs", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });

    if (requests.length === 1) {
      // Create response
      return createJsonResponse({ generation_id: "gen_abc123" });
    }

    // Poll response — completed with the current API shape
    return createJsonResponse({
      generation_id: "gen_abc123",
      status: "completed",
      formats: {
        link: {
          status: "completed",
          url: "https://slides.getalai.com/p/gen_abc123",
          error: null,
        },
        pdf: {
          status: "completed",
          url: "https://slides.getalai.com/p/gen_abc123/export/pdf",
          error: null,
        },
        ppt: {
          status: "completed",
          url: "https://slides.getalai.com/p/gen_abc123/export/ppt",
          error: null,
        },
      },
    });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    const result = await provider.createDeck(
      baseInput,
      [],
      { slidePlanPrompt: "# Planned deck\n\n## Slide 1\n- Insight" },
    );

    // Verify requests
    assert.equal(requests.length, 2);
    assert.match(requests[0]!.url, /\/api\/v1\/generations$/);
    assert.match(requests[1]!.url, /\/api\/v1\/generations\/gen_abc123$/);

    // Verify create body
    const createBody = JSON.parse(String(requests[0]!.init?.body)) as Record<string, unknown>;
    assert.equal(createBody.num_slides, 8);
    assert.equal(createBody.theme, "Royal Blue");
    assert.equal(createBody.tone, "PROFESSIONAL");
    assert.equal(createBody.content_mode, "preserve");
    assert.equal(createBody.amount_mode, "essential");
    assert.equal(createBody.include_ai_images, false);
    assert.equal(createBody.image_style, "realistic");
    assert.deepEqual(createBody.export_formats, ["link", "pdf", "ppt"]);
    assert.match(String(createBody.input_text), /# Planned deck/);
    assert.match(String(createBody.input_text), /Style instructions:/);

    // Verify auth header
    const authHeader = (requests[0]!.init?.headers as Record<string, string>)?.Authorization;
    assert.equal(authHeader, "Bearer sk_test_key");

    // Verify result mapping
    assert.equal(result.presentationId, "gen_abc123");
    assert.equal(result.editorUrl, "https://slides.getalai.com/p/gen_abc123");
    assert.equal(result.exportUrl, "https://slides.getalai.com/p/gen_abc123/export/ppt");
    assert.equal(result.pdfExportUrl, "https://slides.getalai.com/p/gen_abc123/export/pdf");
    assert.equal(result.pptxExportUrl, "https://slides.getalai.com/p/gen_abc123/export/ppt");
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

/* ── Polling until completion ─────────────────────────────────── */

test("AlaiDeckProvider polls multiple times until completed", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  let pollCount = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    assert.match(url, /slides-api\.getalai\.com/);

    if (body) {
      // Create request
      return createJsonResponse({ generation_id: "gen_poll_test" });
    }

    // Poll request
    pollCount++;
    if (pollCount < 3) {
      return createJsonResponse({
        generation_id: "gen_poll_test",
        status: "processing",
      });
    }

    return createJsonResponse({
      generation_id: "gen_poll_test",
      status: "completed",
      exports: {
        link: "https://slides.getalai.com/p/gen_poll_test",
        ppt: "https://slides.getalai.com/p/gen_poll_test/export/ppt",
      },
    });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    const result = await provider.createDeck(baseInput);

    assert.equal(pollCount, 3);
    assert.equal(result.presentationId, "gen_poll_test");
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

/* ── Timeout handling ─────────────────────────────────────────── */

test("AlaiDeckProvider throws on generation failure", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";

    if (body) {
      return createJsonResponse({ generation_id: "gen_fail" });
    }

    return createJsonResponse({
      generation_id: "gen_fail",
      status: "failed",
      error: "Theme not found",
    });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    await assert.rejects(() => provider.createDeck(baseInput), (error: unknown) => {
      assertProviderError(error, "generation_failed");
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /Theme not found/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

/* ── 429 retry logic ──────────────────────────────────────────── */

test("AlaiDeckProvider retries on 429 rate limit", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  let createAttempts = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";

    if (body) {
      createAttempts++;

      if (createAttempts === 1) {
        return new Response("rate limited", { status: 429 });
      }

      return createJsonResponse({ generation_id: "gen_retry" });
    }

    return createJsonResponse({
      generation_id: "gen_retry",
      status: "completed",
      exports: {
        link: "https://slides.getalai.com/p/gen_retry",
        ppt: "https://slides.getalai.com/p/gen_retry/export/ppt",
      },
    });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    const result = await provider.createDeck(baseInput);

    assert.equal(createAttempts, 2);
    assert.equal(result.presentationId, "gen_retry");
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

test("AlaiDeckProvider does not replay an ambiguous create failure", async () => {
  const originalFetch = globalThis.fetch;
  let createAttempts = 0;
  globalThis.fetch = (async (_input, init) => {
    if (init?.body) createAttempts += 1;
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    await assert.rejects(provider.createDeck(baseInput), /HTTP 503/u);
    assert.equal(createAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AlaiDeckProvider throws on non-retryable client errors (400)", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response("Bad Request: invalid input_text", { status: 400 });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    await assert.rejects(() => provider.createDeck(baseInput), (error: unknown) => {
      assertProviderError(error, "client_request", 400);
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /invalid input_text/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

test("AlaiDeckProvider exposes stable experimental metadata and validates config offline", () => {
  assert.equal(ALAI_DECK_PROVIDER_METADATA.providerId, "alai.slides.generation");
  assert.equal(ALAI_DECK_PROVIDER_METADATA.modelId, null);
  assert.equal(ALAI_DECK_PROVIDER_METADATA.contractVersion, 1);
  assert.equal(ALAI_DECK_PROVIDER_METADATA.releaseStatus, "experimental");

  const configured = new AlaiDeckProvider({ apiKey: "<alai-api-key>" });
  assert.equal(configured.providerId, ALAI_DECK_PROVIDER_METADATA.providerId);
  assert.deepEqual(configured.capabilities, ALAI_DECK_PROVIDER_METADATA.capabilities);

  assert.throws(() => new AlaiDeckProvider({ apiKey: "" }), (error: unknown) => {
    assertProviderError(error, "configuration");
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /alai-api-key/u);
    return true;
  });
});

test("AlaiDeckProvider classifies every required HTTP failure without replaying ambiguity", async () => {
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
      const provider = new AlaiDeckProvider({
        apiKey: "<alai-api-key>",
        maxRetries: 0,
      });
      await assert.rejects(
        () => provider.createDeck(baseInput),
        (error: unknown) => {
          assertProviderError(error, code, status);
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /provider-controlled diagnostic/u);
          return true;
        },
      );
      assert.equal(attempts, 1, `HTTP ${status} must not cause an ambiguous replay`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AlaiDeckProvider rejects empty, malformed, and schema-invalid responses", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    ["", "empty_response"],
    ["{", "malformed_response"],
    [JSON.stringify({ generation_id: "gen_1", unexpected: true }), "malformed_response"],
  ] as const;

  try {
    for (const [body, code] of cases) {
      globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
      const provider = new AlaiDeckProvider({ apiKey: "<alai-api-key>" });
      await assert.rejects(
        () => provider.createDeck(baseInput),
        (error: unknown) => assertProviderError(error, code),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AlaiDeckProvider propagates AbortSignal and minimizes source URLs before dispatch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let requestBody = "";
  globalThis.fetch = (async (_input, init) => {
    fetchCount += 1;
    assert.equal(init?.signal?.aborted, false);
    if (init?.body) requestBody = String(init.body);
    return createJsonResponse({ generation_id: "gen_url" });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({
      apiKey: "<alai-api-key>",
      pollIntervalMs: 0,
    });
    await assert.rejects(
      () => provider.createDeck({
        ...baseInput,
        companyBrief: {
          ...baseInput.companyBrief,
          websiteUrl: "https://example.com/?token=private#fragment",
          sourceUrls: ["https://example.com/report?token=private#fragment"],
        },
      }),
      // The create succeeds, then the fixture intentionally returns the
      // create shape for polling.
      (error: unknown) => assertProviderError(error, "malformed_response"),
    );
    assert.equal(fetchCount, 2);
    assert.doesNotMatch(requestBody, /token=private|#fragment/u);

    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = (async (_input, init) => {
      assert.equal(init?.signal?.aborted, true);
      throw new DOMException("aborted", "AbortError");
    }) as typeof fetch;
    await assert.rejects(
      () => provider.createDeck(baseInput, [], { signal: controller.signal }),
      (error: unknown) => assertProviderError(error, "aborted"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
