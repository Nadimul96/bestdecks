"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface DeckEvidenceSummary {
  coverage: {
    supportedFactualClaims: number;
    factualClaims: number;
    percent: number | null;
  };
  unsupportedFactualClaimCount: number;
  readiness: {
    requiredSlideFieldsPresent: boolean;
    ctaPresent: boolean;
    evidenceGatePassed: boolean;
    artifactReadable: boolean;
    providerProvenancePresent: boolean;
  };
}

const readinessChecks = [
  ["requiredSlideFieldsPresent", "Required fields"],
  ["ctaPresent", "CTA"],
  ["evidenceGatePassed", "Evidence gate"],
  ["artifactReadable", "Readable artifact"],
  ["providerProvenancePresent", "Provider provenance"],
] as const;

function receiptPassed(evidence: DeckEvidenceSummary) {
  return evidence.coverage.supportedFactualClaims === evidence.coverage.factualClaims
    && evidence.unsupportedFactualClaimCount === 0
    && readinessChecks.every(([key]) => evidence.readiness[key]);
}

export function DeckEvidenceBadge({
  evidence,
  tone = "light",
  className,
}: {
  evidence?: DeckEvidenceSummary;
  tone?: "light" | "dark";
  className?: string;
}) {
  const passed = evidence ? receiptPassed(evidence) : false;
  const label = !evidence
    ? "Evidence receipt unavailable"
    : evidence.coverage.factualClaims === 0
      ? "No external factual claims"
      : `Evidence ${evidence.coverage.supportedFactualClaims}/${evidence.coverage.factualClaims}`;
  const title = !evidence
    ? "No valid claim-level evidence and readiness receipt was found for this artifact."
    : [
        `${evidence.coverage.supportedFactualClaims} of ${evidence.coverage.factualClaims} external factual claims are source-backed.`,
        `${evidence.unsupportedFactualClaimCount} unsupported factual claims.`,
        ...readinessChecks.map(
          ([key, checkLabel]) => `${checkLabel}: ${evidence.readiness[key] ? "passed" : "not verified"}.`,
        ),
      ].join(" ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        tone === "dark"
          ? passed
            ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20"
            : "bg-white/[0.08] text-white/65 ring-white/10"
          : passed
            ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
        className,
      )}
      title={title}
      aria-label={title}
    >
      {passed ? <ShieldCheck className="size-3" /> : <ShieldQuestion className="size-3" />}
      {label}
    </span>
  );
}

export function DeckEvidenceDetails({
  evidence,
  tone = "light",
  className,
}: {
  evidence?: DeckEvidenceSummary;
  tone?: "light" | "dark";
  className?: string;
}) {
  if (!evidence) {
    return (
      <p className={cn(
        "text-[10px] leading-relaxed",
        tone === "dark" ? "text-white/40" : "text-muted-foreground",
        className,
      )}>
        Readiness receipt unavailable; no check is treated as passing.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {readinessChecks.map(([key, label]) => {
        const passed = evidence.readiness[key];
        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1 text-[10px]",
              tone === "dark"
                ? passed ? "text-emerald-200/75" : "text-amber-200/75"
                : passed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
            )}
          >
            {passed
              ? <CheckCircle2 className="size-2.5" aria-hidden="true" />
              : <CircleX className="size-2.5" aria-hidden="true" />}
            {label}: {passed ? "passed" : "not verified"}
          </span>
        );
      })}
    </div>
  );
}

export function DeckEvidenceNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-50/70 p-4 dark:bg-amber-950/20",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div>
        <p className="text-[13px] font-semibold text-amber-950 dark:text-amber-100">
          Human review required
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-amber-900/75 dark:text-amber-200/70">
          Delivered decks show source-backed factual-claim coverage and five deterministic
          readiness checks when a valid receipt exists. A missing receipt abstains instead of
          passing. Check the claims and source material before sending any deck.
        </p>
      </div>
    </div>
  );
}
