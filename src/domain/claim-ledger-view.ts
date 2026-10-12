import {
  claimEvidenceLabels,
  evaluateEvidence,
  parseEvidenceLedger,
  type ClaimClass,
} from "./evidence";

/**
 * Browser-safe projection of a target's claim ledger: every visible claim, the
 * label the deterministic gate gave it, and the retained sources it cites.
 * Labels come from `evaluateEvidence`, never from the stored model output, so
 * the UI shows exactly what the delivery gate decided.
 */

export type ClaimLedgerLabel = (typeof claimEvidenceLabels)[keyof typeof claimEvidenceLabels];

export interface ClaimLedgerCitation {
  title: string;
  url: string;
}

export interface ClaimLedgerEntry {
  id: string;
  text: string;
  claimClass: ClaimClass;
  label: ClaimLedgerLabel;
  citations: ClaimLedgerCitation[];
}

export interface ClaimLedgerView {
  claims: ClaimLedgerEntry[];
  counts: Record<ClaimLedgerLabel, number>;
  coverage: { supported: number; factual: number };
  canDeliver: boolean;
}

const MAX_CLAIMS = 200;

/** Returns null when the input is not a valid evidence ledger. */
export function projectClaimLedger(ledgerInput: unknown): ClaimLedgerView | null {
  let ledger;
  let evaluation;
  try {
    ledger = parseEvidenceLedger(ledgerInput);
    evaluation = evaluateEvidence(ledger);
  } catch {
    return null;
  }

  const sources = new Map(ledger.sources.map((source) => [source.id, source]));
  const labels = new Map(evaluation.claimLabels.map((entry) => [entry.claimId, entry.label]));
  const counts: Record<ClaimLedgerLabel, number> = {
    "source-backed": 0,
    "seller-supplied": 0,
    "model-inference": 0,
    unsupported: 0,
  };

  const claims = ledger.claims.slice(0, MAX_CLAIMS).map((claim) => {
    const label = labels.get(claim.id) ?? claimEvidenceLabels[claim.supportStatus];
    counts[label] += 1;
    return {
      id: claim.id,
      text: claim.text,
      claimClass: claim.claimClass,
      label,
      citations: claim.citedSourceIds.flatMap((sourceId) => {
        const source = sources.get(sourceId);
        return source ? [{ title: source.title, url: source.url }] : [];
      }),
    };
  });

  return {
    claims,
    counts,
    coverage: {
      supported: evaluation.coverage.supportedFactualClaims,
      factual: evaluation.coverage.factualClaims,
    },
    canDeliver: evaluation.deliveryGate.canDeliver,
  };
}
