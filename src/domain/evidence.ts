import { z } from "zod";

import {
  isPersistableSourceUrl,
  normalizePersistableSourceUrl,
} from "./source-url";

/**
 * Persisted evidence is part of the delivery contract. Keep these identifiers
 * stable: changing either value requires an explicit migration and receipt
 * compatibility decision rather than silently changing what "supported" means.
 */
export const EVIDENCE_LEDGER_SCHEMA_VERSION = 1 as const;
export const EVIDENCE_RUBRIC_VERSION = "exact-visible-claim-provenance-v1" as const;

/**
 * Evidence IDs are supplied by the pipeline, not generated while evaluating a
 * receipt. Normalizing them here makes references stable across providers and
 * prevents case-only IDs from becoming separate sources.
 */
export const evidenceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/,
    "Evidence IDs may contain only letters, numbers, dots, underscores, colons, and hyphens.",
  )
  .transform((value) => value.toLowerCase());

export const claimClassSchema = z.enum([
  "seller_claim",
  "external_fact",
  "model_inference",
]);

export const claimSupportStatusSchema = z.enum([
  "source_backed",
  "seller_supplied",
  "model_inference",
  "unsupported",
]);

export type ClaimClass = z.infer<typeof claimClassSchema>;
export type ClaimSupportStatus = z.infer<typeof claimSupportStatusSchema>;

const sourceUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine(isPersistableSourceUrl, "Evidence source URLs must be safe HTTP(S) URLs.")
  .transform(normalizePersistableSourceUrl);

export const evidenceSourceSchema = z
  .object({
    id: evidenceIdSchema,
    url: sourceUrlSchema,
    title: z.string().trim().min(1).max(500),
    retrievedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    provider: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((value) => value.toLowerCase()),
  })
  .strict();

const normalizedCitedSourceIdsSchema = z
  .array(evidenceIdSchema)
  .default([])
  .transform(normalizeIds);

const nonEmptyNormalizedCitedSourceIdsSchema = z
  .array(evidenceIdSchema)
  .min(1, "A source-backed factual claim requires at least one cited source ID.")
  .transform(normalizeIds);

const claimBaseShape = {
  id: evidenceIdSchema,
  text: z.string().trim().min(1).max(5_000),
} as const;

/**
 * The status discriminator enforces the public evidence labels at validation
 * time. Seller input and model interpretation remain explicitly labeled; only
 * external facts can be source-backed or unsupported.
 */
export const evidenceClaimSchema = z.discriminatedUnion("supportStatus", [
  z
    .object({
      ...claimBaseShape,
      claimClass: z.literal("external_fact"),
      supportStatus: z.literal("source_backed"),
      citedSourceIds: nonEmptyNormalizedCitedSourceIdsSchema,
    })
    .strict(),
  z
    .object({
      ...claimBaseShape,
      claimClass: z.literal("external_fact"),
      supportStatus: z.literal("unsupported"),
      citedSourceIds: normalizedCitedSourceIdsSchema,
    })
    .strict(),
  z
    .object({
      ...claimBaseShape,
      claimClass: z.literal("seller_claim"),
      supportStatus: z.literal("seller_supplied"),
      citedSourceIds: normalizedCitedSourceIdsSchema,
    })
    .strict(),
  z
    .object({
      ...claimBaseShape,
      claimClass: z.literal("model_inference"),
      supportStatus: z.literal("model_inference"),
      citedSourceIds: normalizedCitedSourceIdsSchema,
    })
    .strict(),
]);

