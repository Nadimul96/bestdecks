import test from "node:test";
import assert from "node:assert/strict";

import { PlusAiDeckProvider } from "./plusai";
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
