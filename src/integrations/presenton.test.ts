import test from "node:test";
import assert from "node:assert/strict";

import { PresentonDeckProvider } from "./presenton";
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
  cardCount: 5,
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

test("PresentonDeckProvider omits export_as for editor output and resolves relative URLs", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });

    return createJsonResponse({
      presentation_id: "pres_editor",
      edit_path: "/presentation?id=pres_editor",
    });
  }) as typeof fetch;

  try {
    const provider = new PresentonDeckProvider({
      baseUrl: "https://presenton.example.com/",
      apiKey: "presenton-key",
      defaultTemplate: "modern",
    });
    const result = await provider.createDeck(baseInput);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://presenton.example.com/api/v1/ppt/presentation/generate");
    assert.equal(requests[0]?.init?.headers && (requests[0].init.headers as Record<string, string>).Authorization, "Bearer presenton-key");

    const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.template, "modern");
    assert.equal(body.tone, "professional");
    assert.equal(body.verbosity, "concise");
    assert.equal("export_as" in body, false);

    assert.equal(result.presentationId, "pres_editor");
    assert.equal(result.editorUrl, "https://presenton.example.com/presentation?id=pres_editor");
    assert.equal(result.exportUrl, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PresentonDeckProvider includes export_as for file outputs", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = "";

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body ?? "");

    return createJsonResponse({
      presentation_id: "pres_pptx",
      path: "https://downloads.example.com/deck.pptx",
    });
  }) as typeof fetch;

  try {
    const provider = new PresentonDeckProvider({
      baseUrl: "https://presenton.example.com",
      defaultTemplate: "general",
    });
    const result = await provider.createDeck({
      ...baseInput,
      outputFormat: "pptx",
      cardCount: 12,
      tone: "bold",
    });

    const body = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(body.export_as, "pptx");
    assert.equal(body.verbosity, "text-heavy");
    assert.equal(body.tone, "sales_pitch");
    assert.equal("template" in body, false);

    assert.equal(result.presentationId, "pres_pptx");
    assert.equal(result.exportUrl, "https://downloads.example.com/deck.pptx");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PresentonDeckProvider fails fast for hosted Presenton without an API key", async () => {
  const provider = new PresentonDeckProvider({
    baseUrl: "https://api.presenton.ai",
  });

  await assert.rejects(
    () => provider.createDeck(baseInput),
    /Presenton Cloud requires a PRESENTON_API_KEY/,
  );
});
