import type {
  DeckArchetype,
  DeliveryFormat,
  ImagePolicy,
  SellerContext,
  Tone,
  VisualContentType,
  VisualDensity,
  VisualStyle,
} from "@/src/domain/schemas";

/* ─────────────────────────────────────────────
   Multi-Business Types
   ───────────────────────────────────────────── */

export interface Business {
  id: string;
  name: string;
  websiteUrl: string;
  logoUrl?: string;
  setupComplete: boolean;
  sellerContext?: SellerContextForm;
  questionnaire?: QuestionnaireForm;
  createdAt: string;
  updatedAt: string;
}

/* ─────────────────────────────────────────────
   Form Types
   ───────────────────────────────────────────── */

export interface CurrentUser {
  name?: string | null;
  email?: string | null;
}

export interface WorkspaceProfileForm {
  ownerName: string;
  ownerEmail: string;
  companyName: string;
  websiteUrl: string;
  timezone: string;
  defaultSignature: string;
}

export interface SellerContextForm {
  websiteUrl: string;
  companyName: string;
  logoUrl: string;
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  proofPointsText: string;
  constraintsText: string;
  // Social links
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
}

export interface QuestionnaireForm {
  archetype: DeckArchetype;
  customArchetypePrompt: string;
  audience: string;
  audienceSize: string;
  audienceIndustry: string;
  audiencePainPoints: string;
  objective: string;
  successMetric: string;
  callToAction: string;
  ctaUrgency: string;
  outputFormat: DeliveryFormat;
  desiredCardCount: string;
  tone: Tone;
  customTone: string;
  visualStyle: VisualStyle;
  customVisualStyle: string;
  imagePolicy: ImagePolicy;
  visualContentTypes: VisualContentType[];
  visualDensity: VisualDensity;
  mustIncludeText: string;
  mustAvoidText: string;
  extraInstructions: string;
  optionalReview: boolean;
  allowUserApprovedCrawlException: boolean;
}

export interface IntakeDraftForm {
  websitesText: string;
  contactsCsvText: string;
}

/* ─────────────────────────────────────────────
   Run & Pipeline Types
   ───────────────────────────────────────────── */

export interface RunSummary {
  id: string;
  business_id?: string;
  status: string;
  target_count: number;
  delivery_format: DeliveryFormat;
  first_target_url?: string;
  created_at: string;
  updated_at: string;
}

