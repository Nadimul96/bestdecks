import { loadEnv } from "../config/env";
import { PresentonDeckProvider } from "../integrations/presenton";

async function main() {
  const env = loadEnv();
  if (!env.PRESENTON_BASE_URL) {
    throw new Error("PRESENTON_BASE_URL is required.");
  }

  const provider = new PresentonDeckProvider({
    baseUrl: env.PRESENTON_BASE_URL,
    apiKey: env.PRESENTON_API_KEY,
    defaultTemplate: env.PRESENTON_TEMPLATE,
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
    outputFormat: "presenton_editor",
    imagePolicy: "never",
  });

  console.log(
    JSON.stringify(
      {
        presentationId: result.presentationId,
        editorUrl: result.editorUrl,
        exportUrl: result.exportUrl,
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
