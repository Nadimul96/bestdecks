import { z } from "zod";

import { normalizePersistableSourceUrl } from "./source-url";

export const MAX_TARGETS_PER_RUN = 100;

export const DECK_ARCHETYPES = [
  "cold_outreach",
  "warm_intro",
  "agency_proposal",
  "investor_pitch",
  "case_study",
  "competitive_displacement",
  "thought_leadership",
  "product_launch",
  "custom",
] as const;

export const deckArchetypeSchema = z.enum(DECK_ARCHETYPES);

export const deliveryFormatSchema = z.enum([
  "bestdecks_editor",
  "bestdecks_link",
  "pdf",
  "pptx",
  "google_slides",
]);

export const imagePolicySchema = z.enum([
  "auto",
  "never",
  "always",
]);

export const visualContentTypeSchema = z.enum([
  "stock_photos",
  "infographics",
  "charts_graphs",
  "icons_diagrams",
  "screenshots",
  "custom_illustrations",
]);

export const visualDensitySchema = z.enum([
  "minimal",
  "moderate",
  "rich",
]);

export const toneSchema = z.enum([
  "concise",
  "consultative",
  "bold",
  "executive",
  "friendly",
  "custom",
]);

export const visualStyleSchema = z.enum([
  "auto",
  "minimal",
  "editorial",
  "sales_polished",
  "premium_modern",
  "playful",
  "dark_executive",
  "dark_minimal",
  "custom",
  "mixed",
]);

export const publicHttpUrlSchema = z.string().trim().min(1).max(2_048).url().superRefine(
  (value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Website URLs must use HTTP or HTTPS.",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Website URLs cannot contain credentials.",
      });
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".home.arpa")
      || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
      || hostname.includes(":")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Website URLs must use a public hostname.",
      });
    }
  },
).transform(normalizePersistableSourceUrl);

export const companyRowSchema = z.object({
  websiteUrl: publicHttpUrlSchema,
  companyName: z.string().trim().min(1).max(300).optional(),
  firstName: z.string().trim().min(1).max(200).optional(),
  lastName: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(300).optional(),
  campaignGoal: z.string().trim().min(1).max(2_000).optional(),
  notes: z.string().trim().min(1).max(5_000).optional(),
}).strict();

export const sellerContextSchema = z
  .object({
    websiteUrl: publicHttpUrlSchema.optional(),
    companyName: z.string().trim().min(1).max(300).optional(),
    offerSummary: z.string().trim().min(1).max(10_000),
    services: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
    differentiators: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
    targetCustomer: z.string().trim().min(1).max(5_000),
    desiredOutcome: z.string().trim().min(1).max(5_000),
    proofPoints: z.array(z.string().trim().min(1).max(5_000)).max(100).default([]),
    constraints: z.array(z.string().trim().min(1).max(5_000)).max(100).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.websiteUrl && !value.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Seller context requires at least a websiteUrl or companyName so the offer can be anchored.",
        path: ["websiteUrl"],
      });
    }
  });

export const runQuestionnaireSchema = z.object({
  archetype: deckArchetypeSchema,
  audience: z.string().trim().min(1).max(2_000),
  objective: z.string().trim().min(1).max(5_000),
  callToAction: z.string().trim().min(1).max(2_000),
  outputFormat: deliveryFormatSchema,
  desiredCardCount: z.number().int().min(4).max(20),
  tone: toneSchema,
  visualStyle: visualStyleSchema,
  imagePolicy: imagePolicySchema,
  mustInclude: z.array(z.string().trim().min(1).max(2_000)).max(100).default([]),
  mustAvoid: z.array(z.string().trim().min(1).max(2_000)).max(100).default([]),
  extraInstructions: z.string().trim().min(1).max(10_000).optional(),
  customArchetypePrompt: z.string().trim().min(1).max(10_000).optional(),
  customTone: z.string().trim().min(1).max(1_000).optional(),
  customVisualStyle: z.string().trim().min(1).max(1_000).optional(),
  visualContentTypes: z.array(visualContentTypeSchema).max(6).default([]),
  visualDensity: visualDensitySchema.default("rich"),
  optionalReview: z.boolean().default(false),
  allowUserApprovedCrawlException: z.boolean().default(false),
}).strict().superRefine((questionnaire, context) => {
  const customTonePresent = Boolean(questionnaire.customTone?.trim());
  if (questionnaire.tone === "custom" && !customTonePresent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A custom tone requires its bounded tone instruction.",
      path: ["customTone"],
    });
  } else if (questionnaire.tone !== "custom" && customTonePresent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A custom tone instruction requires tone=custom.",
      path: ["customTone"],
    });
  }

  const customVisualStylePresent = Boolean(questionnaire.customVisualStyle?.trim());
  if (questionnaire.visualStyle === "custom" && !customVisualStylePresent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A custom visual style requires its bounded style instruction.",
      path: ["customVisualStyle"],
    });
  } else if (questionnaire.visualStyle !== "custom" && customVisualStylePresent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A custom visual-style instruction requires visualStyle=custom.",
      path: ["customVisualStyle"],
    });
  }
});

