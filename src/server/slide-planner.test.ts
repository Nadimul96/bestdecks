import test from "node:test";
import assert from "node:assert/strict";

import { evaluateEvidence } from "@/src/domain/evidence";
import {
  GEMINI_SLIDE_PLANNER_METADATA,
  GeminiSlidePlannerError,
  SlidePlanner,
  slidePlanSchema,
} from "./slide-planner";
import type { DeckGenerationInput, SellerDiscoveryResult } from "@/src/integrations/providers";

const sellerBrief: SellerDiscoveryResult = {
  positioningSummary: "We build research-backed decks.",
  offerSummary: "Research-backed decks.",
  proofPoints: ["Fast turnaround"],
  preferredAngles: ["Evidence-first", "Personalized"],
};

const deckInput: DeckGenerationInput = {
  companyBrief: {
    websiteUrl: "https://target.example.com",
    companyName: "Target Co",
    industry: "B2B SaaS",
    offer: "Workflow software for revenue teams",
    locale: "Miami, FL",
    likelyBuyer: "Founder",
    whyNow: "Scaling outbound teams",
    painPoints: ["Slow lead routing", "Manual reporting"],
    proofPoints: ["Customer logos"],
    pitchAngles: ["Automate handoff", "Shorten ramp time"],
    sourceUrls: ["https://target.example.com"],
    sourceClaims: [{
      text: "Customer logos",
      sourceUrl: "https://target.example.com",
    }],
  },
  sellerPositioningSummary: "We build tailored decks.",
  archetype: "cold_outreach",
  objective: "Win a discovery call",
  audience: "Founder",
  cardCount: 6,
  callToAction: "Book a call",
  tone: "consultative",
  visualStyle: "premium_modern",
  mustInclude: ["Specific observations"],
  mustAvoid: ["Buzzwords"],
  outputFormat: "bestdecks_editor",
  imagePolicy: "auto",
};

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("SlidePlanner sends slide structure guidance and formats returned plans", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    const body = JSON.parse(requestBody) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = body.contents[0]?.parts[0]?.text ?? "";
    const promptJson = prompt
      .replace(/^BEGIN_UNTRUSTED_INPUT\n/, "")
      .replace(/\nEND_UNTRUSTED_INPUT$/, "");
    const promptPayload = JSON.parse(promptJson) as {
      sourceCatalog: Array<{ id: string }>;
    };
    const sourceId = promptPayload.sourceCatalog[0]?.id;

    const headlines = [
      "Customer logos",
      "Research-backed decks.",
      "[Inference] Automating handoff may reduce manual work",
      "Book a call",
      "[Inference] A focused next step may clarify fit",
      "hello@bestdecks.co",
    ];
    const claims = headlines.map((text, index) => {
      const id = `claim:slide-${String(index + 1).padStart(2, "0")}-headline`;
      if (index === 0) {
        return {
          id,
          text,
          claimClass: "external_fact",
          supportStatus: "source_backed",
          citedSourceIds: [sourceId],
        };
      }
      if (index === 2 || index === 4) {
        return {
          id,
          text,
          claimClass: "model_inference",
          supportStatus: "model_inference",
          citedSourceIds: [],
        };
      }
      return {
        id,
        text,
        claimClass: "seller_claim",
        supportStatus: "seller_supplied",
        citedSourceIds: [],
      };
    });

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "Target Co Growth Plan",
                  anchorMetric: null,
                  slides: headlines.map((headline, index) => ({
                    slideNumber: index + 1,
                    purpose: index === 0 ? "hook" : index === 5 ? "contact" : "path_forward",
                    headline,
                    headlineClaimId: `claim:slide-${String(index + 1).padStart(2, "0")}-headline`,
                    bulletPoints: [],
                    bulletClaimIds: [],
                    speakerNotes: "",
                    suggestImage: false,
                  })),
                  evidence: { claims },
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 200,
        candidatesTokenCount: 80,
        thoughtsTokenCount: 20,
        totalTokenCount: 300,
      },
    });
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 0 });
    const observations: unknown[] = [];
    const companyBrief = {
      ...deckInput.companyBrief,
      websiteUrl: "https://target.example.com/?token=secret#fragment",
      sourceUrls: ["https://target.example.com/?token=secret#fragment"],
      sourceClaims: [{
        text: "Customer logos",
        sourceUrl: "https://target.example.com/?token=secret#fragment",
      }],
    };
    const plan = await planner.planSlides({
      companyBrief,
      sellerBrief,
      deckInput: { ...deckInput, companyBrief },
      sellerContactInfo: {
        companyName: "Bestdecks",
        email: "hello@bestdecks.co",
        website: "https://bestdecks.co",
      },
      slideStructure: "Slide 1: Why now\nSlide 2: What we noticed",
    }, {
      onObservability: (value) => observations.push(value),
    });

    assert.match(requestBody, /BEGIN_UNTRUSTED_INPUT/);
    assert.match(requestBody, /userDefinedSlideIntent/);
    assert.match(requestBody, /Slide 1: Why now/);
    assert.doesNotMatch(requestBody, /token=secret|fragment/u);
    const parsedRequest = JSON.parse(requestBody) as {
      generationConfig: { responseFormat?: unknown; responseSchema?: unknown };
    };
    assert.ok(parsedRequest.generationConfig.responseFormat);
    assert.equal(parsedRequest.generationConfig.responseSchema, undefined);
    assert.equal(plan.title, "Target Co Growth Plan");
    assert.equal(plan.evidence.sources.length, 1);
    assert.equal(plan.evidence.claims.length, deckInput.cardCount);
    assert.deepEqual(evaluateEvidence(plan.evidence).coverage, {
      supportedFactualClaims: 1,
      factualClaims: 1,
      ratio: 1,
      percent: 100,
    });
    assert.deepEqual(observations, [{
      usage: [
        { metric: "input_tokens", unit: "tokens", amount: 200 },
        { metric: "output_tokens", unit: "tokens", amount: 80 },
        { metric: "reasoning_tokens", unit: "tokens", amount: 20 },
        { metric: "total_tokens", unit: "tokens", amount: 300 },
      ],
    }]);

    const formatted = planner.formatPlanAsPrompt(plan, {
      companyName: "Bestdecks",
      email: "hello@bestdecks.co",
      website: "https://bestdecks.co",
    });
    assert.match(formatted, /# Target Co Growth Plan/);
    assert.match(formatted, /IMPORTANT: The last slide must display seller contact information prominently/);
    assert.match(formatted, /Email: hello@bestdecks.co/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SlidePlanner rejects credential-bearing source URLs before a provider request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return createJsonResponse({});
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 0 });
    const companyBrief = {
      ...deckInput.companyBrief,
      websiteUrl: "https://user:password@target.example.com/private",
    };
    await assert.rejects(
      planner.planSlides({
        companyBrief,
        sellerBrief,
        deckInput: { ...deckInput, companyBrief },
      }),
      (error: unknown) =>
        error instanceof GeminiSlidePlannerError
        && error.code === "client_request"
        && error.retryable === false
        && !error.message.includes("password"),
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SlidePlanner fails closed instead of returning a silent fallback", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    throw new Error("network failed");
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 2 });
    await assert.rejects(
      planner.planSlides({
        companyBrief: deckInput.companyBrief,
        sellerBrief,
        deckInput,
        sellerContactInfo: {
          companyName: "Bestdecks",
          website: "https://bestdecks.co",
        },
      }),
      (error: unknown) =>
        error instanceof GeminiSlidePlannerError
        && error.code === "network"
        && error.retryable === true,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SlidePlanner carries custom tone/style data and rejects model-proposed generated media", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequirements: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "")) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = body.contents[0]?.parts[0]?.text ?? "";
    const payload = JSON.parse(
      prompt.replace(/^BEGIN_UNTRUSTED_INPUT\n/u, "").replace(/\nEND_UNTRUSTED_INPUT$/u, ""),
    ) as { deckRequirements: Record<string, unknown>; sourceCatalog: Array<{ id: string }> };
    capturedRequirements = payload.deckRequirements;
    const sourceId = payload.sourceCatalog[0]?.id;
    const headlines = [
      "Customer logos",
      sellerBrief.positioningSummary,
      sellerBrief.offerSummary,
      sellerBrief.proofPoints[0]!,
      sellerBrief.preferredAngles[0]!,
      deckInput.callToAction,
    ];
    const claims = headlines.map((text, index) => ({
      id: `claim:slide-${String(index + 1).padStart(2, "0")}-headline`,
      text,
      claimClass: index === 0 ? "external_fact" : "seller_claim",
      supportStatus: index === 0 ? "source_backed" : "seller_supplied",
      citedSourceIds: index === 0 ? [sourceId] : [],
    }));
    return createJsonResponse({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({
          title: "Custom presentation",
          anchorMetric: null,
          slides: headlines.map((headline, index) => ({
            slideNumber: index + 1,
            purpose: "proposal",
            headline,
            headlineClaimId: `claim:slide-${String(index + 1).padStart(2, "0")}-headline`,
            bulletPoints: [],
            bulletClaimIds: [],
            speakerNotes: "",
            suggestImage: index === 0,
            ...(index === 0 ? { imagePrompt: "ignored visual" } : {}),
          })),
          evidence: { claims },
        }) }] },
      }],
    });
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      planner.planSlides({
        companyBrief: deckInput.companyBrief,
        sellerBrief,
        deckInput: {
          ...deckInput,
          tone: "custom",
          customTone: "Warm, precise, and evidence-first.",
          visualStyle: "custom",
          customVisualStyle: "Sparse navy layouts with high-contrast typography.",
          imagePolicy: "never",
        },
      }),
      (error: unknown) => error instanceof GeminiSlidePlannerError && error.code === "contract",
    );
    assert.equal(capturedRequirements?.tonePreset, "custom");
    assert.equal(capturedRequirements?.toneInstruction, "Warm, precise, and evidence-first.");
    assert.equal(capturedRequirements?.visualStylePreset, "custom");
    assert.equal(
      capturedRequirements?.visualStyleInstruction,
      "Sparse navy layouts with high-contrast typography.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("slidePlanSchema requires the evidence ledger", () => {
  assert.equal(slidePlanSchema.safeParse({
    title: "Unverified plan",
    slides: [],
  }).success, false);
  assert.equal(GEMINI_SLIDE_PLANNER_METADATA.capabilities.evidenceLedger, true);
});

