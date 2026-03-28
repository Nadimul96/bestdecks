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
    auto: "modern and clean with strong visual hierarchy — like Anthropic's pitch deck or a top Y Combinator demo day presentation. Sans-serif headlines, generous whitespace, one accent color.",
    minimal: "minimalist with extreme whitespace, like Apple keynotes. Let the content breathe. Snyk raised successfully with pure black-and-white. Less is authority.",
    editorial: "magazine-quality layouts with bold headlines, strong visual hierarchy, and editorial flair. Think Monocle or Bloomberg editorial — confident, opinionated, typographically rich.",
    sales_polished: "confident and polished, like a McKinsey or Bain strategy deck — data-forward with authority. Clean grids, precise typography, structured data visualization.",
    premium_modern: "sophisticated with contemporary gradients, sharp typography, and premium feel — think Stripe or Linear. Rounded card layouts, warm neutrals + one strong accent.",
    playful: "dynamic and energetic with bold colors and creative layouts — approachable yet professional. High contrast, vibrant accents, editorial photography over stock.",
    dark_executive: "dark background (#0A0F1E or deep charcoal) with high-contrast accents (lime, electric blue, or cyan). Premium boardroom feel, LED-screen optimized. Like SpaceX's internal decks.",
    dark_minimal: "dark background with warm whites and a single accent color — moody, cinematic, modern editorial. High contrast typography, dramatic negative space.",
    custom: "modern and clean with strong visual hierarchy, generous whitespace, and one accent color",
    mixed: "surprise the viewer with a distinctive premium design — vary the aesthetic per deck while maintaining quality",
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
    "═══ DESIGN QUALITY (from billion-dollar deck analysis) ═══",
    `Visual direction: ${styleDirection}.`,
    "This must look like it was designed by a top design agency — NOT a generic AI template.",
    "",
    "TYPOGRAPHY & LAYOUT (from 200+ billion-dollar deck analysis):",
    "- MASSIVE, bold sans-serif headlines (3-8 words) taking up 40-50% of the slide. Make CLAIMS, not labels.",
    "- Headlines alone must tell the full story — the 'headline narrative test': skimming only headlines = 70-80% understanding.",
    "- EXACTLY 4 typography levels: Headline (bold, large), Subtitle (medium weight, muted), Body (regular, dark), Caption (small, gray).",
    "- Maximum 3 bullet points per slide, each 8-15 words. Parallel grammatical structure. No sub-bullets.",
    "- Target 35-45 words per slide. If content exceeds 60 words, split into two slides — NEVER shrink fonts.",
    "- NEVER use paragraph text on slides. If it can't fit in a short bullet, it goes in speaker notes.",
    "- Keyword highlighting within problem/solution statements so scanners grasp the core issue instantly.",
    "- Consistent font family throughout — inconsistent fonts are a quality red flag. Max 2 font families.",
    "- Text never pure black on pure white — use slightly softened contrast (#1A1A1A on white or warm off-white).",
    "",
    "SLIDE VARIETY & RHYTHM:",
    "- Vary layouts: Title+Body, 50/50 Split, Centered Single Stat, Three-Column Grid, Full-Bleed Image+Overlay.",
    "- DENSITY RHYTHM: alternate Dense (2-3 bullets) → Medium (visual+labels) → Sparse (one big number). NEVER two dense slides in a row.",
    "- Include exactly ONE 'money slide' — 2-3 oversized statistics showing the most compelling proof. This slide gets screenshotted and shared.",
    "- Section divider slides between major topics (bold headline centered, accent color background).",
    "- The 3-second rule: if a slide's core message isn't instantly clear, it fails.",
    "- WHITESPACE: minimum 10-15% margin on all four sides. Only 1/3 of slide area should contain content elements.",
    "",
    params.imagePolicy === "never"
      ? "Do not include images — rely on typography, whitespace, and layout contrast for visual interest. Snyk raised successfully with pure black-and-white."
      : "Use high-quality, relevant images on 40-60% of slides. Full-bleed or large images, never small thumbnails. Editorial photography over generic stock. Real-world scenes, muted tones, human moments specific to the target's industry.",
    "",
    "═══ CONTENT RULES (Thiel + Raskin + Challenger Sale) ═══",
    "- 80%+ of content about the TARGET company — their business, challenges, opportunities.",
    "- The seller is the GUIDE, the target is the HERO. Frame seller capabilities as enablers of the target's success.",
    "- Every claim backed by a specific number or study (Thiel's non-negotiable rule).",
    "- Show COMPOUNDING LOGIC: solving X enables Y, which unlocks Z. The best decks show a flywheel, not a list.",
    "- Lead with BENEFITS, never features. Not 'we have real-time analytics' but 'see both locations in one view.'",
    "- Use CONTRARIAN POSITIONING: frame the conversation in a way competitors haven't considered.",
    "- Create CURIOSITY, not comprehensiveness. The goal is a meeting, not a thesis defense.",
    "- Every slide must earn its place — no filler, no generic content, no vague generalities.",
    "- The last slide must be a clean contact slide with seller information.",
    "",
    "ANTI-PATTERNS (never do these):",
    "- Generic headline labels ('Our Solution', 'Market Overview', 'Next Steps')",
    "- Feature lists instead of benefit statements",
    "- Vague claims without numbers ('significant growth' → use the actual %)",
    "- More than 2 bullets per slide",
    "- Generic stock imagery",
    "- Ending with 'Let's chat' — always provide a specific, concrete CTA with a deliverable",
  ].join("\n");
}