export const intakeRunSchema = z.object({
  sellerContext: sellerContextSchema,
  questionnaire: runQuestionnaireSchema,
  targets: z.array(companyRowSchema).min(1).max(MAX_TARGETS_PER_RUN),
}).strict();

/* ─────────────────────────────────────────────
   Business Schema
   ───────────────────────────────────────────── */

export const businessSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  websiteUrl: z.string().url(),
  logoUrl: z.string().url().optional(),
  setupComplete: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/* ─────────────────────────────────────────────
   Pricing Model
   ───────────────────────────────────────────── */

export const pricingModelSchema = z.enum([
  "subscription",
  "one_time",
  "retainer",
  "usage_based",
  "freemium",
  "custom",
]);

/* ─────────────────────────────────────────────
   Case Study
   ───────────────────────────────────────────── */

export const caseStudyMetricSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const caseStudySchema = z.object({
  id: z.string().min(1),
  clientName: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  challenge: z.string().trim().min(1),
  solution: z.string().trim().min(1),
  results: z.string().trim().min(1),
  metrics: z.array(caseStudyMetricSchema).default([]),
  testimonialQuote: z.string().trim().min(1).optional(),
  logoUrl: z.string().url().optional(),
});

/* ─────────────────────────────────────────────
   Objection
   ───────────────────────────────────────────── */

export const objectionSchema = z.object({
  objection: z.string().trim().min(1),
  response: z.string().trim().min(1),
});

/* ─────────────────────────────────────────────
   Seller Knowledge (extends SellerContext)
   ───────────────────────────────────────────── */

export const sellerKnowledgeSchema = z
  .object({
    // Identity
    websiteUrl: z.string().url().optional(),
    companyName: z.string().trim().min(1).optional(),
    logoUrl: z.string().url().optional(),
    tagline: z.string().trim().min(1).optional(),
    foundedYear: z.number().int().min(1800).max(2100).optional(),
    teamSize: z.string().trim().min(1).optional(),
    headquarters: z.string().trim().min(1).optional(),

    // Offer core (required)
    offerSummary: z.string().trim().min(1),
    services: z.array(z.string().trim().min(1)).min(1),
    differentiators: z.array(z.string().trim().min(1)).min(1),
    targetCustomer: z.string().trim().min(1),
    desiredOutcome: z.string().trim().min(1),

    // Pricing
    pricingModel: pricingModelSchema.optional(),
    pricingContext: z.string().trim().min(1).optional(),

    // Proof
    proofPoints: z.array(z.string().trim().min(1)).default([]),
    caseStudies: z.array(caseStudySchema).default([]),
    clientLogos: z.array(z.string().url()).default([]),
    awards: z.array(z.string().trim().min(1)).default([]),

    // Sales intelligence
    commonObjections: z.array(objectionSchema).default([]),
    competitorNotes: z.string().trim().min(1).optional(),
    salesPlaybook: z.string().trim().min(1).optional(),

    // Guardrails
    constraints: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.websiteUrl && !value.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Seller knowledge requires at least a websiteUrl or companyName so the offer can be anchored.",
        path: ["websiteUrl"],
      });
    }
  });

