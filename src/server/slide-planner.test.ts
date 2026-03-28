import test from "node:test";
import assert from "node:assert/strict";

import { SlidePlanner } from "./slide-planner";
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

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "Target Co Growth Plan",
                  slides: [
                    {
                      slideNumber: 1,
                      purpose: "Intro",
                      headline: "Target Co Today",
                      bulletPoints: ["Miami expansion", "Outbound bottlenecks"],
                      speakerNotes: "Open with company context.",
                      suggestImage: true,
                      imagePrompt: "Modern SaaS dashboard",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key");
    const plan = await planner.planSlides({
      companyBrief: deckInput.companyBrief,
      sellerBrief,
      deckInput,
      sellerContactInfo: {
        companyName: "Bestdecks",
        email: "hello@bestdecks.co",
        website: "https://bestdecks.co",
      },
      slideStructure: "Slide 1: Why now\nSlide 2: What we noticed",
    });

    assert.match(requestBody, /User-Defined Slide Structure/);
    assert.match(requestBody, /Slide 1: Why now/);
    assert.equal(plan.title, "Target Co Growth Plan");

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

test("SlidePlanner falls back to deterministic plans when Gemini fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("network failed");
  }) as typeof fetch;

  try {
    const planner = new SlidePlanner("gemini-key");
    const plan = await planner.planSlides({
      companyBrief: deckInput.companyBrief,
      sellerBrief,
      deckInput,
      sellerContactInfo: {
        companyName: "Bestdecks",
        website: "https://bestdecks.co",
      },
    });

    assert.equal(plan.slides.length, deckInput.cardCount);
    assert.equal(plan.slides[0]?.headline, "Tailored for Target Co");
    assert.equal(plan.slides.at(-1)?.headline, "Let's Connect");
    assert.deepEqual(plan.slides.at(-1)?.bulletPoints, ["Bestdecks", "https://bestdecks.co"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
