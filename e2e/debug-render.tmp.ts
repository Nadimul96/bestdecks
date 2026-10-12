const { loadEnv } = await import("/app/src/config/env.ts");
const { PresentonDeckProvider } = await import("/app/src/integrations/presenton.ts");
const { selectRichStaticLayoutIds } = await import("/app/src/domain/visual-profile.ts");
const { verifyPptxVisibleText } = await import("/app/src/integrations/pptx-content-verifier.ts");
const env = loadEnv();
const provider = new PresentonDeckProvider({
  baseUrl: env.PRESENTON_BASE_URL!, basicAuthUsername: env.PRESENTON_AUTH_USERNAME,
  basicAuthPassword: env.PRESENTON_AUTH_PASSWORD, defaultTemplate: env.PRESENTON_TEMPLATE, allowPrivateNetwork: true,
});
const input = {
  companyBrief: { websiteUrl: "https://example.com", companyName: "Example Company", industry: "Software", offer: "B2B workflow software", painPoints: ["Manual work"], proofPoints: ["Simple tooling"], pitchAngles: ["Operational efficiency"], sourceUrls: ["https://example.com"] },
  sellerPositioningSummary: "We create tailored outbound decks.", archetype: "cold_outreach", objective: "Create a short tailored presentation.", audience: "Founder", cardCount: 5, callToAction: "Book a 20-minute call", tone: "consultative", visualStyle: "sales_polished", mustInclude: ["Specific observations"], mustAvoid: ["Generic buzzwords"], outputFormat: "pptx", imagePolicy: "never", visualContentTypes: [], visualDensity: "rich",
} as const;
const exactSlides = [
  { headline: "Example Company", bulletPoints: [] },
  { headline: "Manual work slows the team", bulletPoints: [] },
  { headline: "A focused workflow", bulletPoints: ["Automate repeated work"] },
  { headline: "A simple rollout", bulletPoints: ["Start with one process"] },
  { headline: "Book a 20-minute call", bulletPoints: [] },
];
const layoutIds = selectRichStaticLayoutIds(exactSlides.length);
let result;
try {
  result = await provider.createDeck(input as never, [], { exactSlides, layoutIds });
} catch (error) {
  console.error("createDeck failed", (error as Error).stack);
  process.exit(1);
}
console.error("exportUrl", result.exportUrl);
const auth = `Basic ${Buffer.from(`${env.PRESENTON_AUTH_USERNAME}:${env.PRESENTON_AUTH_PASSWORD}`).toString("base64")}`;
const response = await fetch(result.exportUrl!, { headers: { Authorization: auth } });
const body = Buffer.from(await response.arrayBuffer());
console.error("download", response.status, response.headers.get("content-type"), body.length, body.subarray(0, 4).toString("hex"));
try {
  verifyPptxVisibleText(body, exactSlides, layoutIds);
  console.error("verified");
} catch (error) {
  console.error("verify failed", (error as Error).stack);
}
process.stdout.write(body.toString("base64"));
