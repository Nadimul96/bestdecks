import { z } from "zod";

import {
  CsvIntakeError,
  parseCsvText,
  parseTargetsFromCsvRows,
} from "./intake";

import {
  deckArchetypeSchema,
  deliveryFormatSchema,
  imagePolicySchema,
  toneSchema,
  visualContentTypeSchema,
  visualDensitySchema,
  visualStyleSchema,
} from "./schemas";

const draftText = (maximum: number) => z.string().trim().max(maximum);
const draftList = (itemMaximum: number, listMaximum = 100) =>
  z.array(draftText(itemMaximum)).max(listMaximum);

const providerEndpointSchema = z.string().trim().min(1).max(2_048).superRefine(
  (value, context) => {
    try {
      const url = new URL(value);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:")
        || url.username
        || url.password
        || url.search
        || url.hash
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provider endpoints must be credential-free HTTP(S) URLs.",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider endpoint is not a valid URL.",
      });
    }
  },
);

export const integrationProviderSchema = z.enum([
  "cloudflare",
  "deepcrawl",
  "perplexity",
  "gemini",
  "openai",
  "presenton",
  "plusai",
  "alai",
]);

const integrationBase = {
  displayName: draftText(200).optional(),
  secret: z.string().min(1).max(8_192).optional(),
  clearSecret: z.boolean().optional(),
  clearConfig: z.boolean().optional(),
};

export const presentonIntegrationConfigSchema = z.object({
  baseUrl: providerEndpointSchema.optional(),
  template: draftText(200).min(1).optional(),
  authMode: z.enum(["basic", "bearer"]).optional(),
  username: draftText(256).min(1).optional(),
}).strict();

export const cloudflareIntegrationConfigSchema = z.object({
  accountId: draftText(256).min(1),
}).strict();

const integrationSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("cloudflare"),
    ...integrationBase,
    config: cloudflareIntegrationConfigSchema.optional(),
  }).strict(),
  z.object({
    provider: z.literal("presenton"),
    ...integrationBase,
    // This is a patch, not a complete record. Cross-field authentication
    // invariants are checked against the effective stored state inside the
    // repository transaction.
    config: presentonIntegrationConfigSchema.optional(),
  }).strict(),
  ...(["deepcrawl", "perplexity", "gemini", "openai", "plusai", "alai"] as const)
    .map((provider) => z.object({
      provider: z.literal(provider),
      ...integrationBase,
      config: z.object({}).strict().optional(),
    }).strict()),
]).superRefine((integration, context) => {
  if (integration.secret && integration.clearSecret) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Set a secret or clear it, but do not request both.",
      path: ["clearSecret"],
    });
  }
});

export const profileDraftSchema = z.object({
  ownerName: draftText(300).optional(),
  ownerEmail: draftText(320).optional(),
  companyName: draftText(300).optional(),
  websiteUrl: draftText(2_048).optional(),
  timezone: draftText(200).optional(),
  defaultSignature: draftText(5_000).optional(),
}).strict();

export const sellerContextDraftSchema = z.object({
  websiteUrl: draftText(2_048).optional(),
  companyName: draftText(300).optional(),
  offerSummary: draftText(10_000).optional(),
  services: draftList(2_000).optional(),
  differentiators: draftList(2_000).optional(),
  targetCustomer: draftText(5_000).optional(),
  desiredOutcome: draftText(5_000).optional(),
  proofPoints: draftList(5_000).optional(),
  constraints: draftList(5_000).optional(),
}).strict();

export const questionnaireDraftSchema = z.object({
  archetype: deckArchetypeSchema.optional(),
  audience: draftText(2_000).optional(),
  audienceSize: draftText(1_000).optional(),
  audienceIndustry: draftText(1_000).optional(),
  audiencePainPoints: draftText(5_000).optional(),
  objective: draftText(5_000).optional(),
  successMetric: draftText(2_000).optional(),
  callToAction: draftText(2_000).optional(),
  ctaUrgency: draftText(1_000).optional(),
  outputFormat: deliveryFormatSchema.optional(),
  desiredCardCount: z.number().int().min(4).max(20).optional(),
  tone: toneSchema.optional(),
  customTone: draftText(1_000).optional(),
  visualStyle: visualStyleSchema.optional(),
  customVisualStyle: draftText(1_000).optional(),
  imagePolicy: imagePolicySchema.optional(),
  visualContentTypes: z.array(visualContentTypeSchema).max(6).optional(),
  visualDensity: visualDensitySchema.optional(),
  mustInclude: draftList(2_000).optional(),
  mustAvoid: draftList(2_000).optional(),
  extraInstructions: draftText(10_000).optional(),
  customArchetypePrompt: draftText(10_000).optional(),
  optionalReview: z.boolean().optional(),
  allowUserApprovedCrawlException: z.boolean().optional(),
}).strict();

export const onboardingPayloadSchema = z.object({
  profile: profileDraftSchema.default({}),
  sellerContext: sellerContextDraftSchema.optional(),
  questionnaire: questionnaireDraftSchema.optional(),
  integrations: z.array(integrationSchema).max(8).optional(),
  intakeDraft: z.object({
    websitesText: z.string().max(250_000).optional(),
    contactsCsvText: z.string().max(500_000).optional(),
  }).strict().optional(),
}).strict().superRefine((payload, context) => {
  const seen = new Set<string>();
  for (const [index, integration] of (payload.integrations ?? []).entries()) {
    if (seen.has(integration.provider)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each provider may appear at most once.",
        path: ["integrations", index, "provider"],
      });
    }
    seen.add(integration.provider);
  }

  const contactsCsvText = payload.intakeDraft?.contactsCsvText;
  if (contactsCsvText?.trim()) {
    try {
      parseTargetsFromCsvRows(parseCsvText(contactsCsvText));
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof CsvIntakeError
          ? error.message
          : "Target CSV is invalid.",
        path: ["intakeDraft", "contactsCsvText"],
      });
    }
  }
});

export type IntegrationProviderKey = z.infer<typeof integrationProviderSchema>;
export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
export type QuestionnaireDraft = z.infer<typeof questionnaireDraftSchema>;
export type SellerContextDraft = z.infer<typeof sellerContextDraftSchema>;
