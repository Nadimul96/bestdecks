"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  Layers3,
  LoaderCircle,
  RefreshCcw,
  Search,
  Wand2,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, SectionCard, StatusPill } from "../view-layout";
import { viewMeta, type RunSummary, type RunDetail } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta.pipeline;

/* ─── Helpers ─── */

function runStatusToPill(status: string): { status: "ready" | "error" | "running" | "incomplete"; label: string } {
  switch (status) {
    case "completed":
      return { status: "ready", label: "completed" };
    case "failed":
    case "cancelled":
      return { status: "error", label: status };
    case "running":
    case "queued":
      return { status: "running", label: status === "queued" ? "starting" : "running" };
    case "partially_completed":
      return { status: "incomplete", label: "partial" };
    default:
      return { status: "incomplete", label: status };
  }
}

function formatDomain(url: string | undefined): string {
  if (!url) return "Run";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

/** Compute progress percentage from run detail events/targets */
function computeProgress(run: RunDetail): { percent: number; stage: string } {
  const total = run.targets.length;
  if (total === 0) return { percent: 0, stage: "Starting..." };

  if (run.status === "completed") return { percent: 100, stage: "Complete" };
  if (run.status === "failed") return { percent: 100, stage: "Failed" };

  const doneTargets = run.targets.filter(
    (t) => t.status === "delivered" || t.status === "completed" || t.status === "failed",
  ).length;

  const events = run.events;
  const lastStage = events.length > 0 ? events[events.length - 1] : null;

  const stageWeights: Record<string, number> = {
    run_started: 0.02,
    seller_brief: 0.1,
    crawl: 0.3,
    target_crawl: 0.3,
    crawl_or_enrichment: 0.3,
    enrichment: 0.5,
    company_brief: 0.6,
    image_strategy: 0.7,
    slide_planning: 0.8,
    delivery: 0.9,
    run_finished: 1,
  };

  if (doneTargets === total) return { percent: 100, stage: "Finishing up..." };

  const baseProgress = (doneTargets / total) * 100;
  const currentStageWeight = lastStage?.stage ? (stageWeights[lastStage.stage] ?? 0.15) : 0.05;
  const inProgressAdd = (currentStageWeight / total) * 100;
  const percent = Math.min(Math.round(baseProgress + inProgressAdd), 99);

  const stageLabels: Record<string, string> = {
    run_started: "Starting pipeline...",
    preflight: "Verifying service connections...",
    seller_brief: "Analyzing your business positioning...",
    crawl: "Crawling target website...",
    target_crawl: "Crawling target website...",
    crawl_or_enrichment: "Gathering market intelligence...",
    enrichment: "Enriching with market research...",
    company_brief: "Building target company profile...",
    image_strategy: "Generating supporting visuals...",
    slide_planning: "Planning slide content...",
    delivery: "Assembling personalized deck...",
    target_failed: "Target processing encountered an error",
  };

  const stageName = lastStage?.stage
    ? stageLabels[lastStage.stage] ?? "Processing..."
    : "Starting pipeline...";

  return { percent, stage: stageName };
}

/* ─── Error message humanizer ─── */
function humanizeError(raw: string): string {
  if (raw.includes("Plus AI create failed")) return "Deck generation service returned an error — retry in a moment.";
  if (raw.includes("Plus AI generation timed out")) return "Deck generation took too long — try again shortly.";
  if (raw.includes("Plus AI presentation generation failed")) return "Deck generation encountered an internal error. Please retry.";
  if (raw.includes("Cloudflare") && raw.includes("429")) return "Website crawl was rate-limited. Wait a minute and retry.";
  if (raw.includes("unreachable") || raw.includes("ECONNREFUSED")) return "Could not connect to a required service. Check your API integrations.";
  if (raw.includes("timed out")) return "Run timed out — a pipeline step may have been terminated. Try again with fewer targets.";
  if (raw.includes("configuration is missing")) return "Required API keys not configured. Check Settings → Integrations.";
  if (raw.includes("No deck provider configured")) return "No deck generation service configured. Add a Plus AI API key in Settings.";
  if (raw.length > 120) return raw.slice(0, 120) + "…";
  return raw;
}

/** Check if the run has credit refund events */
function getRefundInfo(events: RunDetail["events"]): string | null {
  const refundEvent = events.find((e) => e.stage === "credit_refund");
  return refundEvent?.message ?? null;
}

/* ─── Target status helpers ─── */
function targetStatusInfo(status: string): { icon: React.ReactNode; label: string; color: string } {
  switch (status) {
    case "delivered":
    case "completed":
      return { icon: <CheckCircle2 className="size-3.5 text-emerald-500" />, label: "Completed", color: "text-emerald-500 font-medium" };
    case "failed":
      return { icon: <AlertCircle className="size-3.5 text-destructive" />, label: "Failed", color: "text-destructive font-medium" };
    case "queued":
      return { icon: <Clock3 className="size-3.5 text-muted-foreground" />, label: "Queued", color: "text-muted-foreground" };
    case "processing":
    case "brief_ready":
      return { icon: <LoaderCircle className="size-3.5 animate-spin text-primary" />, label: "In progress", color: "text-primary font-medium" };
    default:
      return { icon: <Clock3 className="size-3.5 text-muted-foreground" />, label: status, color: "text-muted-foreground" };
  }
}

/* ─── Activity Log ─── */
function ActivityLog({ events, isRunning }: { events: RunDetail["events"]; isRunning: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  return (
    <div
      ref={scrollRef}
      className="max-h-[220px] overflow-y-auto rounded-lg border border-border/30 bg-muted/10 scroll-smooth"
    >
      <div className="divide-y divide-border/20">
        {events.map((event) => (
          <div
            key={event.id}
            className={cn(
              "flex items-start gap-2.5 px-3.5 py-2 text-xs transition-colors",
              event.level === "error" && "bg-destructive/5",
            )}
          >
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                event.level === "error"
                  ? "bg-destructive"
                  : event.level === "warning"
                    ? "bg-amber-500"
                    : "bg-emerald-500/60",
              )}
            />
            <span
              className={cn(
                "min-w-0 flex-1 break-words leading-relaxed",
                event.level === "error"
                  ? "text-destructive font-medium"
                  : event.level === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {event.message}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/50">
              {new Date(event.created_at).toLocaleTimeString()}
            </span>
          </div>
        ))}
        {isRunning && (
          <div className="flex items-center gap-2.5 px-3.5 py-2 text-xs">
            <LoaderCircle className="size-3 animate-spin text-primary" />
            <span className="text-muted-foreground/60 italic">Processing…</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PipelineView() {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const initialLoadDone = React.useRef(false);

  React.useEffect(() => {
    fetchRuns();
  }, []);

  // Auto-select the newest running/queued run on initial load
  React.useEffect(() => {
    if (initialLoadDone.current || loading || runs.length === 0) return;
    initialLoadDone.current = true;
    const runningRun = runs.find((r) => r.status === "running" || r.status === "queued");
    if (runningRun && !selectedRun) {
      selectRun(runningRun.id);
    }
  }, [runs, loading]);

  // Auto-refresh running runs every 3 seconds
  React.useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "queued");
    const selectedRunActive = selectedRun && (selectedRun.status === "running" || selectedRun.status === "queued");
    if (!hasRunning && !selectedRunActive) return;

    const interval = setInterval(() => {
      const promises: Promise<void>[] = [fetchRuns()];
      if (selectedRunActive) {
        promises.push(selectRun(selectedRun.id, true));
      }
      Promise.all(promises);
    }, 3000);

    return () => clearInterval(interval);
  }, [runs, selectedRun]);

  async function fetchRuns() {
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

  async function retryRun(runId: string) {
    setRetrying(runId);
    try {
      const res = await fetch(`/api/runs/${runId}/launch`, { method: "POST" });
      if (res.ok) {
        toast.success("Retrying run...");
        await fetchRuns();
        await selectRun(runId, true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to retry run.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setRetrying(null);
    }
  }

  async function cancelRun(runId: string) {
    setCancelling(runId);
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (res.ok) {
        toast.success("Run cancelled.");
        await fetchRuns();
        if (selectedRun?.id === runId) {
          await selectRun(runId, true);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to cancel run.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setCancelling(null);
    }
  }

  async function selectRun(runId: string, silent = false) {
    if (!silent) setDetailLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setSelectedRun(data);
    } catch {
      // silently fail
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button variant="outline" onClick={() => { setLoading(true); fetchRuns(); }} disabled={loading}>
          <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {/* Pipeline content — runs list + detail side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4">

      {/* Run list */}
      <SectionCard
        title="Runs"
        description={`${runs.length} run${runs.length !== 1 ? "s" : ""}`}
      >
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
              <Search className="size-5 text-muted-foreground/60" />
            </div>
            <p className="text-[13px] font-medium text-foreground">No runs yet</p>
            <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-muted-foreground">
              Import targets and launch a run to see progress here.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
              <a href="#target-intake">Import targets</a>
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-1.5">
              {runs.map((run) => {
                const domain = formatDomain(run.first_target_url);
                const { date, time } = formatDate(run.created_at);
                const pill = runStatusToPill(run.status);
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => selectRun(run.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-all hover:bg-muted/50",
                      selectedRun?.id === run.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/40 bg-card",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <FileText className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {domain}
                          {run.target_count > 1 && (
                            <span className="text-muted-foreground font-normal"> +{run.target_count - 1}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {date} {time} · {run.target_count} target{run.target_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <StatusPill status={pill.status} label={pill.label} />
                      {(run.status === "running" || run.status === "queued") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelRun(run.id);
                          }}
                          disabled={cancelling === run.id}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Cancel run"
                        >
                          {cancelling === run.id ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </SectionCard>

      {/* Run detail */}
      {selectedRun && (
        <SectionCard
          title={(() => {
            const domain = formatDomain(selectedRun.targets[0]?.website_url);
            return selectedRun.targets.length > 1
              ? `${domain} +${selectedRun.targets.length - 1} more`
              : domain;
          })()}
          description={(() => {
            const { date, time } = formatDate(selectedRun.createdAt);
            return `${selectedRun.targets.length} target${selectedRun.targets.length !== 1 ? "s" : ""} · ${selectedRun.sellerContext?.companyName || "Your Business"} · ${date} ${time}`;
          })()}
        >
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Progress tracker for running runs */}
              {(selectedRun.status === "running" || selectedRun.status === "queued") && (() => {
                const { percent, stage } = computeProgress(selectedRun);
                const completedStages = new Set(
                  selectedRun.events
                    .filter((e) => e.level !== "error")
                    .map((e) => e.stage),
                );
                const lastStage = selectedRun.events.length > 0
                  ? selectedRun.events[selectedRun.events.length - 1]?.stage
                  : null;

                const stages: Array<{ key: string; altKeys: string[]; icon: typeof Wand2; label: string; color: string }> = [
                  { key: "seller_brief", altKeys: [], icon: Wand2, label: "Seller brief", color: "text-violet-500" },
                  { key: "crawl", altKeys: ["target_crawl", "crawl_or_enrichment"], icon: Search, label: "Crawl & enrich", color: "text-blue-500" },
                  { key: "company_brief", altKeys: [], icon: Layers3, label: "Company brief", color: "text-amber-500" },
                  { key: "image_strategy", altKeys: [], icon: ImageIcon, label: "Visuals", color: "text-pink-500" },
                  { key: "slide_planning", altKeys: [], icon: Layers3, label: "Slide plan", color: "text-cyan-500" },
                  { key: "delivery", altKeys: [], icon: FileText, label: "Deck assembly", color: "text-emerald-500" },
                ];

                const findStageIdx = (eventStage: string | null | undefined): number => {
                  if (!eventStage) return -1;
                  return stages.findIndex(
                    (s) => s.key === eventStage || s.altKeys.includes(eventStage),
                  );
                };
                const lastStageIdx = findStageIdx(lastStage);

                return (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin text-primary" />
                        <span className="text-[13px] font-medium text-foreground">
                          {stage}
                        </span>
                      </div>
                      <span className="text-[13px] font-semibold text-primary tabular-nums">
                        {percent}%
                      </span>
                    </div>
                    <Progress value={percent} className="h-2" />

                    {/* Stage checklist — compact 3-column grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                      {stages.map((s, i) => {
                        const matchesCurrent = s.key === lastStage || s.altKeys.includes(lastStage ?? "");
                        const matchesCompleted = completedStages.has(s.key) || s.altKeys.some((k) => completedStages.has(k));
                        const isDone = i < lastStageIdx || (matchesCompleted && !matchesCurrent);
                        const isCurrent = matchesCurrent;

                        return (
                          <div key={s.key} className="flex items-center gap-1.5 py-0.5">
                            {isDone ? (
                              <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                            ) : isCurrent ? (
                              <LoaderCircle className={cn("size-3 animate-spin shrink-0", s.color)} />
                            ) : (
                              <div className="size-3 shrink-0 rounded-full border border-border/60" />
                            )}
                            <span className={cn(
                              "text-[11px] truncate",
                              isDone ? "text-muted-foreground line-through" : isCurrent ? "text-foreground font-medium" : "text-muted-foreground/50",
                            )}>
                              {s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                      <p className="text-[11px] text-muted-foreground">
                        ~1-2 min per target
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => cancelRun(selectedRun.id)}
                        disabled={cancelling === selectedRun.id}
                      >
                        {cancelling === selectedRun.id ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <Ban className="size-3" />
                        )}
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Completed banner */}
              {selectedRun.status === "completed" && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                        All decks generated successfully
                      </span>
                    </div>
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href="#delivery">
                        <FileText className="size-3.5" />
                        View decks
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              {/* Failed banner */}
              {selectedRun.status === "failed" && (() => {
                const refund = getRefundInfo(selectedRun.events);
                return (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="size-4 shrink-0 text-destructive" />
                      <p className="text-[13px] font-medium text-destructive min-w-0 flex-1">
                        {humanizeError(selectedRun.lastError ?? "Run failed. Check the activity log for details.")}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0"
                        onClick={() => retryRun(selectedRun.id)}
                        disabled={retrying === selectedRun.id}
                      >
                        {retrying === selectedRun.id ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-3" />
                        )}
                        Retry
                      </Button>
                    </div>
                    {refund && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        {refund}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Partially completed banner */}
              {selectedRun.status === "partially_completed" && (() => {
                const refund = getRefundInfo(selectedRun.events);
                return (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-[13px] font-medium text-amber-600 dark:text-amber-400 min-w-0 flex-1">
                        {humanizeError(selectedRun.lastError ?? "Some targets failed.")}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => retryRun(selectedRun.id)}
                          disabled={retrying === selectedRun.id}
                        >
                          {retrying === selectedRun.id ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <RefreshCcw className="size-3" />
                          )}
                          Retry failed
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                          <a href="#delivery">
                            <FileText className="size-3.5" />
                            View decks
                          </a>
                        </Button>
                      </div>
                    </div>
                    {refund && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        {refund}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Cancelled banner */}
              {selectedRun.status === "cancelled" && (() => {
                const refund = getRefundInfo(selectedRun.events);
                return (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Ban className="size-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
                        Run was cancelled.
                      </span>
                    </div>
                    {refund && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        {refund}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Target statuses */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Targets
                </h3>
                <div className="space-y-1.5">
                  {selectedRun.targets.map((target) => {
                    const info = targetStatusInfo(target.status);
                    return (
                      <div
                        key={target.id}
                        className="rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {info.icon}
                            <span className="font-mono text-[11px] truncate">
                              {target.website_url}
                            </span>
                          </div>
                          <span className={cn("text-[11px] shrink-0", info.color)}>
                            {info.label}
                          </span>
                        </div>
                        {target.status === "failed" && target.last_error && (
                          <p className="mt-1.5 pl-6 text-[11px] text-destructive/80 leading-relaxed">
                            {humanizeError(target.last_error)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Events log */}
              {selectedRun.events.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Activity log
                    </h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {selectedRun.events.length} event{selectedRun.events.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ActivityLog events={selectedRun.events} isRunning={selectedRun.status === "running" || selectedRun.status === "queued"} />
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Placeholder if no run selected */}
      {!selectedRun && runs.length > 0 && (
        <div className="hidden lg:flex items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 p-8">
          <p className="text-[13px] text-muted-foreground">Select a run to view details</p>
        </div>
      )}
      </div>
    </ViewLayout>
  );
}
