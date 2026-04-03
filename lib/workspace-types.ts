import type {
  CompanyRow,
  DeckArchetype,
  DeliveryFormat,
  ImagePolicy,
  RunQuestionnaire,
  SellerContext,
  Tone,
  VisualContentType,
  VisualDensity,
  VisualStyle,
} from "@/src/domain/schemas";
import type { IntegrationProviderKey } from "@/src/server/settings";

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
   Deck Scoring Types
   ───────────────────────────────────────────── */

export interface DeckScoreBreakdown {
  relevance: number;
  completeness: number;
  persuasion: number;
  visualQuality: number;
  personalization: number;
}

export interface DeckScore {
  deckId: string;
  overallScore: number;
  breakdown: DeckScoreBreakdown;
  feedback: string[];
  infoRequests: InfoRequest[];
  scoredAt: string;
}

export interface InfoRequest {
  field: string;
  question: string;
  priority: "high" | "medium" | "low";
  businessId: string;
}

/* ─────────────────────────────────────────────
   Credit & Pricing Types
   ───────────────────────────────────────────── */

export type PlanTier = "free" | "starter" | "growth" | "scale" | "enterprise";

export interface UserDecks {
  userId: string;
  balance: number;
  monthlyAllowance: number;
  bonusDecks: number;
  planTier: PlanTier;
  planVolume: number;
  resetDate: string;
}

/** @deprecated Use UserDecks instead */
export type UserCredits = UserDecks;

export interface PricingPlan {
  tier: PlanTier;
  name: string;
  credits: number;
  priceMonthly: number;
  pricePerCredit: number;
  maxAddonCredits: number;
  addonPricePerCredit: number;
  features: string[];
}

/* ─────────────────────────────────────────────
   Volume-Based Pricing (Slider Model)
   ───────────────────────────────────────────── */

export const VOLUME_SNAP_POINTS = [50, 100, 250, 500, 1000, 2500, 5000] as const;
export type VolumeSnapPoint = (typeof VOLUME_SNAP_POINTS)[number];

export interface VolumeTier {
  volume: number;
  perDeckPrice: number;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  label: string;
  popular?: boolean;
}

const VOLUME_PRICING: Record<number, { perDeck: number; label: string; popular?: boolean }> = {
  50: { perDeck: 1.40, label: "Starter" },
  100: { perDeck: 1.10, label: "Growth" },
  250: { perDeck: 0.80, label: "Pro", popular: true },
  500: { perDeck: 0.60, label: "Scale", popular: true },
  1000: { perDeck: 0.40, label: "Business" },
  2500: { perDeck: 0.25, label: "Agency" },
  5000: { perDeck: 0.15, label: "Enterprise" },
};

export function getVolumeTier(volume: number): VolumeTier {
  // Guard against invalid volumes
  const safeVolume = Math.max(50, Math.round(volume));
  const pricing = VOLUME_PRICING[safeVolume];
  if (!pricing) {
    // Interpolate for non-snap values (shouldn't happen with slider, but safety)
    const lower = VOLUME_SNAP_POINTS.filter((v) => v <= safeVolume).at(-1) ?? 50;
    const upper = VOLUME_SNAP_POINTS.find((v) => v >= safeVolume) ?? 5000;
    const lowerPrice = VOLUME_PRICING[lower].perDeck;
    const upperPrice = VOLUME_PRICING[upper].perDeck;
    const ratio = upper === lower ? 0 : (safeVolume - lower) / (upper - lower);
    const perDeck = lowerPrice - ratio * (lowerPrice - upperPrice);
    return {
      volume: safeVolume,
      perDeckPrice: Math.round(perDeck * 100) / 100,
      monthlyPrice: Math.round(safeVolume * perDeck),
      annualMonthlyPrice: Math.round(safeVolume * perDeck * 0.8),
      label: "Custom",
    };
  }
  const monthlyPrice = Math.round(safeVolume * pricing.perDeck);
  return {
    volume: safeVolume,
    perDeckPrice: pricing.perDeck,
    monthlyPrice,
    annualMonthlyPrice: Math.round(monthlyPrice * 0.8),
    label: pricing.label,
    popular: pricing.popular,
  };
}

