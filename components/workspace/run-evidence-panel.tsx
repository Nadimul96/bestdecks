"use client";

import * as React from "react";
import { FileSearch } from "lucide-react";

import { EvidenceLedger } from "@/components/evidence-ledger";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClaimLedgerView } from "@/src/domain/claim-ledger-view";

interface TargetEvidence {
  targetId: string;
  companyName: string;
  websiteUrl: string;
  planningOutcome: "ready" | "blocked" | null;
  ledger: ClaimLedgerView | null;
}

function displayName(target: TargetEvidence) {
  if (target.companyName) return target.companyName;
  try {
    return new URL(target.websiteUrl).hostname.replace(/^www\./u, "");
  } catch {
    return target.websiteUrl;
  }
}

/** Per-target claim ledgers for a run, as evaluated by the delivery gate. */
export function RunEvidencePanel({ runId, refreshKey }: { runId: string; refreshKey: string }) {
  // Keyed by run so a different run never shows the previous run's ledger;
  // refreshes of the same run keep showing the last result until new data lands.
  const [result, setResult] = React.useState<
    { runId: string; targets: TargetEvidence[] | null; failed: boolean } | null
  >(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${encodeURIComponent(runId)}/evidence`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((data: { targets?: TargetEvidence[] }) => {
        if (!cancelled) {
          setResult({ runId, targets: Array.isArray(data.targets) ? data.targets : [], failed: false });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ runId, targets: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, refreshKey]);

  const current = result?.runId === runId ? result : null;
  const targets = current?.targets ?? null;
  const failed = current?.failed ?? false;
  const withLedger = (targets ?? []).filter((target) => target.ledger);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence
        </h3>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Every factual claim must match a retained source, verbatim.
        </p>
      </div>

      {failed ? (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
          The evidence ledger could not be loaded. Refresh to try again.
        </p>
      ) : targets === null ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : withLedger.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-5">
          <FileSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-[13px] text-muted-foreground">
            No slide plan yet. The claim ledger appears here once a target reaches planning.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {withLedger.map((target) => (
            <div key={target.targetId} className="space-y-2">
              {withLedger.length > 1 && (
                <p className="text-[13px] font-medium text-foreground">{displayName(target)}</p>
              )}
              <EvidenceLedger ledger={target.ledger!} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The claim ledger for a single delivered target. */
export function TargetEvidenceLedger({ runId, targetId }: { runId: string; targetId: string }) {
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "ready"; ledger: ClaimLedgerView | null } | { status: "error" }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${encodeURIComponent(runId)}/evidence`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((data: { targets?: TargetEvidence[] }) => {
        const target = data.targets?.find((entry) => entry.targetId === targetId);
        if (!cancelled) setState({ status: "ready", ledger: target?.ledger ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, targetId]);

  if (state.status === "loading") return <Skeleton className="h-64 rounded-xl" />;
  if (state.status === "error" || !state.ledger) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
        {state.status === "error"
          ? "The evidence ledger could not be loaded."
          : "No claim ledger was recorded for this deck."}
      </p>
    );
  }
  return <EvidenceLedger ledger={state.ledger} />;
}
