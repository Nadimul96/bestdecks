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
  tone: Tone;
  visualStyle: VisualStyle;
  imagePolicy: ImagePolicy;
  cardCount: number;
}) {
  return [
    `Create a ${params.archetype.replaceAll("_", " ")} presentation.`,
    `Use a ${params.tone} tone.`,
    `Aim for a ${params.visualStyle.replaceAll("_", " ")} visual direction.`,
    `Target ${params.cardCount} cards.`,
    params.imagePolicy === "never"
      ? "Do not invent or add images."
      : "Only use images that are explicitly provided or obviously improve comprehension.",
    "Keep the deck specific to the target company and avoid generic claims.",
  ].join(" ");
}
