import { loadEnv } from "../config/env";
import { selectRichStaticLayoutIds } from "../domain/visual-profile";
import { PresentonDeckProvider } from "../integrations/presenton";
import type { DeckGenerationInput } from "../integrations/providers";

async function main() {
  const env = loadEnv();
  if (!env.PRESENTON_BASE_URL) {
    throw new Error("PRESENTON_BASE_URL is required.");
  }

  const provider = new PresentonDeckProvider({
    baseUrl: env.PRESENTON_BASE_URL,
    apiKey: env.PRESENTON_API_KEY,
    basicAuthUsername: env.PRESENTON_AUTH_USERNAME,
    basicAuthPassword: env.PRESENTON_AUTH_PASSWORD,
    defaultTemplate: env.PRESENTON_TEMPLATE,
    allowPrivateNetwork:
      env.NODE_ENV !== "production" || env.ALLOW_PRIVATE_PROVIDER_URLS === "1",
  });

  const input = {
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
    outputFormat: "pptx",
    imagePolicy: "never",
    visualContentTypes: [],
    visualDensity: "rich",
  } satisfies DeckGenerationInput;
  const exactSlides = [
    { headline: "Example Company", bulletPoints: [] },
    { headline: "Manual work slows the team", bulletPoints: [] },
    { headline: "A focused workflow", bulletPoints: ["Automate repeated work"] },
    { headline: "A simple rollout", bulletPoints: ["Start with one process"] },
    { headline: "Book a 20-minute call", bulletPoints: [] },
  ];
  const layoutIds = selectRichStaticLayoutIds(exactSlides.length);
  const result = await provider.createDeck(input, [], {
    exactSlides,
    layoutIds,
  });
  const artifact = await provider.verifyArtifact(result, {
    expectedSlides: exactSlides,
    layoutIds,
  });

  console.log(
    JSON.stringify(
      {
        generated: Boolean(result.presentationId),
        exportAvailable: Boolean(result.exportUrl),
        artifactVerified: artifact.byteLength > 0,
        artifactSha256: artifact.sha256,
        visualProfile: artifact.visualProfile.id,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`
    : "Unknown error";
  console.error(`Presenton smoke test failed. ${detail}`);
  process.exitCode = 1;
});