export interface RunTargetRecord {
  id: string;
  website_url: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  campaign_goal: string | null;
  notes: string | null;
  status: string;
  crawl_provider?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunArtifactRecord {
  id: string;
  run_id: string;
  target_id?: string | null;
  artifact_type: string;
  artifact_json: Record<string, unknown>;
  created_at: string;
}

export interface RunEventRecord {
  id: string;
  run_id: string;
  target_id?: string | null;
  stage?: string | null;
  level: "info" | "warning" | "error";
  message: string;
  created_at: string;
}

export type RunPipelineTargetRecord = Pick<
  RunTargetRecord,
  | "id"
  | "website_url"
  | "company_name"
  | "status"
  | "crawl_provider"
  | "last_error"
  | "created_at"
>;

export type RunPipelineEventRecord = Pick<
  RunEventRecord,
  "id" | "stage" | "level" | "message" | "created_at"
>;

export interface RunDetail {
  id: string;
  status: string;
  targetCount: number;
  sellerContext: Pick<SellerContext, "companyName">;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  targets: RunPipelineTargetRecord[];
  events: RunPipelineEventRecord[];
  eventPage: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

export type Notice =
  | { type: "success" | "error" | "info"; message: string; link?: { label: string; hash: string } }
  | null;

/* ─────────────────────────────────────────────
   Option Arrays (used by views)
   ───────────────────────────────────────────── */

export type DeckIntent =
  | "cold_pitch"
  | "post_call"
  | "agency_rfp"
  | "investor"
  | "partnership"
  | "event_sponsor"
  | "product_demo"
  | "upsell"
  | "board_update"
  | "custom";

export const intentOptions: Array<{
  value: DeckIntent;
  label: string;
  description: string;
  detail: string;
  emoji: string;
}> = [
  {
    value: "cold_pitch",
    label: "Cold Outreach",
    description: "Pitch companies that don't know you yet",
    detail:
      "Generates a research-backed deck that opens with a company-specific hook, frames your value against their pain points, and closes with a single low-friction CTA.",
    emoji: "🎯",
  },
  {
    value: "post_call",
    label: "Post-Call Deck",
    description: "Follow up after a discovery call",
    detail:
      "Recaps the conversation, maps their stated needs to your solution, and includes a clear next-step slide. Best sent within 24 hours of the call.",
    emoji: "📞",
  },
  {
    value: "agency_rfp",
    label: "Agency Proposal",
    description: "Respond to an RFP or pitch a retainer",
    detail:
      "Structures your proposal around the prospect's brief: scope, timeline, deliverables, pricing context, and team fit. Works for retainers and one-off projects.",
    emoji: "📋",
  },
  {
    value: "investor",
    label: "Investor Deck",
    description: "Pitch investors with tailored context",
    detail:
      "Builds a narrative around market opportunity, traction, team, and ask. Adapts framing based on the investor's portfolio focus and stage preference.",
    emoji: "💰",
  },
  {
    value: "partnership",
    label: "Partnership Pitch",
    description: "Propose a co-sell, integration, or alliance",
    detail:
      "Frames the mutual upside of partnering: overlapping audiences, complementary products, and a concrete pilot proposal. Great for channel and tech partnerships.",
    emoji: "🤝",
  },
  {
    value: "event_sponsor",
    label: "Event / Sponsorship",
    description: "Pitch sponsorship or speaking opportunities",
    detail:
      "Positions your brand as the ideal sponsor by mapping your audience overlap, reach metrics, and activation ideas to the event organizer's goals.",
    emoji: "🎪",
  },
  {
    value: "product_demo",
    label: "Product Demo Recap",
    description: "Summarize a demo with tailored highlights",
    detail:
      "Turns a live demo into a leave-behind deck: key features shown, how they solve the prospect's workflow gaps, and a comparison slide if competitors came up.",
    emoji: "🖥️",
  },
  {
    value: "upsell",
    label: "Customer Upsell",
    description: "Expand an existing account",
    detail:
      "Uses their current usage data and success metrics to make the case for upgrading, adding seats, or adopting a new module. Focuses on ROI of expansion.",
    emoji: "📈",
  },
  {
    value: "board_update",
    label: "Board / Advisor Update",
    description: "Share progress with stakeholders",
    detail:
      "Structured around KPIs, milestones hit, blockers, and asks. Keeps the deck concise and data-forward so board members can skim in under 5 minutes.",
    emoji: "🏛️",
  },
];

export const archetypeOptions: Array<{
  value: DeckArchetype;
  label: string;
  description: string;
  detail: string;
  emoji: string;
}> = [
  {
    value: "cold_outreach",
    label: "Cold Outreach",
    description:
      "Lead with company-specific evidence and a narrow, credible call to action.",
    detail:
      "Best for first-touch outreach to prospects who don't know you. Opens with a researched hook about their business, frames your value against their specific pain points, and closes with a single low-friction CTA.",
    emoji: "\uD83C\uDFAF",
  },
  {
    value: "warm_intro",
    label: "Warm Intro",
    description:
      "Frame shared context, likely upside, and why the conversation should happen now.",
    detail:
      "Ideal when you have a mutual connection, met at an event, or the prospect engaged with your content. Emphasizes common ground and makes the case for a timely conversation.",
    emoji: "\uD83E\uDD1D",
  },
  {
    value: "agency_proposal",
    label: "Agency Proposal",
    description:
      "Translate research into a tailored recommendation, scope direction, and next step.",
    detail:
      "Structures a formal proposal around the prospect's stated needs: scope, timeline, deliverables, pricing context, and team fit. Works for both retainers and project-based engagements.",
    emoji: "\uD83D\uDCCB",
  },
  {
    value: "investor_pitch",
    label: "Investor Pitch",
    description:
      "Build a narrative around opportunity, traction, and your ask.",
    detail:
      "Follows the classic pitch flow: problem, solution, market size, traction, team, and ask. Adapts framing based on the investor's portfolio focus and stage preference.",
    emoji: "\uD83D\uDCB0",
  },
  {
    value: "case_study",
    label: "Case Study",
    description:
      "Let results tell the story with data-driven proof points.",
    detail:
      "Leads with measurable outcomes, walks through the challenge-solution-result arc, and ends with a 'you could see similar results' bridge. Great for mid-funnel nurture.",
    emoji: "\uD83D\uDCC8",
  },
  {
    value: "competitive_displacement",
    label: "Competitive Swap",
    description:
      "Show why switching from their current solution makes sense now.",
    detail:
      "Tactfully positions your solution against their incumbent. Highlights switching triggers, migration ease, and ROI of change without being overtly negative about competitors.",
    emoji: "\u2694\uFE0F",
  },
  {
    value: "thought_leadership",
    label: "Thought Leadership",
    description:
      "Educate first, then naturally position your solution.",
    detail:
      "Opens with industry insights or a provocative trend, builds credibility through data and perspective, then pivots to how your approach addresses the shift. Ideal for top-of-funnel education.",
    emoji: "\uD83D\uDCA1",
  },
  {
    value: "product_launch",
    label: "Product Launch",
    description:
      "Announce new capabilities with clarity and excitement.",
    detail:
      "Structured around what's new, why it matters, who it's for, and how to get started. Works for feature launches, new product lines, or major platform updates.",
    emoji: "\uD83D\uDE80",
  },
  {
    value: "custom",
    label: "Custom",
    description:
      "Define your own deck framing",
    detail:
      "Write a custom prompt describing exactly how you want your deck structured, framed, and delivered. Full creative control.",
    emoji: "\u270F\uFE0F",
  },
];

export const outputFormatOptions: Array<{
  value: DeliveryFormat;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    value: "pptx",
    label: "PPTX file",
    description:
      "Download the verified .pptx artifact. Target-suite compatibility remains part of release validation.",
  },
];

export const toneOptions: Array<{ value: Tone; label: string; description?: string }> = [
  { value: "concise", label: "Concise", description: "Short, punchy, no fluff" },
  { value: "consultative", label: "Consultative", description: "Advisory and solution-focused" },
  { value: "bold", label: "Bold", description: "Confident and direct" },
  { value: "executive", label: "Executive", description: "Data-driven, C-suite ready" },
  { value: "friendly", label: "Friendly", description: "Warm and approachable" },
  { value: "custom", label: "Custom", description: "Define your own tone" },
];

export const visualStyleOptions: Array<{ value: VisualStyle; label: string; description?: string }> =
  [
    { value: "auto", label: "Renderer default", description: "Use the configured template's default direction" },
    { value: "minimal", label: "Minimal", description: "Request clean, spacious layouts" },
    { value: "editorial", label: "Editorial", description: "Request stronger typography and hierarchy" },
    { value: "sales_polished", label: "Consulting", description: "Request structured, data-forward styling" },
    { value: "premium_modern", label: "Startup Modern", description: "Request contemporary product styling" },
    { value: "playful", label: "Creative", description: "Request more color and layout variety" },
    { value: "dark_executive", label: "Dark Executive", description: "Request a dark, high-contrast direction" },
    { value: "dark_minimal", label: "Dark Cinematic", description: "Request a restrained dark direction" },
    { value: "custom", label: "Custom", description: "Describe your own visual direction" },
    { value: "mixed", label: "Mixed", description: "Request varied styling within the configured template" },
  ];

export const imagePolicyOptions: Array<{ value: ImagePolicy; label: string; description?: string }> =
  [
    { value: "never", label: "Verified vector", description: "Rich native layouts without generated or remote media" },
  ];

/* ─────────────────────────────────────────────
   Default Factories
   ───────────────────────────────────────────── */

export function defaultProfile(currentUser?: CurrentUser): WorkspaceProfileForm {
  return {
    ownerName: currentUser?.name ?? "",
    ownerEmail: currentUser?.email ?? "",
    companyName: "",
    websiteUrl: "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
    defaultSignature: "Book a 20-minute call next week",
  };
}

export function defaultSellerContext(): SellerContextForm {
  return {
    websiteUrl: "",
    companyName: "",
    logoUrl: "",
    offerSummary: "",
    servicesText: "",
    differentiatorsText: "",
    targetCustomer: "",
    desiredOutcome: "",
    proofPointsText: "",
    constraintsText: "",
    facebookUrl: "",
    twitterUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
  };
}

/* ─────────────────────────────────────────────
   Seller Knowledge Form (rich context — superset)
   ───────────────────────────────────────────── */

export interface CaseStudyForm {
  id: string;
  clientName: string;
  industry: string;
  challenge: string;
  solution: string;
  results: string;
  metricsText: string;
  testimonialQuote: string;
}

export interface ObjectionForm {
  objection: string;
  response: string;
}

export interface SellerKnowledgeForm {
  websiteUrl: string;
  companyName: string;
  logoUrl: string;
  tagline: string;
  foundedYear: string;
  teamSize: string;
  headquarters: string;
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  pricingModel: string;
  pricingContext: string;
  proofPointsText: string;
  caseStudies: CaseStudyForm[];
  clientLogosText: string;
  awardsText: string;
  commonObjections: ObjectionForm[];
  competitorNotes: string;
  salesPlaybook: string;
  constraintsText: string;
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
}

export const pricingModelOptions = [
  { value: "", label: "Select pricing model…" },
  { value: "subscription", label: "Subscription / SaaS" },
  { value: "one_time", label: "One-time / project-based" },
  { value: "retainer", label: "Monthly retainer" },
  { value: "usage_based", label: "Usage-based / pay-per-use" },
  { value: "freemium", label: "Freemium" },
  { value: "custom", label: "Custom / negotiated" },
] as const;

export function defaultSellerKnowledge(): SellerKnowledgeForm {
  return {
    websiteUrl: "", companyName: "", logoUrl: "",
    tagline: "", foundedYear: "", teamSize: "", headquarters: "",
    offerSummary: "", servicesText: "", differentiatorsText: "",
    targetCustomer: "", desiredOutcome: "",
    pricingModel: "", pricingContext: "",
    proofPointsText: "", caseStudies: [], clientLogosText: "", awardsText: "",
    commonObjections: [], competitorNotes: "", salesPlaybook: "",
    constraintsText: "",
    facebookUrl: "", twitterUrl: "", instagramUrl: "", tiktokUrl: "",
  };
}

export function defaultQuestionnaire(): QuestionnaireForm {
  return {
    archetype: "cold_outreach",
    customArchetypePrompt: "",
    audience: "",
    audienceSize: "",
    audienceIndustry: "",
    audiencePainPoints: "",
    objective: "",
    successMetric: "",
    callToAction: "",
    ctaUrgency: "",
    outputFormat: "pptx",
    desiredCardCount: "8",
    tone: "consultative",
    customTone: "",
    visualStyle: "auto",
    customVisualStyle: "",
    imagePolicy: "never",
    visualContentTypes: [],
    visualDensity: "rich",
    mustIncludeText: "",
    mustAvoidText: "",
    extraInstructions: "",
    optionalReview: false,
    allowUserApprovedCrawlException: false,
  };
}

export function defaultIntakeDraft(): IntakeDraftForm {
  return {
    websitesText: "",
    contactsCsvText: "",
  };
}

/* ─────────────────────────────────────────────
   View Metadata
   ───────────────────────────────────────────── */

export const viewMeta: Record<
  string,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "COMMAND CENTER",
    title: "Workspace activity",
    description: "Review saved configuration and the current state of your runs.",
  },
  onboarding: {
    eyebrow: "SETUP",
    title: "Configure your first run",
    description: "Add the seller context and target inputs the pipeline needs.",
  },
  "seller-context": {
    eyebrow: "YOUR BUSINESS",
    title: "Seller context",
    description: "Record the seller-supplied facts, constraints, and proof points available to the planner.",
  },
  "run-settings": {
    eyebrow: "RUN SETTINGS",
    title: "Configure deck generation",
    description: "Choose the supported narrative, output, tone, and visual settings for this run.",
  },
  "deck-structure": {
    eyebrow: "SLIDE STRUCTURE",
    title: "Define the planned slide sequence",
    description: "Reorder, add, or remove slide instructions before generation.",
  },
  "target-intake": {
    eyebrow: "TARGET LIST",
    title: "Add target companies",
    description: "Paste website URLs or upload a supported CSV or TSV file for this run.",
  },
  pipeline: {
    eyebrow: "RUN PIPELINE",
    title: "Review processing state",
    description: "Inspect the recorded research, enrichment, planning, rendering, and failure stages.",
  },
  delivery: {
    eyebrow: "DELIVERY",
    title: "Completed deck artifacts",
    description: "Download verified artifacts and inspect claim-level evidence coverage plus all five readiness checks. Human review remains required before use.",
  },
  pricing: {
    eyebrow: "HOSTED SERVICE",
    title: "Managed hosting is deferred",
    description: "Use the Apache-2.0 BYOK core today. Hosted availability and commercial terms are not published.",
  },
};
