import { loadEnv } from "../config/env";
import { GeminiImageProvider } from "../integrations/gemini";

async function main() {
  const env = loadEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  const provider = new GeminiImageProvider(env.GEMINI_API_KEY);
  const result = await provider.generateSupportingAssets({
    companyBrief: {
      websiteUrl: "https://example.com",
      companyName: "Example Company",
      industry: "Software",
      offer: "B2B workflow software",
      painPoints: ["Manual work"],
      proofPoints: ["Simple tooling"],
      pitchAngles: ["Operational efficiency"],
      sourceUrls: ["https://example.com"],
    },
    sellerPositioningSummary: "We make visually tailored outbound presentations.",
    visualStyle: "premium modern",
    objective: "Create a clean concept image for a business presentation cover.",
  });

  console.log(
    JSON.stringify(
      {
        assetCount: result.assetUrls.length,
        firstAssetPreview: result.assetUrls[0]?.slice(0, 48),
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
