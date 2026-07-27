import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import { evaluateEvidence } from "@/src/domain/evidence";
import { visualProfileVerificationSchema } from "@/src/domain/visual-profile";
import { hashExpectedSlideText } from "@/src/integrations/pptx-content-verifier";
import { slidePlanSchema, type SlidePlan } from "@/src/server/slide-planner";

const HttpArtifactUrlSchema = z.string().min(1).max(8_192).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      value !== value.trim()
      || !["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || url.hash
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid artifact URL." });
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid artifact URL." });
  }
});

const TimingSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
}).strict();

const ReadinessSchema = z.object({
  requiredSlideFieldsPresent: z.boolean(),
  ctaPresent: z.boolean(),
  evidenceGatePassed: z.boolean(),
  artifactReadable: z.boolean(),
  providerProvenancePresent: z.boolean(),
  visualProfileVerified: z.boolean(),
}).strict();

const EvidenceEvaluationSchema = z.object({
  coverage: z.object({
    supportedFactualClaims: z.number().int().nonnegative(),
    factualClaims: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1).nullable(),
    percent: z.number().min(0).max(100).nullable(),
  }).strict(),
  unsupportedFactualClaimIds: z.array(z.string()),
  sellerClaimIds: z.array(z.string()),
  modelInferenceClaimIds: z.array(z.string()),
  claimLabels: z.array(z.object({
    claimId: z.string(),
    claimClass: z.enum(["seller_claim", "external_fact", "model_inference"]),
    label: z.enum(["source-backed", "seller-supplied", "model-inference", "unsupported"]),
  }).strict()),
  deliveryGate: z.object({
    canDeliver: z.boolean(),
    blockingClaimIds: z.array(z.string()),
    requiredCoverageRatio: z.literal(1),
    policy: z.literal("all_factual_claims_must_be_source_backed"),
  }).strict(),
}).strict();

const PlanningCheckpointSchema = z.object({
  outcome: z.literal("ready"),
  plan: slidePlanSchema,
  evidenceEvaluation: EvidenceEvaluationSchema,
  readiness: ReadinessSchema,
  timing: TimingSchema,
}).strict();

const RenderingCheckpointSchema = z.object({
  outcome: z.literal("delivered"),
  result: z.object({
    presentationId: z.string().trim().min(1).max(200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
    editorUrl: HttpArtifactUrlSchema.optional(),
    exportUrl: HttpArtifactUrlSchema.optional(),
    rawPath: z.string().max(4_096).optional(),
    usage: z.object({
      unit: z.literal("credits"),
      amount: z.number().finite().nonnegative(),
    }).strict().optional(),
  }).strict(),
  verification: z.object({
    url: HttpArtifactUrlSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    byteLength: z.number().int().positive().max(MAX_DELIVERY_ARTIFACT_BYTES),
    contentType: z.string().trim().min(1).max(200).optional(),
    verifiedAt: z.string().datetime({ offset: true }),
    contentVerification: z.object({
      method: z.literal("pptx_ooxml_rich_static_v2"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      slideCount: z.number().int().positive().max(60),
    }).strict(),
    visualProfile: visualProfileVerificationSchema,
  }).strict(),
  readiness: ReadinessSchema,
  timing: TimingSchema,
}).strict().superRefine((delivery, context) => {
  if (!delivery.result.exportUrl) return;

  let exportUrl: string;
  let verifiedUrl: string;
  try {
    exportUrl = new URL(delivery.result.exportUrl).toString();
    verifiedUrl = new URL(delivery.verification.url).toString();
  } catch {
    // The field-level URL schemas report the malformed value. Cross-field
    // validation must remain total and must never turn persisted corruption
    // into an uncaught read-path exception.
    return;
  }

  if (exportUrl !== verifiedUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The verified artifact does not match the export URL.",
      path: ["verification", "url"],
    });
  }
});

type PlanningCheckpoint = z.infer<typeof PlanningCheckpointSchema>;
type RenderingCheckpoint = z.infer<typeof RenderingCheckpointSchema>;

