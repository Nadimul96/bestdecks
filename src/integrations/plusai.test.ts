import test from "node:test";
import assert from "node:assert/strict";

import {
  PLUS_AI_DECK_PROVIDER_METADATA,
  PlusAiDeckProvider,
} from "./plusai";
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

test("PlusAiDeckProvider uses slide-plan prompts, template mapping, and Google Slides URLs", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });

    if (requests.length === 1) {
      return createJsonResponse({
        pollingUrl: "https://api.plusdocs.com/r/v0/presentation/pres_123",
        status: "PROCESSING",
      });
    }

    return createJsonResponse({
      id: "pres_123",
      status: "GENERATED",
      url: "https://docs.google.com/presentation/d/gs_12345/edit?usp=sharing",
      slides: ["Intro"],
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:05.000Z",
      language: "en",
    });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({ apiKey: "plus-key" });
    const result = await provider.createDeck(
      baseInput,
      [],
      { slidePlanPrompt: "# Planned deck\n\n## Slide 1\n- Insight" },
    );

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://api.plusdocs.com/r/v0/presentation");
    assert.equal(requests[1]?.url, "https://api.plusdocs.com/r/v0/presentation/pres_123");

    const createBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(createBody.language, "en");
    assert.equal(createBody.numberOfSlides, 8);
    assert.equal(createBody.templateId, "D9fCV9f59UZFiLIMMzUMhy");
    assert.match(String(createBody.prompt), /# Planned deck/);
    assert.match(String(createBody.prompt), /Style instructions:/);

    assert.equal(result.presentationId, "pres_123");
    assert.equal(result.googleSlidesId, "gs_12345");
    assert.equal(result.editorUrl, "https://docs.google.com/presentation/d/gs_12345/edit");
    assert.equal(result.embedUrl, "https://docs.google.com/presentation/d/gs_12345/embed?start=false&loop=false");
    assert.equal(result.pdfExportUrl, "https://docs.google.com/presentation/d/gs_12345/export/pdf");
    assert.equal(result.pptxExportUrl, "https://docs.google.com/presentation/d/gs_12345/export/pptx");
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

test("PlusAiDeckProvider omits templateId for auto visual style and retries 429s", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  let createAttempts = 0;
  const bodies: string[] = [];

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";

    if (body) {
      createAttempts += 1;
      bodies.push(body);

      if (createAttempts === 1) {
        return new Response("rate limited", { status: 429 });
      }

      return createJsonResponse({
        pollingUrl: "https://api.plusdocs.com/r/v0/presentation/pres_456",
        status: "PROCESSING",
      });
    }

    return createJsonResponse({
      id: "pres_456",
      status: "GENERATED",
      url: "https://download.example.com/presentation.pptx",
      slides: ["Intro"],
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:05.000Z",
      language: "en",
    });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({ apiKey: "plus-key" });
    const result = await provider.createDeck({
      ...baseInput,
      visualStyle: "auto",
    }, ["https://cdn.example.com/hero.png"]);

    assert.equal(createAttempts, 2);
    const finalBody = JSON.parse(bodies.at(-1) ?? "{}") as Record<string, unknown>;
    assert.equal("templateId" in finalBody, false);
    assert.match(String(finalBody.prompt), /Images approved for use:/);
    assert.equal(result.exportUrl, "https://download.example.com/presentation.pptx");
    assert.equal(result.editorUrl, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

test("PlusAiDeckProvider does not replay an ambiguous create failure", async () => {
  const originalFetch = globalThis.fetch;
  let createAttempts = 0;
  globalThis.fetch = (async (_input, init) => {
    if (init?.body) createAttempts += 1;
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({ apiKey: "fixture-key" });
    await assert.rejects(provider.createDeck(baseInput), /HTTP 503/u);
    assert.equal(createAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PlusAiDeckProvider does not expose provider response bodies in errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("sensitive provider diagnostics", { status: 400 });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({ apiKey: "plus-key" });
    await assert.rejects(() => provider.createDeck(baseInput), (error: unknown) => {
      assertProviderError(error, "client_request", 400);
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /sensitive provider diagnostics/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PlusAiDeckProvider never forwards authorization to an untrusted polling URL", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization?: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL ? input.toString() : input.url;
    requests.push({
      url,
      authorization: new Headers(init?.headers).get("authorization") ?? undefined,
    });
    return createJsonResponse({
      pollingUrl: "http://169.254.169.254/latest/meta-data",
      status: "PROCESSING",
    });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({ apiKey: "plus-key" });
    await assert.rejects(
      () => provider.createDeck(baseInput),
      (error: unknown) => assertProviderError(error, "malformed_response"),
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.plusdocs.com/r/v0/presentation");
    assert.equal(requests[0]?.authorization, "Bearer plus-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PlusAiDeckProvider exposes stable experimental metadata and validates config offline", () => {
  assert.equal(PLUS_AI_DECK_PROVIDER_METADATA.providerId, "plusai.presentation.generation");
  assert.equal(PLUS_AI_DECK_PROVIDER_METADATA.modelId, null);
  assert.equal(PLUS_AI_DECK_PROVIDER_METADATA.contractVersion, 1);
  assert.equal(PLUS_AI_DECK_PROVIDER_METADATA.releaseStatus, "experimental");

  const configured = new PlusAiDeckProvider({ apiKey: "<plus-ai-api-key>" });
  assert.equal(configured.providerId, PLUS_AI_DECK_PROVIDER_METADATA.providerId);
  assert.deepEqual(configured.capabilities, PLUS_AI_DECK_PROVIDER_METADATA.capabilities);
  assert.throws(() => new PlusAiDeckProvider({ apiKey: "" }), (error: unknown) => {
    assertProviderError(error, "configuration");
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /plus-ai-api-key/u);
    return true;
  });
});

test("PlusAiDeckProvider classifies every required HTTP failure without replaying ambiguity", async () => {
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
      const provider = new PlusAiDeckProvider({
        apiKey: "<plus-ai-api-key>",
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

test("PlusAiDeckProvider rejects empty, malformed, and schema-invalid responses", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    ["", "empty_response"],
    ["{", "malformed_response"],
    [JSON.stringify({
      pollingUrl: "https://api.plusdocs.com/r/v0/presentation/pres_1",
      status: "PROCESSING",
      unexpected: true,
    }), "malformed_response"],
  ] as const;

  try {
    for (const [body, code] of cases) {
      globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
      const provider = new PlusAiDeckProvider({ apiKey: "<plus-ai-api-key>" });
      await assert.rejects(
        () => provider.createDeck(baseInput),
        (error: unknown) => assertProviderError(error, code),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PlusAiDeckProvider propagates AbortSignal and minimizes source URLs", async () => {
  const originalFetch = globalThis.fetch;
  let createBody = "";
  globalThis.fetch = (async (_input, init) => {
    if (init?.body) {
      createBody = String(init.body);
      return createJsonResponse({
        pollingUrl: "https://api.plusdocs.com/r/v0/presentation/pres_url",
        status: "PROCESSING",
      });
    }
    return createJsonResponse({
      id: "pres_url",
      status: "GENERATED",
      url: "https://download.example.com/presentation.pptx",
      slides: ["Intro"],
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:05.000Z",
      language: "en",
    });
  }) as typeof fetch;

  try {
    const provider = new PlusAiDeckProvider({
      apiKey: "<plus-ai-api-key>",
      pollIntervalMs: 0,
    });
    await provider.createDeck({
      ...baseInput,
      companyBrief: {
        ...baseInput.companyBrief,
        websiteUrl: "https://example.com/?token=private#fragment",
        sourceUrls: ["https://example.com/report?token=private#fragment"],
      },
    });
    assert.doesNotMatch(createBody, /token=private|#fragment/u);

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