export function getAllVolumeTiers(): VolumeTier[] {
  return VOLUME_SNAP_POINTS.map(getVolumeTier);
}

export const SIGNUP_FREE_DECKS = 10;

export const pricingPlans: PricingPlan[] = [
  {
    tier: "starter",
    name: "Starter",
    credits: 25,
    priceMonthly: 49,
    pricePerCredit: 1.96,
    maxAddonCredits: 25,
    addonPricePerCredit: 2.50,
    features: [
      "25 decks/month",
      "All deck archetypes",
      "PDF & PPTX export",
      "AI quality scoring",
      "Email support",
    ],
  },
  {
    tier: "growth",
    name: "Growth",
    credits: 100,
    priceMonthly: 129,
    pricePerCredit: 1.29,
    maxAddonCredits: 100,
    addonPricePerCredit: 1.75,
    features: [
      "100 decks/month",
      "Everything in Starter",
      "Multiple businesses",
      "Priority generation",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    tier: "scale",
    name: "Scale",
    credits: 500,
    priceMonthly: 399,
    pricePerCredit: 0.80,
    maxAddonCredits: 500,
    addonPricePerCredit: 1.10,
    features: [
      "500 decks/month",
      "Everything in Growth",
      "Unlimited businesses",
      "Custom branding",
      "API access",
      "Dedicated support",
      "Team collaboration",
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    credits: 0,
    priceMonthly: 0,
    pricePerCredit: 0,
    maxAddonCredits: 0,
    addonPricePerCredit: 0,
    features: [
      "Custom volume",
      "Everything in Scale",
      "SSO & SAML",
      "Custom integrations",
      "SLA guarantee",
      "Dedicated account manager",
    ],
  },
];

/* ─────────────────────────────────────────────
   AI Model Preference
   ───────────────────────────────────────────── */

export type AIModel = "claude" | "gpt" | "gemini" | "kimi";

export const aiModelOptions: Array<{
  value: AIModel;
  label: string;
  description: string;
}> = [
  { value: "claude", label: "Claude", description: "Strongest personalization and narrative flow" },
  { value: "gpt", label: "GPT", description: "Polished layouts with clear structure" },
  { value: "gemini", label: "Gemini", description: "Data-rich slides with deep research" },
  { value: "kimi", label: "Kimi K2.5", description: "Sharp visuals and concise messaging" },
];

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
  logoFile?: File | null;
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

export interface RunDetail {
  id: string;
  status: string;
  targetCount: number;
  deliveryFormat: DeliveryFormat;
  reviewGateEnabled: boolean;
  sellerContext: SellerContext;
  questionnaire: RunQuestionnaire;
  sellerBrief?: Record<string, unknown>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  targets: RunTargetRecord[];
  artifacts: RunArtifactRecord[];
  events: RunEventRecord[];
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
    label: "PowerPoint (PPTX)",
    description:
      "Export as a .pptx file. Open in PowerPoint, Keynote, or Google Slides.",
    badge: "Recommended",
  },
  {
    value: "pdf",
    label: "PDF export",
    description:
      "Download as a portable PDF. Great for email attachments and offline viewing.",
  },
  {
    value: "bestdecks_editor",
    label: "Bestdecks editor",
    description:
      "Edit and present directly in our native editor with live collaboration.",
    badge: "Coming soon",
  },
  {
    value: "bestdecks_link",
    label: "Shareable link",
    description:
      "Send a bestdecks.co link — recipients view a polished, responsive deck instantly.",
    badge: "Coming soon",
  },
  {
    value: "google_slides",
    label: "Google Slides",
    description:
      "Push directly to Google Slides for easy sharing and team editing.",
    badge: "Coming soon",
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
    { value: "auto", label: "AI's Choice", description: "AI selects the best design for your content" },
    { value: "minimal", label: "Minimal", description: "Clean, spacious layouts with understated elegance" },
    { value: "editorial", label: "Editorial", description: "Bold typography and magazine-quality hierarchy" },
    { value: "sales_polished", label: "Consulting", description: "McKinsey-style authority with data-forward polish" },
    { value: "premium_modern", label: "Startup Modern", description: "Contemporary design like Stripe or Linear decks" },
    { value: "playful", label: "Creative", description: "Dynamic energy with bold color and layout variety" },
    { value: "dark_executive", label: "Dark Executive", description: "Deep charcoal with neon accents — boardroom-ready" },
    { value: "dark_minimal", label: "Dark Cinematic", description: "Dark background with moody editorial aesthetic" },
    { value: "custom", label: "Custom", description: "Describe your own visual direction" },
    { value: "mixed", label: "Surprise Me", description: "Random premium theme for each deck" },
  ];

export const imagePolicyOptions: Array<{ value: ImagePolicy; label: string; description?: string }> =
  [
    { value: "auto", label: "Smart auto", description: "AI decides where visuals add value" },
    { value: "always", label: "Every slide", description: "Include visuals on every slide" },
    { value: "never", label: "Text only", description: "No images — content and data only" },
  ];

export const visualContentTypeOptions: Array<{
  value: VisualContentType;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: "stock_photos", label: "Stock photos", description: "Professional photography to set the scene", icon: "📷" },
  { value: "infographics", label: "Infographics", description: "Visual storytelling with data and processes", icon: "📊" },
  { value: "charts_graphs", label: "Charts & graphs", description: "Data visualizations, bar charts, pie charts", icon: "📈" },
  { value: "icons_diagrams", label: "Icons & diagrams", description: "Simple icons, flowcharts, architecture diagrams", icon: "🔷" },
  { value: "screenshots", label: "Screenshots", description: "Product screenshots, tool interfaces, demos", icon: "🖥️" },
  { value: "custom_illustrations", label: "Custom illustrations", description: "AI-generated illustrations tailored to content", icon: "🎨" },
];

export const visualDensityOptions: Array<{
  value: VisualDensity;
  label: string;
  description: string;
}> = [
  { value: "minimal", label: "Minimal", description: "1-2 visuals per deck" },
  { value: "moderate", label: "Moderate", description: "Visuals on key slides" },
  { value: "rich", label: "Rich", description: "Visuals on most slides" },
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
    logoFile: null,
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
  logoFile?: File | null;
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
    websiteUrl: "", companyName: "", logoUrl: "", logoFile: null,
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
    imagePolicy: "auto",
    visualContentTypes: [],
    visualDensity: "moderate",
    mustIncludeText: "",
    mustAvoidText: "",
    extraInstructions: "",
    optionalReview: true,
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
    title: "Everything that moves your pipeline",
    description: "The 30-second view of what\u2019s working, what\u2019s stuck, and what to do next.",
  },
  onboarding: {
    eyebrow: "LAUNCH SEQUENCE",
    title: "90 seconds to your first killer deck",
    description: "Every field you fill here compounds into better personalization. Skip nothing.",
  },
  "seller-context": {
    eyebrow: "YOUR BUSINESS",
    title: "Your Offer",
    description: "Every field here becomes a slide. Vague input = vague decks. Specific input = decks that close.",
  },
  "run-settings": {
    eyebrow: "DECK BLUEPRINT",
    title: "Control exactly how your decks land",
    description: "These settings shape every slide. Dial them in once, then every deck comes out on-brand and on-target.",
  },
  "deck-structure": {
    eyebrow: "SLIDE ARCHITECTURE",
    title: "Engineer the exact story your deck tells",
    description: "Reorder, add, and remove slides. Each one becomes a prompt for the AI \u2014 the more specific, the sharper the output.",
  },
  "target-intake": {
    eyebrow: "TARGET LIST",
    title: "Feed the machine your hit list",
    description: "Every URL you add becomes a fully researched, personalized deck. More targets = more pipeline.",
  },
  pipeline: {
    eyebrow: "LIVE PIPELINE",
    title: "Watch your decks get built in real-time",
    description: "Each target goes through research, enrichment, and assembly. You\u2019ll see exactly where every deck is.",
  },
  delivery: {
    eyebrow: "DECK VAULT",
    title: "Your finished decks, ready to close deals",
    description: "Every deck has been researched, personalized, and quality-scored. Download, review, and send.",
  },
  pricing: {
    eyebrow: "PRICING",
    title: "More decks, lower price. Simple.",
    description: "Every deck is fully researched and personalized. Slide to match your outbound volume.",
  },
};
