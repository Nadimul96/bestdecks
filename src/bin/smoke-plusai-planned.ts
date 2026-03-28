import { loadEnv } from "../config/env";
import { PlusAiDeckProvider } from "../integrations/plusai";
import { AiBriefBuilder } from "../server/ai-brief-builder";
import { SlidePlanner } from "../server/slide-planner";
import type { SellerDiscoveryResult } from "../integrations/providers";

async function main() {
  const env = loadEnv();
  if (!env.PLUSAI_API_KEY) {
    throw new Error("PLUSAI_API_KEY is required.");
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  const sellerBrief: SellerDiscoveryResult = {
    positioningSummary: "We create research-backed outbound decks for targeted outreach.",
    offerSummary: "Research-backed outbound deck generation.",
    proofPoints: ["Fast turnaround", "Personalized decks"],
    preferredAngles: ["Evidence-first", "Highly personalized", "Fast turnaround"],
  };

  const briefBuilder = new AiBriefBuilder(env.GEMINI_API_KEY);
  const companyBrief = await briefBuilder.buildCompanyBrief({
    target: {
      websiteUrl: "https://example.com",
      companyName: "Example Company",
      role: "Founder",
      campaignGoal: "Open a conversation about outbound improvement",
    },
    sellerBrief,
    crawlMarkdown: `# Example Company

Example Company provides placeholder web properties used across the internet.
The site emphasizes documentation, standards support, stability, and broad compatibility.
The business appears to value clarity, trust, and simple developer-facing experiences.`,
    sourceUrls: ["https://example.com"],
    enrichmentSummary:
      "Example Company is widely recognized as a stable, standards-based web presence often used for demos and documentation.",
  });

  const deckInput = {
    companyBrief,
    sellerPositioningSummary: sellerBrief.positioningSummary,
    archetype: "cold_outreach" as const,
    objective: "Create a short tailored presentation.",
    audience: "Founder",
    cardCount: 5,
    callToAction: "Book a 20-minute call",
    tone: "consultative" as const,
    visualStyle: "sales_polished" as const,
    mustInclude: ["Specific observations"],
    mustAvoid: ["Generic buzzwords"],
    outputFormat: "bestdecks_editor" as const,
    imagePolicy: "never" as const,
  };

  const sellerContactInfo = {
    companyName: "Bestdecks",
    email: "hello@bestdecks.co",
    website: "https://bestdecks.co",
  };

  const planner = new SlidePlanner(env.GEMINI_API_KEY);
  const plan = await planner.planSlides({
    companyBrief,
    sellerBrief,
    deckInput,
    sellerContactInfo,
    slideStructure: "Slide 1: Why this company\nSlide 2: What we noticed\nSlide 3: How we can help",
  });

  const slidePlanPrompt = planner.formatPlanAsPrompt(plan, sellerContactInfo);

  const provider = new PlusAiDeckProvider({
    apiKey: env.PLUSAI_API_KEY,
  });

  const result = await provider.createDeck(deckInput, [], { slidePlanPrompt });

  console.log(
    JSON.stringify(
      {
        briefCompanyName: companyBrief.companyName,
        briefIndustry: companyBrief.industry,
        slideCount: plan.slides.length,
        presentationId: result.presentationId,
        exportUrl: result.exportUrl,
        editorUrl: result.editorUrl,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
