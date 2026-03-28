import test from "node:test";
import assert from "node:assert/strict";

import { AiBriefBuilder } from "./ai-brief-builder";
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
  crawlMarkdown: "# Target Co\nMiami, FL\nPricing and testimonials",
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
                  companyName: "Target Co",
                  industry: "B2B SaaS",
                  offer: "Workflow software for revenue teams",
                  locale: "Miami, FL",
                  likelyBuyer: "Founder",
                  whyNow: "Scaling outbound teams",
                  painPoints: ["Slow lead routing", "Manual reporting"],
                  proofPoints: ["Customer logos", "Fast onboarding"],
                  pitchAngles: ["Automate handoff"],
                  keyServices: ["Automation"],
                  competitiveAdvantages: ["Fast onboarding"],
                  operationalInsights: ["Likely SDR-led motion"],
                }),
              },
            ],
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key");
    const brief = await builder.buildCompanyBrief(baseInput);

    assert.match(requestBody, /Website Content \(crawled\)/);
    assert.equal(brief.companyName, "Target Co");
    assert.equal(brief.industry, "B2B SaaS");
    assert.equal(brief.locale, "Miami, FL");
    assert.deepEqual(brief.painPoints, ["Slow lead routing", "Manual reporting"]);
    assert.deepEqual(brief.pitchAngles, ["Automate handoff"]);
    assert.deepEqual(brief.proofPoints, ["Customer logos", "Fast onboarding", "Likely SDR-led motion"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiBriefBuilder falls back safely when Gemini returns no text", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    createJsonResponse({ candidates: [{ content: { parts: [{}] } }] })) as typeof fetch;

  try {
    const builder = new AiBriefBuilder("gemini-key");
    const brief = await builder.buildCompanyBrief(baseInput);

    assert.equal(brief.companyName, "Target Co");
    assert.equal(brief.industry, "Industry inferred from research");
    assert.equal(brief.locale, "Miami, FL");
    assert.deepEqual(brief.pitchAngles, sellerBrief.preferredAngles.slice(0, 3));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
