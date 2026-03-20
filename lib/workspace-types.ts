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

export type PlanTier = "starter" | "growth" | "scale" | "enterprise";

export interface UserCredits {
  userId: string;
  balance: number;
  monthlyAllowance: number;
  bonusCredits: number;
  planTier: PlanTier;
  resetDate: string;
}

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
}> = [
  {
    value: "cold_outreach",
    label: "Cold Outreach",
    description:
      "Lead with company-specific evidence and a narrow, credible call to action.",
    detail:
      "Best for first-touch outreach to prospects who don't know you. Opens with a researched hook about their business, frames your value against their specific pain points, and closes with a single low-friction CTA.",
  },
  {
    value: "warm_intro",
    label: "Warm Intro",
    description:
      "Frame shared context, likely upside, and why the conversation should happen now.",
    detail:
      "Ideal when you have a mutual connection, met at an event, or the prospect engaged with your content. Emphasizes common ground and makes the case for a timely conversation.",
  },
  {
    value: "agency_proposal",
    label: "Agency Proposal",
    description:
      "Translate research into a tailored recommendation, scope direction, and next step.",
    detail:
      "Structures a formal proposal around the prospect's stated needs: scope, timeline, deliverables, pricing context, and team fit. Works for both retainers and project-based engagements.",
  },
  {
    value: "investor_pitch",
    label: "Investor Pitch",
    description:
      "Build a narrative around opportunity, traction, and your ask.",
    detail:
      "Follows the classic pitch flow: problem, solution, market size, traction, team, and ask. Adapts framing based on the investor's portfolio focus and stage preference.",
  },
  {
    value: "case_study",
    label: "Case Study",
    description:
      "Let results tell the story with data-driven proof points.",
    detail:
      "Leads with measurable outcomes, walks through the challenge-solution-result arc, and ends with a 'you could see similar results' bridge. Great for mid-funnel nurture.",
  },
  {
    value: "competitive_displacement",
    label: "Competitive Swap",
    description:
      "Show why switching from their current solution makes sense now.",
    detail:
      "Tactfully positions your solution against their incumbent. Highlights switching triggers, migration ease, and ROI of change without being overtly negative about competitors.",
  },
  {
    value: "thought_leadership",
    label: "Thought Leadership",
    description:
      "Educate first, then naturally position your solution.",
    detail:
      "Opens with industry insights or a provocative trend, builds credibility through data and perspective, then pivots to how your approach addresses the shift. Ideal for top-of-funnel education.",
  },
  {
    value: "product_launch",
    label: "Product Launch",
    description:
      "Announce new capabilities with clarity and excitement.",
    detail:
      "Structured around what's new, why it matters, who it's for, and how to get started. Works for feature launches, new product lines, or major platform updates.",
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
    { value: "auto", label: "AI's Choice", description: "Let AI pick the best template for your content" },
    { value: "minimal", label: "Minimal", description: "Clean lines, white space, understated" },
    { value: "editorial", label: "Editorial", description: "Magazine-quality layouts with bold typography" },
    { value: "sales_polished", label: "Sales Polished", description: "Professional with brand-forward polish" },
    { value: "premium_modern", label: "Premium Modern", description: "Sophisticated gradients and sharp design" },
    { value: "playful", label: "Playful", description: "Colorful, dynamic, energetic" },
    { value: "custom", label: "Custom", description: "Describe your own visual style" },
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

export function defaultQuestionnaire(): QuestionnaireForm {
  return {
    archetype: "cold_outreach",
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
    eyebrow: "Overview",
    title: "Your workspace at a glance",
    description:
      "Track readiness, recent runs, and what still needs your attention.",
  },
  onboarding: {
    eyebrow: "Get Started",
    title: "Let\u2019s set you up",
    description:
      "Three quick steps and you\u2019re ready to generate your first deck.",
  },
  "seller-context": {
    eyebrow: "Your Business",
    title: "What do you sell?",
    description:
      "The deck quality depends on this step. Help us understand your offer, services, and intended outcome.",
  },
  "run-settings": {
    eyebrow: "Deck Style",
    title: "Design your deck blueprint",
    description:
      "Define the archetype, audience, tone, visuals, and export format that shape every deck you generate.",
  },
  "deck-structure": {
    eyebrow: "Structure",
    title: "Slide-by-slide outline",
    description:
      "Preview the content structure of your decks. Each slide is customized per target at generation time.",
  },
  "target-intake": {
    eyebrow: "Targets",
    title: "Who are you reaching out to?",
    description:
      "Paste website URLs or upload a CSV with company and contact details.",
  },
  pipeline: {
    eyebrow: "Pipeline",
    title: "Research & generation progress",
    description:
      "Track crawling, enrichment, image generation, and deck assembly across all targets.",
  },
  delivery: {
    eyebrow: "Delivery",
    title: "Review & download",
    description:
      "Access completed decks, review quality gates, and download your personalized proposals.",
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Plans & credits",
    description:
      "Choose a plan that fits your volume. 1 credit = 1 deck, end to end.",
  },
};
