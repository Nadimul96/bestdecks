"use client";

import * as React from "react";
import {
  AlertCircle,
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
    image_strategy: 0.75,
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
    seller_brief: "Analyzing your business...",
    crawl: "Crawling target website...",
    target_crawl: "Crawling target website...",
    crawl_or_enrichment: "Gathering intelligence...",
    enrichment: "Enriching with research...",
    company_brief: "Synthesizing insights...",
    image_strategy: "Generating visuals...",
    delivery: "Assembling deck...",
  };

  const stageName = lastStage?.stage
    ? stageLabels[lastStage.stage] ?? "Processing..."
    : "Starting pipeline...";

  return { percent, stage: stageName };
}

export function PipelineView() {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    fetchRuns();
  }, []);

  // Auto-refresh running runs every 4 seconds
  React.useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "queued");
    if (!hasRunning && !(selectedRun && (selectedRun.status === "running" || selectedRun.status === "queued"))) return;

    const interval = setInterval(() => {
      fetchRuns();
      if (selectedRun && (selectedRun.status === "running" || selectedRun.status === "queued")) {
        selectRun(selectedRun.id, true);
      }
    }, 4000);

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
          <ScrollArea className="max-h-[400px]">
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
                        {run.target_count} target
                        {run.target_count !== 1 ? "s" : ""} ·{" "}
                        {run.delivery_format}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill
                      status={
                        run.status === "completed"
                          ? "ready"
                          : run.status === "failed"
                            ? "error"
                            : run.status === "running"
                              ? "running"
                              : "incomplete"
                      }
                      label={run.status}
                    />
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
          description={`${selectedRun.targets.length} target${selectedRun.targets.length !== 1 ? "s" : ""} · ${selectedRun.deliveryFormat}`}
        >
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
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
                  <p className="text-[11px] text-muted-foreground">
                    Typically completes in 1-2 minutes per target.
                  </p>
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
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 text-destructive" />
                    <span className="text-[13px] font-medium text-destructive">
                      {selectedRun.lastError ?? "Run failed. Check the activity log for details."}
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
                  <h3 className="text-[13px] font-medium text-foreground">
                    Activity log
                  </h3>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-1">
                      {selectedRun.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-2 px-2 py-1 text-xs"
                        >
                          <span
                            className={cn(
                              "mt-0.5 size-1.5 shrink-0 rounded-full",
                              event.level === "error"
                                ? "bg-destructive"
                                : event.level === "warning"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="text-muted-foreground">
                            {event.message}
                          </span>
                          <span className="ml-auto shrink-0 text-muted-foreground/50">
                            {new Date(event.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}
    </ViewLayout>
  );
}
