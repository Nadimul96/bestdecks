import type {
  CompanyRow,
  DeckArchetype,
  DeliveryFormat,
  ImagePolicy,
  RunQuestionnaire,
  SellerContext,
  Tone,
  VisualStyle,
} from "@/src/domain/schemas";
import type { IntegrationProviderKey } from "@/src/server/settings";

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
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  proofPointsText: string;
  constraintsText: string;
}

export interface QuestionnaireForm {
  archetype: DeckArchetype;
  audience: string;
  objective: string;
  callToAction: string;
  outputFormat: DeliveryFormat;
  desiredCardCount: string;
  tone: Tone;
  visualStyle: VisualStyle;
  imagePolicy: ImagePolicy;
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
  status: string;
  target_count: number;
  delivery_format: DeliveryFormat;
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
  | { type: "success" | "error" | "info"; message: string }
  | null;

/* ─────────────────────────────────────────────
   Option Arrays (used by views)
   ───────────────────────────────────────────── */

export type DeckIntent = "cold_pitch" | "post_call" | "agency_rfp" | "investor" | "custom";

export const intentOptions: Array<{
  value: DeckIntent;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    value: "cold_pitch",
    label: "Cold Outreach",
    description: "Pitch companies that don't know you yet",
    emoji: "🎯",
  },
  {
    value: "post_call",
    label: "Post-Call Deck",
    description: "Follow up after a discovery call",
    emoji: "📞",
  },
  {
    value: "agency_rfp",
    label: "Agency Proposal",
    description: "Respond to an RFP or pitch a retainer",
    emoji: "📋",
  },
  {
    value: "investor",
    label: "Investor Deck",
    description: "Pitch investors with tailored context",
    emoji: "💰",
  },
];

export const archetypeOptions: Array<{
  value: DeckArchetype;
  label: string;
  description: string;
}> = [
  {
    value: "cold_outreach",
    label: "Cold Outreach",
    description:
      "Lead with company-specific evidence and a narrow, credible call to action.",
  },
  {
    value: "warm_intro",
    label: "Warm Intro",
    description:
      "Frame shared context, likely upside, and why the conversation should happen now.",
  },
  {
    value: "agency_proposal",
    label: "Agency Proposal",
    description:
      "Translate research into a tailored recommendation, scope direction, and next step.",
  },
];

export const outputFormatOptions: Array<{
  value: DeliveryFormat;
  label: string;
  description: string;
}> = [
  {
    value: "presenton_editor",
    label: "Presenton editor",
    description:
      "Fastest local path and the only export mode verified on this machine.",
  },
  {
    value: "pdf",
    label: "PDF",
    description: "Portable file output. Remote Presenton export is recommended.",
  },
  {
    value: "pptx",
    label: "PPTX",
    description:
      "Portable slide deck. Remote Presenton export is recommended.",
  },
];

export const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "concise", label: "Concise" },
  { value: "consultative", label: "Consultative" },
  { value: "bold", label: "Bold" },
  { value: "executive", label: "Executive" },
  { value: "friendly", label: "Friendly" },
];

export const visualStyleOptions: Array<{ value: VisualStyle; label: string }> =
  [
    { value: "minimal", label: "Minimal" },
    { value: "editorial", label: "Editorial" },
    { value: "sales_polished", label: "Sales polished" },
    { value: "premium_modern", label: "Premium modern" },
    { value: "playful", label: "Playful" },
  ];

export const imagePolicyOptions: Array<{ value: ImagePolicy; label: string }> =
  [
    { value: "auto", label: "Auto" },
    { value: "never", label: "Never" },
    { value: "always", label: "Always" },
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
    offerSummary: "",
    servicesText: "",
    differentiatorsText: "",
    targetCustomer: "",
    desiredOutcome: "",
    proofPointsText: "",
    constraintsText: "",
  };
}

export function defaultQuestionnaire(): QuestionnaireForm {
  return {
    archetype: "cold_outreach",
    audience: "",
    objective: "",
    callToAction: "",
    outputFormat: "presenton_editor",
    desiredCardCount: "8",
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "auto",
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
    eyebrow: "Run Settings",
    title: "Configure your deck style",
    description:
      "Choose the archetype, tone, visual style, and output format for your next run.",
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
};