test("slidePlanSchema binds every visible headline and bullet to its exact claim", () => {
  const validPlan = {
    title: "Bound plan",
    slides: [{
      slideNumber: 1,
      purpose: "hook",
      headline: "Research-backed decks.",
      headlineClaimId: "claim:slide-01-headline",
      bulletPoints: ["Book a call"],
      bulletClaimIds: ["claim:slide-01-bullet-01"],
      speakerNotes: "",
      suggestImage: false,
    }],
    evidence: {
      sources: [],
      claims: [
        {
          id: "claim:slide-01-headline",
          text: "Research-backed decks.",
          claimClass: "seller_claim",
          supportStatus: "seller_supplied",
          citedSourceIds: [],
        },
        {
          id: "claim:slide-01-bullet-01",
          text: "Book a call",
          claimClass: "seller_claim",
          supportStatus: "seller_supplied",
          citedSourceIds: [],
        },
      ],
    },
  };

  assert.equal(slidePlanSchema.safeParse(validPlan).success, true);
  assert.equal(slidePlanSchema.safeParse({
    ...validPlan,
    slides: [{ ...validPlan.slides[0], headline: "Invented replacement" }],
  }).success, false);
  assert.equal(slidePlanSchema.safeParse({
    ...validPlan,
    evidence: {
      ...validPlan.evidence,
      claims: [
        ...validPlan.evidence.claims,
        { ...validPlan.evidence.claims[0], id: "claim:unused" },
      ],
    },
  }).success, false);
});