/* ─────────────────────────────────────────────
   Seller-context completion evidence
   ───────────────────────────────────────────── */

export const SELLER_CONTEXT_COMPLETION_CHECK_KEYS = [
  "hasOfferSummary",
  "hasAtLeastTwoServices",
  "hasAtLeastTwoDifferentiators",
  "hasTargetCustomer",
  "hasDesiredOutcome",
  "hasAtLeastThreeProofPoints",
  "hasCaseStudyWithChallengeAndResult",
  "hasObjectionWithResponse",
  "hasPricingModel",
  "hasCompetitorNotes",
] as const;

export type SellerContextCompletionCheckKey =
  (typeof SELLER_CONTEXT_COMPLETION_CHECK_KEYS)[number];

export type SellerContextCompletion = Readonly<{
  completed: number;
  total: number;
  percentage: number;
  checks: Readonly<Record<SellerContextCompletionCheckKey, boolean>>;
}>;

/**
 * Reports which seller-context inputs are present. Every named check has equal
 * weight. This measures input completion only; it is not a proposal-quality or
 * outcome prediction.
 */
export function computeSellerContextCompletion(
  knowledge: SellerKnowledge,
): SellerContextCompletion {
  const checks = {
    hasOfferSummary: knowledge.offerSummary.trim().length > 0,
    hasAtLeastTwoServices:
      knowledge.services.filter((service) => service.trim().length > 0).length >= 2,
    hasAtLeastTwoDifferentiators:
      knowledge.differentiators.filter((item) => item.trim().length > 0).length >= 2,
    hasTargetCustomer: knowledge.targetCustomer.trim().length > 0,
    hasDesiredOutcome: knowledge.desiredOutcome.trim().length > 0,
    hasAtLeastThreeProofPoints:
      knowledge.proofPoints.filter((point) => point.trim().length > 0).length >= 3,
    hasCaseStudyWithChallengeAndResult: knowledge.caseStudies.some(
      (study) =>
        study.clientName.trim().length > 0
        && study.challenge.trim().length > 0
        && study.results.trim().length > 0,
    ),
    hasObjectionWithResponse: knowledge.commonObjections.some(
      (item) => item.objection.trim().length > 0 && item.response.trim().length > 0,
    ),
    hasPricingModel: Boolean(knowledge.pricingModel),
    hasCompetitorNotes: Boolean(knowledge.competitorNotes?.trim()),
  } satisfies Record<SellerContextCompletionCheckKey, boolean>;

  const total = SELLER_CONTEXT_COMPLETION_CHECK_KEYS.length;
  const completed = SELLER_CONTEXT_COMPLETION_CHECK_KEYS.reduce(
    (count, key) => count + Number(checks[key]),
    0,
  );

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
    checks,
  };
}

/* ─────────────────────────────────────────────
   Inferred Types
   ───────────────────────────────────────────── */

export type DeckArchetype = z.infer<typeof deckArchetypeSchema>;
export type DeliveryFormat = z.infer<typeof deliveryFormatSchema>;
export type ImagePolicy = z.infer<typeof imagePolicySchema>;
export type Tone = z.infer<typeof toneSchema>;
export type VisualStyle = z.infer<typeof visualStyleSchema>;
export type CompanyRow = z.infer<typeof companyRowSchema>;
export type SellerContext = z.infer<typeof sellerContextSchema>;
export type RunQuestionnaire = z.infer<typeof runQuestionnaireSchema>;
export type IntakeRun = z.infer<typeof intakeRunSchema>;
export type BusinessRecord = z.infer<typeof businessSchema>;
export type VisualContentType = z.infer<typeof visualContentTypeSchema>;
export type VisualDensity = z.infer<typeof visualDensitySchema>;
export type PricingModel = z.infer<typeof pricingModelSchema>;
export type CaseStudy = z.infer<typeof caseStudySchema>;
export type Objection = z.infer<typeof objectionSchema>;
export type SellerKnowledge = z.infer<typeof sellerKnowledgeSchema>;
