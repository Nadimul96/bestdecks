import { z } from "zod";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "./artifact-limits";
import {
  EVIDENCE_LEDGER_SCHEMA_VERSION,
  EVIDENCE_RUBRIC_VERSION,
  evaluateEvidence,
  evidenceLedgerSchema,
} from "./evidence";
import {
  providerCostSchema,
  providerHealthSchema,
  providerUsageMetricSchema,
} from "./provider-observability";
import { visualProfileVerificationSchema } from "./visual-profile";

const activeStageSchema = z.enum([
  "crawling",
  "enriching",
  "brief_ready",
  "planning",
  "rendering",
]);

const terminalStateSchema = z.enum([
  "delivered",
  "partially_completed",
  "failed",
  "cancelled",
]);

const safeIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const receiptUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Receipt URLs cannot retain credentials, query parameters, or fragments.",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Receipt URLs must use HTTP or HTTPS.",
    });
  }
});

const artifactReceiptUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const allowedQueryKeys = new Set(["id", "presentation_id"]);
  if (
    url.username
    || url.password
    || url.hash
    || [...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifact receipt URLs may retain only non-secret presentation identifiers.",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifact receipt URLs must use HTTP or HTTPS.",
    });
  }
});

const evidenceCoverageSchema = z.object({
  supportedFactualClaims: z.number().int().nonnegative(),
  factualClaims: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1).nullable(),
}).strict().superRefine((coverage, context) => {
  const expected = coverage.factualClaims === 0
    ? null
    : coverage.supportedFactualClaims / coverage.factualClaims;
  if (
    coverage.supportedFactualClaims > coverage.factualClaims
    || coverage.ratio !== expected
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Evidence coverage must preserve the exact supported/total fraction.",
    });
  }
});

const evidenceContractSchema = z.object({
  ledgerSchemaVersion: z.literal(EVIDENCE_LEDGER_SCHEMA_VERSION),
  rubricVersion: z.literal(EVIDENCE_RUBRIC_VERSION),
}).strict();

const receiptEvidenceLedgerSchema = evidenceLedgerSchema.superRefine((ledger, context) => {
  ledger.sources.forEach((source, sourceIndex) => {
    const parsedUrl = receiptUrlSchema.safeParse(source.url);
    if (!parsedUrl.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Receipt evidence source URLs must be redacted and non-secret.",
        path: ["sources", sourceIndex, "url"],
      });
    }
  });
});

const stageTimingSchema = z.object({
  stage: activeStageSchema,
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
}).strict().superRefine((timing, context) => {
  const expected = new Date(timing.completedAt).getTime() - new Date(timing.startedAt).getTime();
  if (expected < 0 || timing.durationMs !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Stage duration must match its retained timestamps.",
    });
  }
});

const attemptSchema = z.object({
  attemptId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["running", "released", "completed", "failed", "cancelled", "expired"]),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const providerReceiptSchema = z.object({
  stage: activeStageSchema,
  providerId: safeIdentifierSchema,
  modelId: safeIdentifierSchema.nullable(),
  contractVersion: z.number().int().positive(),
  health: providerHealthSchema.optional(),
  usage: z.array(providerUsageMetricSchema).min(1).max(32).optional(),
  cost: providerCostSchema.optional(),
}).strict().superRefine((provider, context) => {
  const keys = new Set<string>();
  provider.usage?.forEach((metric, index) => {
    const key = `${metric.metric}\u0000${metric.unit}`;
    if (keys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider receipt usage metrics must be unique by metric and unit.",
        path: ["usage", index],
      });
    }
    keys.add(key);
  });
});

const artifactReceiptSchema = z.object({
  providerId: safeIdentifierSchema,
  presentationId: safeIdentifierSchema,
  urls: z.array(artifactReceiptUrlSchema).min(1).max(4).transform(uniqueSorted),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive().max(MAX_DELIVERY_ARTIFACT_BYTES),
  contentType: z.string().trim().min(1).max(200).optional(),
  verifiedAt: z.string().datetime({ offset: true }),
  contentVerification: z.object({
    method: z.literal("pptx_ooxml_rich_static_v2"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    slideCount: z.number().int().positive().max(60),
  }).strict(),
  visualProfile: visualProfileVerificationSchema,
  usage: z.object({
    unit: safeIdentifierSchema,
    amount: z.number().finite().nonnegative(),
  }).strict().optional(),
}).strict().superRefine((artifact, context) => {
  if (
    artifact.visualProfile.measuredRichness.slideCount
    !== artifact.contentVerification.slideCount
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifact text and visual verification must cover the same slides.",
      path: ["visualProfile", "measuredRichness", "slideCount"],
    });
  }
});

