"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CircleSlash,
  Lightbulb,
  ShieldCheck,
  ShieldX,
  Store,
  type LucideIcon,
} from "lucide-react";

import type {
  ClaimLedgerEntry,
  ClaimLedgerLabel,
  ClaimLedgerView,
} from "@/src/domain/claim-ledger-view";
import { cn } from "@/lib/utils";

const LABELS: Record<ClaimLedgerLabel, {
  title: string;
  description: string;
  icon: LucideIcon;
  chip: string;
  bar: string;
}> = {
  unsupported: {
    title: "Unsupported",
    description: "A factual claim with no matching retained source. It blocks delivery.",
    icon: CircleSlash,
    chip: "bg-destructive/10 text-destructive ring-destructive/25",
    bar: "bg-destructive",
  },
  "source-backed": {
    title: "Source-backed",
    description: "Its text appears verbatim in a source retained for this target.",
    icon: ShieldCheck,
    chip: "bg-success/10 text-success ring-success/25",
    bar: "bg-success",
  },
  "seller-supplied": {
    title: "Seller-supplied",
    description: "Comes from your own seller context, not from the target.",
    icon: Store,
    chip: "bg-primary/10 text-primary ring-primary/25",
    bar: "bg-primary",
  },
  "model-inference": {
    title: "Inference",
    description: "Interpretation, labeled as such in the deck. Not a factual claim.",
    icon: Lightbulb,
    chip: "bg-muted text-muted-foreground ring-border",
    bar: "bg-muted-foreground/50",
  },
};

const ORDER: ClaimLedgerLabel[] = ["unsupported", "source-backed", "seller-supplied", "model-inference"];

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

function ClaimChip({ label }: { label: ClaimLedgerLabel }) {
  const meta = LABELS[label];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        meta.chip,
      )}
      title={meta.description}
    >
      <Icon className="size-3" aria-hidden />
      {meta.title}
    </span>
  );
}

function ClaimRow({ claim }: { claim: ClaimLedgerEntry }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4",
        claim.label === "unsupported" && "bg-destructive/[0.04]",
      )}
    >
      <div className="sm:w-32 sm:pt-0.5">
        <ClaimChip label={claim.label} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] leading-relaxed text-foreground">{claim.text}</p>
        {claim.citations.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {claim.citations.map((citation) => (
              <li key={citation.url} className="min-w-0">
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group inline-flex max-w-full items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="truncate">
                    <span className="font-medium">{hostname(citation.url)}</span>
                    <span className="text-muted-foreground/70"> · {citation.title}</span>
                  </span>
                  <ArrowUpRight className="size-3 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * The claim ledger the delivery gate evaluated: a verdict, a coverage bar, and
 * every claim with its label and the retained sources it cites.
 */
export function EvidenceLedger({
  ledger,
  className,
}: {
  ledger: ClaimLedgerView;
  className?: string;
}) {
  const total = ledger.claims.length;
  const claims = [...ledger.claims].sort(
    (a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label),
  );
  const blocked = ledger.counts.unsupported;

  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="space-y-3 border-b px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {ledger.canDeliver ? (
              <ShieldCheck className="size-4 text-success" aria-hidden />
            ) : (
              <ShieldX className="size-4 text-destructive" aria-hidden />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {ledger.canDeliver
                ? "Evidence gate passed"
                : `Blocked by ${blocked} unsupported claim${blocked === 1 ? "" : "s"}`}
            </h3>
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {ledger.coverage.factual === 0
              ? "No external factual claims"
              : `${ledger.coverage.supported} of ${ledger.coverage.factual} factual claims source-backed`}
          </p>
        </div>

        {total > 0 && (
          <div
            className="flex h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={ORDER.map((label) => `${ledger.counts[label]} ${LABELS[label].title}`).join(", ")}
          >
            {ORDER.map((label) => ledger.counts[label] > 0 && (
              <div
                key={label}
                className={LABELS[label].bar}
                style={{ width: `${(ledger.counts[label] / total) * 100}%` }}
              />
            ))}
          </div>
        )}

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ORDER.map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", LABELS[label].bar)} aria-hidden />
              <dt>{LABELS[label].title}</dt>
              <dd className="font-medium tabular-nums text-foreground">{ledger.counts[label]}</dd>
            </div>
          ))}
        </dl>
      </header>

      {total === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          This plan has no claims to evaluate.
        </p>
      ) : (
        <ul className="divide-y">
          {claims.map((claim) => <ClaimRow key={claim.id} claim={claim} />)}
        </ul>
      )}
    </section>
  );
}
