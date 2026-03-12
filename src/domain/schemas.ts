import { z } from "zod";

export const deckArchetypeSchema = z.enum([
  "cold_outreach",
  "warm_intro",
  "agency_proposal",
]);

export const deliveryFormatSchema = z.enum([
  "presenton_editor",
  "pdf",
  "pptx",
]);

export const imagePolicySchema = z.enum([
  "auto",
  "never",
  "always",
]);

export const toneSchema = z.enum([
  "concise",
  "consultative",
  "bold",
  "executive",
  "friendly",
]);

export const visualStyleSchema = z.enum([
  "minimal",
  "editorial",
  "sales_polished",
  "premium_modern",
  "playful",
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
  optionalReview: z.boolean().default(true),
  allowUserApprovedCrawlException: z.boolean().default(false),
});

export const intakeRunSchema = z.object({
  sellerContext: sellerContextSchema,
  questionnaire: runQuestionnaireSchema,
  targets: z.array(companyRowSchema).min(1).max(100),
});

export type DeckArchetype = z.infer<typeof deckArchetypeSchema>;
export type DeliveryFormat = z.infer<typeof deliveryFormatSchema>;
export type ImagePolicy = z.infer<typeof imagePolicySchema>;
export type Tone = z.infer<typeof toneSchema>;
export type VisualStyle = z.infer<typeof visualStyleSchema>;
export type CompanyRow = z.infer<typeof companyRowSchema>;
export type SellerContext = z.infer<typeof sellerContextSchema>;
export type RunQuestionnaire = z.infer<typeof runQuestionnaireSchema>;
export type IntakeRun = z.infer<typeof intakeRunSchema>;