test("SlidePlanner rejects model-asserted source support absent from the source claim catalog", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "")) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const promptJson = (body.contents[0]?.parts[0]?.text ?? "")
      .replace(/^BEGIN_UNTRUSTED_INPUT\n/, "")
      .replace(/\nEND_UNTRUSTED_INPUT$/, "");
    const payload = JSON.parse(promptJson) as { sourceCatalog: Array<{ id: string }> };
    const claimText = "Target Co is the market leader";
    return createJsonResponse({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: "Target Co",
              anchorMetric: null,
              slides: [{
                slideNumber: 1,
                purpose: "hook",
                headline: claimText,
                headlineClaimId: "claim:slide-01-headline",
                bulletPoints: [],
                bulletClaimIds: [],
                speakerNotes: "",
                suggestImage: false,
              }],
              evidence: {
                claims: [{
                  id: "claim:slide-01-headline",
                  text: claimText,
                  claimClass: "external_fact",
                  supportStatus: "source_backed",
                  citedSourceIds: [payload.sourceCatalog[0]?.id],
                }],
              },
            }),
          }],
        },
      }],
    });
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      planner.planSlides({
        companyBrief: deckInput.companyBrief,
        sellerBrief,
        deckInput: { ...deckInput, cardCount: 1 },
      }),
      (error: unknown) =>
        error instanceof GeminiSlidePlannerError
        && error.code === "unsupported_claim",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SlidePlanner rejects an exact retained claim cited to the wrong source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "")) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const promptJson = (body.contents[0]?.parts[0]?.text ?? "")
      .replace(/^BEGIN_UNTRUSTED_INPUT\n/, "")
      .replace(/\nEND_UNTRUSTED_INPUT$/, "");
    const payload = JSON.parse(promptJson) as {
      sourceCatalog: Array<{ id: string; url: string }>;
      sourceClaimCatalog: Array<{ text: string; sourceIds: string[] }>;
    };
    const retained = payload.sourceClaimCatalog.find((claim) => claim.text === "Customer logos");
    const wrongSource = payload.sourceCatalog.find(
      (source) => !retained?.sourceIds.includes(source.id),
    );
    assert.ok(retained);
    assert.ok(wrongSource);
    return createJsonResponse({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: "Target Co",
              anchorMetric: null,
              slides: [{
                slideNumber: 1,
                purpose: "proof",
                headline: retained.text,
                headlineClaimId: "claim:slide-01-headline",
                bulletPoints: [],
                bulletClaimIds: [],
                speakerNotes: "",
                suggestImage: false,
              }],
              evidence: {
                claims: [{
                  id: "claim:slide-01-headline",
                  text: retained.text,
                  claimClass: "external_fact",
                  supportStatus: "source_backed",
                  citedSourceIds: [wrongSource.id],
                }],
              },
            }),
          }],
        },
      }],
    });
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key", undefined, { maxRetries: 0 });
    await assert.rejects(
      planner.planSlides({
        companyBrief: {
          ...deckInput.companyBrief,
          sourceUrls: [
            ...deckInput.companyBrief.sourceUrls,
            "https://unrelated.example.com/report",
          ],
        },
        sellerBrief,
        deckInput: { ...deckInput, cardCount: 1 },
      }),
      (error: unknown) =>
        error instanceof GeminiSlidePlannerError
        && error.code === "unsupported_claim",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
