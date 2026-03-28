import { loadEnv } from "../config/env";
import { PlusAiDeckProvider } from "../integrations/plusai";

async function main() {
  const env = loadEnv();
  if (!env.PLUSAI_API_KEY) {
    throw new Error("PLUSAI_API_KEY is required.");
  }

  const provider = new PlusAiDeckProvider({
    apiKey: env.PLUSAI_API_KEY,
  });

  const result = await provider.createDeck({
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
    sellerPositioningSummary: "We create tailored outbound decks.",
    archetype: "cold_outreach",
    objective: "Create a short tailored presentation.",
    audience: "Founder",
    cardCount: 5,
    callToAction: "Book a 20-minute call",
    tone: "consultative",
    visualStyle: "sales_polished",
    mustInclude: ["Specific observations"],
    mustAvoid: ["Generic buzzwords"],
    outputFormat: "bestdecks_editor",
    imagePolicy: "never",
  });

  console.log(
    JSON.stringify(
      {
        presentationId: result.presentationId,
        exportUrl: result.exportUrl,
        editorUrl: result.editorUrl,
        googleSlidesId: result.googleSlidesId,
        pptxExportUrl: result.pptxExportUrl,
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
