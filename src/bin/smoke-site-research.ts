import { loadEnv } from "../config/env";
import { SiteResearchProvider } from "../integrations/site-research";

/**
 * Live smoke for first-party site research (one Gemini call). Usage:
 *   pnpm smoke:research https://www.example.com/
 */
async function main() {
  const env = loadEnv();
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");

  const websiteUrl = process.argv[2] ?? "https://www.apache.org/";
  const result = await new SiteResearchProvider(env.GEMINI_API_KEY).enrichCompany({
    websiteUrl,
    sellerPositioningSummary: "We create tailored sales decks for outbound campaigns.",
    requestedSignals: ["industry", "recent activity", "observable proof points"],
  });

  console.log(JSON.stringify({
    confidence: result.confidence,
    evidence: result.evidence.map((item) => ({ url: item.url, snippetCharacters: item.snippet.length })),
    summary: result.synthesizedSummary,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Site research smoke failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
