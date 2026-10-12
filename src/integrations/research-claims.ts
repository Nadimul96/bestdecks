/**
 * Claim-label hygiene shared by research adapters. Research summaries are
 * context for brief building, never evidence on their own; these helpers keep
 * them from smuggling unsupported specifics into that context.
 */

export const RESEARCH_CLAIM_LABELS = ["Sourced", "Inference", "Unknown"] as const;

const LABEL_PREFIX = /^\[(?:Sourced|Inference|Unknown)\]/u;

/** Split into sentences and default any unlabeled sentence to [Inference]. */
export function splitLabeledClaims(summary: string) {
  return summary
    .trim()
    .split(/(?<=[.!?])\s+|\r?\n+/u)
    .map((claim) => claim.trim())
    .filter(Boolean)
    .map((claim) => (LABEL_PREFIX.test(claim) ? claim : `[Inference] ${claim}`));
}

export function normalizeClaimLabels(summary: string) {
  return splitLabeledClaims(summary).join(" ");
}

export function numericTokens(value: string) {
  return (value.match(/(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?%?/gu) ?? [])
    .map((token) => token.toLowerCase().replace(/[\s,]/gu, ""));
}

/** True when `text` contains a number, amount, or percentage absent from `corpus`. */
export function hasUnsupportedNumericToken(text: string, corpus: string) {
  const corpusTokens = new Set(numericTokens(corpus));
  return numericTokens(text).some((token) => !corpusTokens.has(token));
}
