import { loadEnv } from "../config/env";
import { evaluateEvidence } from "../domain/evidence";
import type { DeckGenerationInput, SellerDiscoveryResult } from "../integrations/providers";
import { AiBriefBuilder } from "../server/ai-brief-builder";
import { SlidePlanner } from "../server/slide-planner";

async function main() {
  const env = loadEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  const sourceUrl = "https://example.com/";
  const sourceText = "Example Company provides workflow software for business teams.";
  const sellerBrief: SellerDiscoveryResult = {
    positioningSummary: "We prepare evidence-auditable proposal decks.",
    offerSummary: "Evidence-auditable proposal decks.",
    proofPoints: [],
    preferredAngles: ["Evidence first"],
  };
  const brief = await new AiBriefBuilder(env.GEMINI_API_KEY).buildCompanyBrief({
    target: { websiteUrl: sourceUrl, companyName: "Example Company", role: "Founder" },
    sellerBrief,
    crawlMarkdown: sourceText,
    crawlEvidence: [{ url: sourceUrl, text: sourceText }],
    sourceUrls: [sourceUrl],
    enrichmentSummary: "[Unknown] No additional live research was supplied to this adapter smoke.",
  });
  const deckInput: DeckGenerationInput = {
    companyBrief: brief,
    sellerPositioningSummary: sellerBrief.positioningSummary,
    archetype: "cold_outreach",
    objective: "Explain the retained observation and propose a short review call.",
    audience: "Founder",
    cardCount: 3,
    callToAction: "Review the evidence in a 20-minute call.",
    tone: "consultative",
    visualStyle: "minimal",
    mustInclude: [],
    mustAvoid: ["Unsupported claims"],
    outputFormat: "pptx",
    imagePolicy: "never",
  };
  const plan = await new SlidePlanner(env.GEMINI_API_KEY).planSlides({
    companyBrief: brief,
    sellerBrief,
    deckInput,
    sourceMetadata: [{
      url: sourceUrl,
      title: "Example Company fixture",
      retrievedAt: new Date().toISOString(),
      provider: "adapter-smoke",
    }],
  });
  const evaluation = evaluateEvidence(plan.evidence);
  if (!evaluation.deliveryGate.canDeliver) {
    throw new Error("Gemini adapter smoke returned unsupported factual claims.");
  }

  console.log(
    JSON.stringify(
      {
        briefBuilt: true,
        slideCount: plan.slides.length,
        evidenceCoverage: evaluation.coverage,
        deliveryGatePassed: evaluation.deliveryGate.canDeliver,
      },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error("Gemini smoke test failed.");
  process.exitCode = 1;
});