export const evidenceLedgerSchema = z
  .object({
    sources: z.array(evidenceSourceSchema),
    claims: z.array(evidenceClaimSchema),
  })
  .strict()
  .superRefine((ledger, context) => {
    addDuplicateIdIssues(
      ledger.sources.map((source) => source.id),
      "sources",
      context,
    );
    addDuplicateIdIssues(
      ledger.claims.map((claim) => claim.id),
      "claims",
      context,
    );

    const sourceIds = new Set(ledger.sources.map((source) => source.id));

    ledger.claims.forEach((claim, claimIndex) => {
      claim.citedSourceIds.forEach((sourceId, sourceIndex) => {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Claim ${claim.id} cites missing source ${sourceId}.`,
            path: ["claims", claimIndex, "citedSourceIds", sourceIndex],
          });
        }
      });
    });
  });

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
export type EvidenceLedger = z.infer<typeof evidenceLedgerSchema>;

export const claimEvidenceLabels = {
  source_backed: "source-backed",
  seller_supplied: "seller-supplied",
  model_inference: "model-inference",
  unsupported: "unsupported",
} as const satisfies Record<ClaimSupportStatus, string>;

export interface EvidenceCoverage {
  supportedFactualClaims: number;
  factualClaims: number;
  ratio: number | null;
  percent: number | null;
}

export interface ClaimEvidenceLabel {
  claimId: string;
  claimClass: ClaimClass;
  label: (typeof claimEvidenceLabels)[keyof typeof claimEvidenceLabels];
}

export interface EvidenceEvaluation {
  coverage: EvidenceCoverage;
  unsupportedFactualClaimIds: string[];
  sellerClaimIds: string[];
  modelInferenceClaimIds: string[];
  claimLabels: ClaimEvidenceLabel[];
  deliveryGate: {
    canDeliver: boolean;
    blockingClaimIds: string[];
    requiredCoverageRatio: 1;
    policy: "all_factual_claims_must_be_source_backed";
  };
}

/**
 * Parse and normalize provider output before it crosses a persistence or
 * delivery boundary. Invalid or dangling citations fail closed.
 */
export function parseEvidenceLedger(input: unknown): EvidenceLedger {
  return evidenceLedgerSchema.parse(input);
}

/**
 * Evidence coverage is a measured fraction, not a subjective deck score.
 * The delivery decision uses exact unsupported IDs rather than the rounded
 * display percentage, so rounding can never turn an incomplete ledger green.
 */
export function evaluateEvidence(input: unknown): EvidenceEvaluation {
  const ledger = parseEvidenceLedger(input);
  const factualClaims = ledger.claims.filter(
    (claim) => claim.claimClass === "external_fact",
  );
  const supportedFactualClaims = factualClaims.filter(
    (claim) => claim.supportStatus === "source_backed",
  );
  const unsupportedFactualClaimIds = sortIds(
    factualClaims
      .filter((claim) => claim.supportStatus === "unsupported")
      .map((claim) => claim.id),
  );
  const sellerClaimIds = sortIds(
    ledger.claims
      .filter((claim) => claim.claimClass === "seller_claim")
      .map((claim) => claim.id),
  );
  const modelInferenceClaimIds = sortIds(
    ledger.claims
      .filter((claim) => claim.claimClass === "model_inference")
      .map((claim) => claim.id),
  );

  const factualClaimCount = factualClaims.length;
  const supportedFactualClaimCount = supportedFactualClaims.length;
  const ratio =
    factualClaimCount === 0
      ? null
      : supportedFactualClaimCount / factualClaimCount;

  return {
    coverage: {
      supportedFactualClaims: supportedFactualClaimCount,
      factualClaims: factualClaimCount,
      ratio,
      percent:
        factualClaimCount === 0
          ? null
          : displayPercent(supportedFactualClaimCount, factualClaimCount),
    },
    unsupportedFactualClaimIds,
    sellerClaimIds,
    modelInferenceClaimIds,
    claimLabels: ledger.claims
      .map((claim) => ({
        claimId: claim.id,
        claimClass: claim.claimClass,
        label: claimEvidenceLabels[claim.supportStatus],
      }))
      .sort((left, right) => compareIds(left.claimId, right.claimId)),
    deliveryGate: {
      canDeliver: unsupportedFactualClaimIds.length === 0,
      blockingClaimIds: [...unsupportedFactualClaimIds],
      requiredCoverageRatio: 1,
      policy: "all_factual_claims_must_be_source_backed",
    },
  };
}

function normalizeIds(ids: string[]): string[] {
  return sortIds([...new Set(ids)]);
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort(compareIds);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function displayPercent(supported: number, total: number): number {
  if (supported === total) {
    return 100;
  }

  // Do not display 100.0% while even one factual claim is unsupported.
  return Math.min(99.9, Math.round((supported * 1_000) / total) / 10);
}

function addDuplicateIdIssues(
  ids: string[],
  collection: "sources" | "claims",
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();

  ids.forEach((id, index) => {
    if (seen.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${collection === "sources" ? "source" : "claim"} ID ${id}.`,
        path: [collection, index, "id"],
      });
    }
    seen.add(id);
  });
}
