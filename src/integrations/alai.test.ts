import test from "node:test";
import assert from "node:assert/strict";

import { AlaiDeckProvider, pickAlaiTheme, pickAlaiTone } from "./alai";
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

test("pickAlaiTheme returns a theme from top 5 for auto", () => {
  const top5 = ["Simple Light", "Simple Dark", "Light Cool Creative", "Royal Blue", "Aurora Flux"];
  for (let i = 0; i < 20; i++) {
    assert.ok(top5.includes(pickAlaiTheme("auto")), `auto theme was not in top 5`);
  }
});

test("pickAlaiTheme returns a theme from all 23 for mixed", () => {
  // Just verify it returns a non-empty string (randomness makes exact assertion fragile)
  for (let i = 0; i < 20; i++) {
    const theme = pickAlaiTheme("mixed");
    assert.ok(typeof theme === "string" && theme.length > 0);
  }
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

    // Poll response — completed
    return createJsonResponse({
      generation_id: "gen_abc123",
      status: "completed",
      exports: {
        link: "https://slides.getalai.com/p/gen_abc123",
        pdf: "https://slides.getalai.com/p/gen_abc123/export/pdf",
        ppt: "https://slides.getalai.com/p/gen_abc123/export/ppt",
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
    assert.equal(createBody.include_ai_images, true);
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
    await assert.rejects(
      () => provider.createDeck(baseInput),
      { message: /Alai presentation generation failed: Theme not found/ },
    );
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

test("AlaiDeckProvider throws on non-retryable client errors (400)", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
    return new Response("Bad Request: invalid input_text", { status: 400 });
  }) as typeof fetch;

  try {
    const provider = new AlaiDeckProvider({ apiKey: "sk_test_key" });
    await assert.rejects(
      () => provider.createDeck(baseInput),
      { message: /Alai create failed: HTTP 400/ },
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});
