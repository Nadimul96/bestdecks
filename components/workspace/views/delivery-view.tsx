"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, SectionCard, StatusPill } from "../view-layout";
import {
  viewMeta,
  type RunSummary,
  type RunArtifactRecord,
  type RunDetail,
} from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta.delivery;

export function DeliveryView() {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [runDetail, setRunDetail] = React.useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    fetchRuns();
  }, []);

  async function fetchRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      setRuns(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function selectRun(runId: string) {
    setSelectedRunId(runId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setRunDetail(data);
    } catch {
      // silently fail
    } finally {
      setDetailLoading(false);
    }
  }

  /* Only show runs that have completed or have artifacts */
  const completedRuns = runs.filter(
    (r) => r.status === "completed" || r.status === "partial",
  );

  const filteredRuns = searchQuery
    ? completedRuns.filter(
        (r) =>
          r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.delivery_format.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : completedRuns;

  /* Group artifacts by target */
  const artifactsByTarget = React.useMemo(() => {
    if (!runDetail) return new Map<string, RunArtifactRecord[]>();
    const grouped = new Map<string, RunArtifactRecord[]>();
    for (const artifact of runDetail.artifacts) {
      const key = artifact.target_id ?? "general";
      const list = grouped.get(key) ?? [];
      list.push(artifact);
      grouped.set(key, list);
    }
    return grouped;
  }, [runDetail]);

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button variant="outline" onClick={fetchRuns} disabled={loading}>
          <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Completed runs"
          value={completedRuns.length}
          icon={CheckCircle2}
          accent="emerald"
        />
        <SummaryCard
          label="Total decks"
          value={runs.reduce((sum, r) => sum + r.target_count, 0)}
          icon={FileText}
          accent="primary"
        />
        <SummaryCard
          label="Pending review"
          value={runs.filter((r) => r.status === "review").length}
          icon={ShieldCheck}
          accent="amber"
        />
      </div>

      {/* Run list */}
      <SectionCard
        title="Completed runs"
        description={`${filteredRuns.length} run${filteredRuns.length !== 1 ? "s" : ""} with deliverables`}
        actions={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter runs..."
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
        }
      >
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              No completed runs yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Completed decks will appear here once a run finishes.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href="#pipeline">View pipeline</a>
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {filteredRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => selectRun(run.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:bg-muted/50",
                    selectedRunId === run.id
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/40 bg-card",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Run #{run.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.target_count} deck
                        {run.target_count !== 1 ? "s" : ""} &middot;{" "}
                        {run.delivery_format}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill
                      status={
                        run.status === "completed"
                          ? "ready"
                          : run.status === "partial"
                            ? "incomplete"
                            : "running"
                      }
                      label={run.status}
                    />
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </SectionCard>

      {/* Run detail / artifacts */}
      {selectedRunId && (
        <SectionCard
          title={`Deliverables \u2014 Run #${selectedRunId.slice(0, 8)}`}
          description={
            runDetail
              ? `${runDetail.targets.length} target${runDetail.targets.length !== 1 ? "s" : ""} \u00b7 ${runDetail.deliveryFormat}`
              : "Loading..."
          }
        >
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : !runDetail ? (
            <p className="py-4 text-sm text-muted-foreground">
              Could not load run details.
            </p>
          ) : runDetail.artifacts.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Clock3 className="mb-2 size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No artifacts generated yet for this run.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quality gate banner */}
              {runDetail.reviewGateEnabled && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="size-4 shrink-0" />
                  <span>
                    Review gate is enabled. Approve decks before sharing.
                  </span>
                </div>
              )}

              {/* Targets with artifacts */}
              {runDetail.targets.map((target) => {
                const targetArtifacts =
                  artifactsByTarget.get(target.id) ?? [];

                return (
                  <div
                    key={target.id}
                    className="rounded-lg border border-border/40 bg-card"
                  >
                    {/* Target header */}
                    <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                      <div className="flex items-center gap-2">
                        {target.status === "completed" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : target.status === "failed" ? (
                          <AlertCircle className="size-3.5 text-destructive" />
                        ) : (
                          <Clock3 className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">
                          {target.company_name || target.website_url}
                        </span>
                        {target.company_name && (
                          <span className="text-xs text-muted-foreground">
                            {target.website_url}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium capitalize",
                          target.status === "completed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : target.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground",
                        )}
                      >
                        {target.status}
                      </span>
                    </div>

                    {/* Artifacts list */}
                    {targetArtifacts.length > 0 ? (
                      <div className="divide-y divide-border/20">
                        {targetArtifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                                <FileText className="size-3.5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-sm font-medium capitalize">
                                  {artifact.artifact_type.replace(/_/g, " ")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(
                                    artifact.created_at,
                                  ).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {typeof artifact.artifact_json?.url ===
                                "string" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  asChild
                                >
                                  <a
                                    href={artifact.artifact_json.url as string}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="size-3" />
                                    Open
                                  </a>
                                </Button>
                              )}
                              {typeof artifact.artifact_json
                                ?.download_url === "string" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  asChild
                                >
                                  <a
                                    href={
                                      artifact.artifact_json
                                        .download_url as string
                                    }
                                    download
                                  >
                                    <Download className="size-3" />
                                    Download
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                          {target.status === "completed"
                            ? "Deck generated. Artifacts pending indexing."
                            : "Awaiting completion."}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </ViewLayout>
  );
}

/* ─────────────────────────────────────────────
   Summary Card
   ───────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "primary" | "amber";
}) {
  const accentStyles = {
    emerald:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    primary: "bg-primary/10 text-primary dark:bg-primary/20",
    amber:
      "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            accentStyles[accent],
          )}
        >
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
