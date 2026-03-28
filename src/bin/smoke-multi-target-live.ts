import { loadEnv } from "../config/env";
import { CloudflareCrawler } from "../integrations/cloudflare";
import { PerplexityEnrichmentProvider } from "../integrations/perplexity";
import { PlusAiDeckProvider } from "../integrations/plusai";
import { AiBriefBuilder } from "../server/ai-brief-builder";
import { SlidePlanner } from "../server/slide-planner";
import type { SellerDiscoveryResult } from "../integrations/providers";

async function main() {
  const env = loadEnv();
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Cloudflare configuration is required.");
  }
  if (!env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is required.");
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required.");
  }
  if (!env.PLUSAI_API_KEY) {
    throw new Error("PLUSAI_API_KEY is required.");
  }

  const crawler = new CloudflareCrawler({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    pollDelayMs: 3000,
    maxPollAttempts: 60,
  });
  const enrichmentProvider = new PerplexityEnrichmentProvider(env.PERPLEXITY_API_KEY);
  const briefBuilder = new AiBriefBuilder(env.GEMINI_API_KEY);
  const planner = new SlidePlanner(env.GEMINI_API_KEY);
  const deckProvider = new PlusAiDeckProvider({ apiKey: env.PLUSAI_API_KEY });

  const sellerBrief: SellerDiscoveryResult = {
    positioningSummary: "We create research-backed outbound decks for targeted outreach.",
    offerSummary: "Research-backed outbound deck generation.",
    proofPoints: ["Fast turnaround", "Personalized decks"],
    preferredAngles: ["Evidence-first", "Highly personalized", "Fast turnaround"],
  };

  const sellerContactInfo = {
    companyName: "Bestdecks",
    email: "hello@bestdecks.co",
    website: "https://bestdecks.co",
  };

  const targets = [
    { websiteUrl: "https://example.com", companyName: "Example Company", role: "Founder" },
    { websiteUrl: "https://example.org", companyName: "Example Organization", role: "Founder" },
  ];

  const results: Array<Record<string, unknown>> = [];

  for (const target of targets) {
    const crawl = await crawler.crawlSite({
      websiteUrl: target.websiteUrl,
      maxPages: 3,
      maxDepth: 1,
      requestedFormats: ["markdown"],
    });

    const enrichment = await enrichmentProvider.enrichCompany({
      websiteUrl: target.websiteUrl,
      companyName: target.companyName,
      sellerPositioningSummary: sellerBrief.positioningSummary,
      requestedSignals: ["industry", "buyer signals", "observable proof points"],
    });

    const companyBrief = await briefBuilder.buildCompanyBrief({
      target: {
        websiteUrl: target.websiteUrl,
        companyName: target.companyName,
        role: target.role,
      },
      sellerBrief,
      crawlMarkdown: crawl.pages
        .map((page) => page.markdown)
        .filter((value): value is string => Boolean(value))
        .join("\n\n---\n\n"),
      sourceUrls: [...crawl.discoveredUrls, ...enrichment.evidence.map((item) => item.url)],
      enrichmentSummary: enrichment.synthesizedSummary,
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

    const plan = await planner.planSlides({
      companyBrief,
      sellerBrief,
      deckInput,
      sellerContactInfo,
    });

    const slidePlanPrompt = planner.formatPlanAsPrompt(plan, sellerContactInfo);
    const deck = await deckProvider.createDeck(deckInput, [], { slidePlanPrompt });

    results.push({
      websiteUrl: target.websiteUrl,
      crawlPages: crawl.pages.length,
      enrichmentEvidence: enrichment.evidence.length,
      companyName: companyBrief.companyName,
      industry: companyBrief.industry,
      slideCount: plan.slides.length,
      presentationId: deck.presentationId,
      exportUrl: deck.exportUrl,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