const targetReceiptSchema = z.object({
  targetId: z.string().uuid(),
  outcome: z.enum(["delivered", "failed", "blocked"]),
  evidenceCoverage: evidenceCoverageSchema.optional(),
  claimLedger: receiptEvidenceLedgerSchema.optional(),
  unsupportedFactualClaimIds: z.array(safeIdentifierSchema).transform(uniqueSorted),
  readiness: z.object({
    requiredSlideFieldsPresent: z.boolean(),
    ctaPresent: z.boolean(),
    evidenceGatePassed: z.boolean(),
    artifactReadable: z.boolean(),
    providerProvenancePresent: z.boolean(),
    visualProfileVerified: z.boolean(),
  }).strict(),
  artifact: artifactReceiptSchema.optional(),
  errorCode: safeIdentifierSchema.optional(),
}).strict().superRefine((target, context) => {
  const delivered = target.outcome === "delivered";
  const ready = Object.values(target.readiness).every(Boolean);
  if (delivered !== Boolean(target.artifact) || delivered !== ready) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only fully ready targets with a verified artifact may be delivered.",
    });
  }

  if (delivered && (!target.evidenceCoverage || !target.claimLedger)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Delivered targets require the measured coverage and claim ledger that justified delivery.",
    });
  }

  if (target.claimLedger) {
    const evaluation = evaluateEvidence(target.claimLedger);
    const coverage = target.evidenceCoverage;
    if (
      !coverage
      || coverage.supportedFactualClaims !== evaluation.coverage.supportedFactualClaims
      || coverage.factualClaims !== evaluation.coverage.factualClaims
      || coverage.ratio !== evaluation.coverage.ratio
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Receipt evidence coverage must be derived from its retained claim ledger.",
        path: ["evidenceCoverage"],
      });
    }
    if (
      target.unsupportedFactualClaimIds.length !== evaluation.unsupportedFactualClaimIds.length
      || target.unsupportedFactualClaimIds.some(
        (claimId, index) => claimId !== evaluation.unsupportedFactualClaimIds[index],
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported claim IDs must be derived from the retained claim ledger.",
        path: ["unsupportedFactualClaimIds"],
      });
    }
  }
});

export const runReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  commitSha: z.string().regex(/^[a-f0-9]{7,64}$/).nullable(),
  evidenceContract: evidenceContractSchema,
  configurationNames: z
    .array(safeIdentifierSchema)
    .transform(uniqueSorted),
  providers: z.array(providerReceiptSchema),
  sourceUrls: z.array(receiptUrlSchema).transform(uniqueSorted),
  attempts: z.array(attemptSchema).min(1),
  stageTimings: z.array(stageTimingSchema),
  terminalState: terminalStateSchema,
  targets: z.array(targetReceiptSchema).min(1),
}).strict().superRefine((receipt, context) => {
  if (
    (receipt.terminalState === "delivered" || receipt.terminalState === "partially_completed")
    && receipt.commitSha === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Delivered receipts require the exact source commit SHA.",
      path: ["commitSha"],
    });
  }
  if (
    (receipt.terminalState === "delivered" || receipt.terminalState === "partially_completed")
    && receipt.providers.length < 4
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Delivered receipts require the full reference provider provenance.",
      path: ["providers"],
    });
  }
  const deliveredTargets = receipt.targets.filter((target) => target.outcome === "delivered").length;
  const expected = deliveredTargets === receipt.targets.length
    ? "delivered"
    : deliveredTargets > 0
      ? "partially_completed"
      : receipt.terminalState === "cancelled"
        ? "cancelled"
        : "failed";
  if (receipt.terminalState !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Terminal state must agree with the retained target outcomes.",
    });
  }
});

export type RunReceipt = z.infer<typeof runReceiptSchema>;

export function parseRunReceipt(input: unknown): RunReceipt {
  return runReceiptSchema.parse(input);
}

export function sanitizeReceiptUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Receipt source URL must use HTTP or HTTPS.");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = "/_redacted/source";
  return url.toString();
}

export function sanitizeArtifactReceiptUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Artifact receipt URL must use HTTP or HTTPS.");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = "/_redacted/artifact";
  return url.toString();
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}