export interface VerifiedShareArtifacts {
  planning: PlanningCheckpoint;
  delivery: RenderingCheckpoint;
}

export type ShareCheckpointStage = "planning" | "rendering";

/** Exact durable-worker key; legacy or provider-response checkpoints do not qualify. */
export function shareCheckpointKey(targetId: string, stage: ShareCheckpointStage): string {
  return `target:${targetId}:${stage}:v1`;
}

/**
 * Parse the two persisted worker artifacts as one shareability contract.
 *
 * This is deliberately fail-closed and side-effect free so every server read
 * surface can reuse the same eligibility decision. A structurally valid but
 * contradictory evidence receipt is rejected by recomputing it from the
 * persisted claim ledger.
 */
export function parseVerifiedShareArtifacts(
  planningArtifact: unknown,
  deliveryArtifact: unknown,
): VerifiedShareArtifacts | null {
  const planning = PlanningCheckpointSchema.safeParse(planningArtifact);
  const delivery = RenderingCheckpointSchema.safeParse(deliveryArtifact);
  if (!planning.success || !delivery.success) return null;

  const planningReadiness = planning.data.readiness;
  if (
    !planningReadiness.requiredSlideFieldsPresent
    || !planningReadiness.ctaPresent
    || !planningReadiness.evidenceGatePassed
    || planningReadiness.artifactReadable
    || !planningReadiness.providerProvenancePresent
    || planningReadiness.visualProfileVerified
  ) {
    return null;
  }

  const evaluatedEvidence = evaluateEvidence(planning.data.plan.evidence);
  if (
    !evaluatedEvidence.deliveryGate.canDeliver
    || evaluatedEvidence.deliveryGate.blockingClaimIds.length > 0
    || evaluatedEvidence.unsupportedFactualClaimIds.length > 0
    || !isDeepStrictEqual(planning.data.evidenceEvaluation, evaluatedEvidence)
  ) {
    return null;
  }

  if (!Object.values(delivery.data.readiness).every(Boolean)) return null;

  const expectedSlides = planning.data.plan.slides.map(({ headline, bulletPoints }) => ({
    headline,
    bulletPoints,
  }));
  if (
    delivery.data.verification.contentVerification.slideCount !== expectedSlides.length
    || delivery.data.verification.visualProfile.measuredRichness.slideCount
      !== expectedSlides.length
    || delivery.data.verification.contentVerification.sha256
      !== hashExpectedSlideText(expectedSlides)
  ) {
    return null;
  }

  return {
    planning: planning.data,
    delivery: delivery.data,
  };
}

export function hasVerifiedShareArtifacts(
  planningArtifact: unknown,
  deliveryArtifact: unknown,
): boolean {
  return parseVerifiedShareArtifacts(planningArtifact, deliveryArtifact) !== null;
}

/** Only these fields from the verified plan may cross the public boundary. */
export interface PublicShareSlide {
  type: "cover" | "content" | "closing";
  title: string;
  bullets: string[];
}

function publicSlideType(index: number, total: number): PublicShareSlide["type"] {
  if (index === 0) return "cover";
  if (index === total - 1) return "closing";
  return "content";
}

function projectPlan(plan: SlidePlan): PublicShareSlide[] {
  return plan.slides.map((slide, index, allSlides) => ({
    type: publicSlideType(index, allSlides.length),
    title: slide.headline,
    bullets: slide.bulletPoints,
  }));
}

/**
 * Project a canonical planning checkpoint into recipient-safe slide content.
 * Raw/legacy plans and malformed checkpoint envelopes intentionally map to no
 * slides; callers must never guess which persisted shape they received.
 */
export function mapSlidePlanToPublicSlides(planningArtifact: unknown): PublicShareSlide[] {
  const planning = PlanningCheckpointSchema.safeParse(planningArtifact);
  return planning.success ? projectPlan(planning.data.plan) : [];
}
