"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Cloud,
  ExternalLink,
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

const pipelineSteps = [
  {
    icon: Wand2,
    title: "Seller discovery",
    description: "We analyze your business context to understand your value proposition and positioning.",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: Cloud,
    title: "Target crawl",
    description: "We crawl the target company's website to gather intelligence about their business.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: Layers3,
    title: "Research synthesis",
    description: "We enrich data with market research, buyer signals, and public information.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: ImageIcon,
    title: "Visual strategy",
    description: "We generate supporting visuals when the deck benefits from custom imagery.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: FileText,
    title: "Deck assembly",
    description: "We assemble the final personalized presentation tailored to your target.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
];

/* ─── Helpers ─── */

function formatRunName(run: RunSummary): string {
  // Use first target's domain as the name
  const firstTarget = run.first_target_url;
  let siteName = "Run";
  if (firstTarget) {
    try {
      const url = new URL(firstTarget.startsWith("http") ? firstTarget : `https://${firstTarget}`);
      siteName = url.hostname.replace(/^www\./, "");
    } catch {
      siteName = firstTarget;
    }
  }

  const d = new Date(run.created_at);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (run.target_count > 1) {
    return `${siteName} +${run.target_count - 1} more · ${date} ${time}`;
  }
  return `${siteName} · ${date} ${time}`;
}

function formatRunDetailName(run: RunDetail): string {
  const firstTarget = run.targets[0];
  let siteName = "Run";
  if (firstTarget?.website_url) {
    try {
      const url = new URL(
        firstTarget.website_url.startsWith("http")
          ? firstTarget.website_url
          : `https://${firstTarget.website_url}`,
      );
      siteName = url.hostname.replace(/^www\./, "");
    } catch {
      siteName = firstTarget.website_url;
    }
  }

  const d = new Date(run.createdAt);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (run.targets.length > 1) {
    return `${siteName} +${run.targets.length - 1} more · ${date} ${time}`;
  }
  return `${siteName} · ${date} ${time}`;
}

/** Compute progress percentage from run detail events/targets */
function computeProgress(run: RunDetail): { percent: number; stage: string } {
  const total = run.targets.length;
  if (total === 0) return { percent: 0, stage: "Starting..." };

  if (run.status === "completed") return { percent: 100, stage: "Complete" };
  if (run.status === "failed") return { percent: 100, stage: "Failed" };

  // Count completed/failed targets
  const doneTargets = run.targets.filter(
    (t) => t.status === "delivered" || t.status === "completed" || t.status === "failed",
  ).length;

  // Check stages from events for in-progress targets
  const events = run.events;
  const lastStage = events.length > 0 ? events[events.length - 1] : null;

  // Each target goes through ~5 stages. For running targets, estimate from last event
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

  // Base progress from done targets
  const baseProgress = (doneTargets / total) * 100;
  // Add partial progress for the current in-progress target
  const currentStageWeight = lastStage?.stage ? (stageWeights[lastStage.stage] ?? 0.15) : 0.05;
  const inProgressAdd = (currentStageWeight / total) * 100;
  const percent = Math.min(Math.round(baseProgress + inProgressAdd), 99);

  // Friendly stage label
  const stageLabels: Record<string, string> = {
    run_started: "Starting pipeline...",
    preflight: "Verifying service connections...",
    seller_brief: "Analyzing your business positioning...",
    crawl: "Crawling target website and gathering data...",
    target_crawl: "Crawling target website and gathering data...",
    crawl_or_enrichment: "Gathering market intelligence...",
    enrichment: "Enriching with market research...",
    company_brief: "Building target company profile...",
    image_strategy: "Generating supporting visuals...",
    slide_planning: "Planning slide content and structure...",
    delivery: "Assembling personalized deck...",
    target_failed: "Target processing encountered an error",
  };

  const stageName = lastStage?.stage
    ? stageLabels[lastStage.stage] ?? "Processing..."
    : "Starting pipeline...";

  return { percent, stage: stageName };
}

/* ─── Activity Log ─── */
function ActivityLog({ events, isRunning }: { events: RunDetail["events"]; isRunning: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive or when running
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  return (
    <div
      ref={scrollRef}
      className="h-[240px] overflow-y-auto rounded-lg border border-border/30 bg-muted/10 scroll-smooth"
    >
      <div className="divide-y divide-border/20">
        {events.map((event) => (
          <div
            key={event.id}
            className={cn(
              "flex items-start gap-2.5 px-4 py-2.5 text-xs transition-colors",
              event.level === "error" && "bg-destructive/5",
            )}
          >
            <span
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
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
          <div className="flex items-center gap-2.5 px-4 py-2.5 text-xs">
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

  const initialLoadDone = React.useRef(false);

  React.useEffect(() => {
    fetchRuns();
  }, []);

  // Auto-select the newest running/queued run on initial load (e.g. after launching from targets page)
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
      // Fetch runs list and detail in parallel for faster updates
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

  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);

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
      {/* Pipeline steps — improved visual */}
      <div className="rounded-xl border border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30 p-6">
        <div className="mb-4">
          <h3 className="text-[14px] font-semibold text-foreground">How it works</h3>
          <p className="text-[12px] text-muted-foreground">
            Every target goes through 5 AI-powered stages to create a personalized deck.
          </p>
        </div>
        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-violet-500/20 via-blue-500/20 via-amber-500/20 via-pink-500/20 to-emerald-500/20 sm:block" />
          <div className="grid gap-4 sm:grid-cols-5">
            {pipelineSteps.map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                <div
                  className={cn(
                    "relative z-10 mb-3 flex size-12 items-center justify-center rounded-xl border border-border/30 bg-card shadow-sm transition-all hover:shadow-md",
                    step.bgColor,
                  )}
                >
                  <step.icon className={cn("size-5", step.color)} />
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background shadow-sm">
                    {i + 1}
                  </span>
                </div>
                <p className="text-[12px] font-semibold text-foreground">
                  {step.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground max-w-[140px]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline content — runs list + detail side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4">

      {/* Run list */}
      <SectionCard
        title="Runs"
        description={`${runs.length} run${runs.length !== 1 ? "s" : ""} found`}
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
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => selectRun(run.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:bg-muted/50",
                    selectedRun?.id === run.id
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/40 bg-card",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                      <FileText className="size-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">
                        {formatRunName(run)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {run.target_count} Target
                        {run.target_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={
                        run.status === "completed"
                          ? "ready"
                          : run.status === "failed" || run.status === "cancelled"
                            ? "error"
                            : run.status === "running"
                              ? "running"
                              : run.status === "partially_completed"
                                ? "incomplete"
                                : "incomplete"
                      }
                      label={run.status}
                    />
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
              ))}
            </div>
          </ScrollArea>
        )}
      </SectionCard>

      {/* Run detail */}
      {selectedRun && (
        <SectionCard
          title={formatRunDetailName(selectedRun)}
          description={`${selectedRun.targets.length} Target${selectedRun.targets.length !== 1 ? "s" : ""} · ${selectedRun.sellerContext?.companyName || "Your Business"}`}
        >
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Progress bar for running runs */}
              {(selectedRun.status === "running" || selectedRun.status === "queued") && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin text-primary" />
                      <span className="text-[13px] font-medium text-foreground">
                        {computeProgress(selectedRun).stage}
                      </span>
                    </div>
                    <span className="text-[13px] font-semibold text-primary">
                      {computeProgress(selectedRun).percent}%
                    </span>
                  </div>
                  <Progress value={computeProgress(selectedRun).percent} className="h-2" />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Typically completes in 1-2 minutes per target.
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
                      Cancel run
                    </Button>
                  </div>
                </div>
              )}

              {/* Completed banner */}
              {selectedRun.status === "completed" && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
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
              {selectedRun.status === "failed" && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-destructive" />
                      <span className="text-[13px] font-medium text-destructive">
                        {selectedRun.lastError ?? "Run failed. Check the activity log for details."}
                      </span>
                    </div>
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
                </div>
              )}

              {/* Partially completed banner */}
              {selectedRun.status === "partially_completed" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
                        {selectedRun.lastError ?? "Some targets failed. Check the activity log for details."}
                      </span>
                    </div>
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
                </div>
              )}

              {/* Cancelled banner */}
              {selectedRun.status === "cancelled" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <Ban className="size-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
                      Run was cancelled.
                    </span>
                  </div>
                </div>
              )}

              {/* Target statuses */}
              <div className="space-y-2">
                <h3 className="text-[13px] font-medium text-foreground">
                  Targets
                </h3>
                <div className="space-y-1.5">
                  {selectedRun.targets.map((target) => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        {target.status === "completed" || target.status === "delivered" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : target.status === "failed" ? (
                          <AlertCircle className="size-3.5 text-destructive" />
                        ) : target.status === "queued" ? (
                          <Clock3 className="size-3.5 text-muted-foreground" />
                        ) : (
                          <LoaderCircle className="size-3.5 animate-spin text-primary" />
                        )}
                        <span className="font-mono text-[11px]">
                          {target.website_url}
                        </span>
                      </div>
                      <span className={cn(
                        "text-[11px] capitalize",
                        target.status === "delivered" || target.status === "completed"
                          ? "text-emerald-500 font-medium"
                          : target.status === "failed"
                            ? "text-destructive font-medium"
                            : "text-muted-foreground",
                      )}>
                        {target.status === "delivered" ? "completed" : target.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Events log */}
              {selectedRun.events.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-medium text-foreground">
                      Activity log
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
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

      {/* Close the grid wrapper — show placeholder if no run selected */}
      {!selectedRun && runs.length > 0 && (
        <div className="hidden lg:flex items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 p-8">
          <p className="text-[13px] text-muted-foreground">Select a run to view details</p>
        </div>
      )}
      </div>
    </ViewLayout>
  );
}
