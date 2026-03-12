import { loadEnv } from "../config/env";
import { PerplexityEnrichmentProvider } from "../integrations/perplexity";

async function main() {
  const env = loadEnv();
  if (!env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is required.");
  }

  const provider = new PerplexityEnrichmentProvider(env.PERPLEXITY_API_KEY);
  const result = await provider.enrichCompany({
    websiteUrl: "https://example.com",
    companyName: "Example",
    sellerPositioningSummary: "We create tailored sales decks for outbound campaigns.",
    requestedSignals: ["industry", "business model"],
  });

  console.log(
    JSON.stringify(
      {
        confidence: result.confidence,
        evidenceCount: result.evidence.length,
        summaryPreview: result.synthesizedSummary.slice(0, 160),
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
