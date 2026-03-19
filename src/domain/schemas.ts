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
  "custom",
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
