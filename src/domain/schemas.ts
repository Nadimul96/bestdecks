import { z } from "zod";

export const deckArchetypeSchema = z.enum([
  "cold_outreach",
  "warm_intro",
  "agency_proposal",
  "investor_pitch",
  "case_study",
  "competitive_displacement",
  "thought_leadership",
  "product_launch",
  "custom",
]);

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

export const companyRowSchema = z.object({
  websiteUrl: z.string().url(),
  companyName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  campaignGoal: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export const sellerContextSchema = z
  .object({
    websiteUrl: z.string().url().optional(),
    companyName: z.string().trim().min(1).optional(),
    offerSummary: z.string().trim().min(1),
    services: z.array(z.string().trim().min(1)).min(1),
    differentiators: z.array(z.string().trim().min(1)).min(1),
    targetCustomer: z.string().trim().min(1),
    desiredOutcome: z.string().trim().min(1),
    proofPoints: z.array(z.string().trim().min(1)).default([]),
    constraints: z.array(z.string().trim().min(1)).default([]),
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
  audience: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  callToAction: z.string().trim().min(1),
  outputFormat: deliveryFormatSchema,
  desiredCardCount: z.number().int().min(4).max(20),
  tone: toneSchema,
  visualStyle: visualStyleSchema,
  imagePolicy: imagePolicySchema,
  mustInclude: z.array(z.string().trim().min(1)).default([]),
  mustAvoid: z.array(z.string().trim().min(1)).default([]),
  extraInstructions: z.string().trim().min(1).optional(),
  customArchetypePrompt: z.string().trim().min(1).optional(),
  customTone: z.string().trim().min(1).optional(),
  customVisualStyle: z.string().trim().min(1).optional(),
  visualContentTypes: z.array(visualContentTypeSchema).default([]),
  visualDensity: visualDensitySchema.default("moderate"),
  optionalReview: z.boolean().default(true),
  allowUserApprovedCrawlException: z.boolean().default(false),
});

export const intakeRunSchema = z.object({
  sellerContext: sellerContextSchema,
  questionnaire: runQuestionnaireSchema,
  targets: z.array(companyRowSchema).min(1).max(100),
});

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
   Deck Score Schema
   ───────────────────────────────────────────── */

export const deckScoreBreakdownSchema = z.object({
  relevance: z.number().min(0).max(100),
  completeness: z.number().min(0).max(100),
  persuasion: z.number().min(0).max(100),
  visualQuality: z.number().min(0).max(100),
  personalization: z.number().min(0).max(100),
});

export const deckScoreSchema = z.object({
  deckId: z.string(),
  overallScore: z.number().min(0).max(100),
  breakdown: deckScoreBreakdownSchema,
  feedback: z.array(z.string()),
  infoRequests: z.array(
    z.object({
      field: z.string(),
      question: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      businessId: z.string(),
    }),
  ),
  scoredAt: z.string().datetime(),
});

/* ─────────────────────────────────────────────
   Credits Schema
   ───────────────────────────────────────────── */

export const planTierSchema = z.enum([
  "free",
  "starter",
  "growth",
  "scale",
  "enterprise",
]);

export const userCreditsSchema = z.object({
  userId: z.string(),
  balance: z.number().int().min(0),
  monthlyAllowance: z.number().int().min(0),
  bonusCredits: z.number().int().min(0).default(0),
  planTier: planTierSchema,
  resetDate: z.string().datetime(),
});

/* ─────────────────────────────────────────────
   AI Model Preference
   ───────────────────────────────────────────── */

export const aiModelSchema = z.enum(["claude", "gpt", "gemini", "kimi"]);

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
   Offer Strength Score
   ───────────────────────────────────────────── */

/** Computes 0–10 score reflecting how rich the seller knowledge is. */
export function computeOfferStrengthScore(k: SellerKnowledge): number {
  let score = 0;

  // offerSummary filled: +1
  if (k.offerSummary.trim().length > 0) score += 1;

  // services >= 2: +1
  if (k.services.length >= 2) score += 1;

  // differentiators >= 2: +1
  if (k.differentiators.length >= 2) score += 1;

  // targetCustomer filled: +1
  if (k.targetCustomer.trim().length > 0) score += 1;

  // desiredOutcome filled: +1
  if (k.desiredOutcome.trim().length > 0) score += 1;

  // proofPoints: 1-2 = +0.5, 3+ = +1
  if (k.proofPoints.length >= 3) score += 1;
  else if (k.proofPoints.length >= 1) score += 0.5;

  // caseStudies with at least challenge+results filled: +2
  const completeCaseStudies = k.caseStudies.filter(
    (cs) => cs.challenge.trim().length > 0 && cs.results.trim().length > 0
  );
  if (completeCaseStudies.length >= 1) score += 2;

  // commonObjections >= 1: +1
  if (k.commonObjections.length >= 1) score += 1;

  // pricingModel set: +0.5
  if (k.pricingModel) score += 0.5;

  // competitorNotes filled: +0.5
  if (k.competitorNotes && k.competitorNotes.trim().length > 0) score += 0.5;

  return Math.min(10, Math.max(0, score));
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
export type DeckScoreRecord = z.infer<typeof deckScoreSchema>;
export type UserCreditsRecord = z.infer<typeof userCreditsSchema>;
export type AIModelType = z.infer<typeof aiModelSchema>;
export type VisualContentType = z.infer<typeof visualContentTypeSchema>;
export type VisualDensity = z.infer<typeof visualDensitySchema>;
export type PricingModel = z.infer<typeof pricingModelSchema>;
export type CaseStudy = z.infer<typeof caseStudySchema>;
export type Objection = z.infer<typeof objectionSchema>;
export type SellerKnowledge = z.infer<typeof sellerKnowledgeSchema>;
