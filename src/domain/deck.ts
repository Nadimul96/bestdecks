import type {
  DeckArchetype,
  ImagePolicy,
  Tone,
  VisualStyle,
} from "./schemas";
import type { CompanyBrief, DeckGenerationInput } from "../integrations/providers";

function bulletLines(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export function buildCompanyBriefMarkdown(companyBrief: CompanyBrief) {
  return [
    `# ${companyBrief.companyName ?? companyBrief.websiteUrl}`,
    "",
    `- Website: ${companyBrief.websiteUrl}`,
    `- Industry: ${companyBrief.industry}`,
    `- Offer: ${companyBrief.offer}`,
    `- Locale: ${companyBrief.locale ?? "Unknown"}`,
    `- Likely buyer: ${companyBrief.likelyBuyer ?? "Unknown"}`,
    `- Why now: ${companyBrief.whyNow ?? "Not established"}`,
    "",
    "## Pain points",
    bulletLines(companyBrief.painPoints),
    "",
    "## Proof points",
    bulletLines(companyBrief.proofPoints),
    "",
    "## Pitch angles",
    bulletLines(companyBrief.pitchAngles),
    "",
    // Advanced narrative fields (from Thiel/Raskin analysis)
    ...(companyBrief.anchorMetric
      ? ["## Anchor metric (use as the deck's throughline)", companyBrief.anchorMetric, ""]
      : []),
    ...(companyBrief.contrarianAngle
      ? ["## Contrarian angle", companyBrief.contrarianAngle, ""]
      : []),
    ...(companyBrief.compoundingLogic
      ? ["## Compounding logic (the flywheel)", companyBrief.compoundingLogic, ""]
      : []),
    "## Sources",
    bulletLines(companyBrief.sourceUrls),
  ].join("\n");
}

export function buildDeckInputText(input: DeckGenerationInput, imageUrls: string[] = []) {
  const companyName = input.companyBrief.companyName ?? input.companyBrief.websiteUrl;
  const imageBlock =
    imageUrls.length > 0
      ? `\nImages approved for use:\n${imageUrls.map((url) => `- ${url}`).join("\n")}`
      : "";

  return [
    `# Tailored proposal for ${companyName}`,
    "",
    "## Seller positioning",
    input.sellerPositioningSummary,
    "",
    "## Target company brief",
    buildCompanyBriefMarkdown(input.companyBrief),
    imageBlock,
    "",
    "## Required structure",
    `- Audience: ${input.audience}`,
    `- Objective: ${input.objective}`,
    `- Call to action: ${input.callToAction}`,
    `- Card count target: ${input.cardCount}`,
    "",
    "## Must include",
    bulletLines(input.mustInclude),
    "",
    "## Must avoid",
    bulletLines(input.mustAvoid),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPresentationAdditionalInstructions(params: {
  archetype: DeckArchetype;
  customArchetypePrompt?: string;
  tone: Tone;
  visualStyle: VisualStyle;
  imagePolicy: ImagePolicy;
  cardCount: number;
}) {
  const styleDirection = {
    auto: "modern and clean, with strong hierarchy, generous whitespace, and one restrained accent color",
    minimal: "minimal, with wide margins, sparse content, neutral colors, and typography-led composition",
    editorial: "editorial, with bold headlines, deliberate asymmetry, and a clear reading order",
    sales_polished: "polished and structured, with clean grids, precise typography, and evidence-led emphasis",
    premium_modern: "contemporary, with sharp typography, warm neutrals, restrained gradients, and rounded panels",
    playful: "energetic but professional, with high contrast, controlled color, and varied composition",
    dark_executive: "dark charcoal, high contrast, restrained bright accents, and presentation-room legibility",
    dark_minimal: "dark and sparse, with warm white text, one accent color, and generous negative space",
    custom: "follow the supplied custom visual direction while preserving legibility and hierarchy",
    mixed: "vary composition across slides while keeping typography, spacing, and color coherent",
  }[params.visualStyle] ?? "modern and clean";

  const archetypeLine = params.archetype === "custom" && params.customArchetypePrompt
    ? `Create a presentation with ${params.cardCount} slides following the user's custom framing.`
    : `Create a ${params.archetype.replaceAll("_", " ")} presentation with ${params.cardCount} slides.`;

  return [
    archetypeLine,
    ...(params.archetype === "custom" && params.customArchetypePrompt
      ? [
          "",
          "CUSTOM DECK FRAMING (follow these instructions closely):",
          params.customArchetypePrompt,
          "",
        ]
      : []),
    `Tone: ${params.tone}.`,
    "",
    "DESIGN QUALITY:",
    `Visual direction: ${styleDirection}.`,
    "",
    "TYPOGRAPHY AND LAYOUT:",
    "- Use short claim-led headlines, not generic section labels.",
    "- Use at most three concise bullets per slide and no nested bullets.",
    "- Split dense content across slides; never preserve content by shrinking text below a readable size.",
    "- Keep typography, spacing, margins, and color roles consistent across the deck.",
    "- Preserve a clear visual reading order and keep every text box in bounds without overlap.",
    "",
    "SLIDE RHYTHM:",
    "- Vary composition without changing the deck's design system.",
    "- Alternate denser explanatory slides with sparse emphasis slides.",
    "- Use a metric-led slide only when the supplied brief contains a source-supported numeric claim.",
    "",
    params.imagePolicy === "never"
      ? "Do not include images; rely on typography, whitespace, color, and layout contrast."
      : "Use high-quality, relevant images only from the explicitly approved image list. Do not fetch or invent additional assets.",
    "",
    "CONTENT RULES:",
    "- Keep the target company and its observable situation central; frame the seller as an enabler.",
    "- Use only claims present in the supplied evidence-gated brief and slide plan.",
    "- Never invent metrics, dates, customers, outcomes, studies, or recent events.",
    "- Label interpretation as inference rather than presenting it as a sourced fact.",
    "- Prefer concrete benefits over feature lists and end with the supplied call to action.",
    "",
    "DO NOT:",
    "- Generic headline labels ('Our Solution', 'Market Overview', 'Next Steps')",
    "- Feature lists instead of benefit statements",
    "- Unsupported or vague factual claims",
    "- Unapproved imagery or external assets",
    "- A generic closing in place of the supplied CTA",
  ].join("\n");
}
