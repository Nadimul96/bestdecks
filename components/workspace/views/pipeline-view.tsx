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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewLayout, SectionCard, StatusPill } from "../view-layout";
import { viewMeta, type RunSummary, type RunDetail } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta.pipeline;

const pipelineSteps = [
  {
    icon: Wand2,
    title: "Seller discovery",
    description: "Analyze your business context to understand what you sell.",
  },
  {
    icon: Cloud,
    title: "Target crawl",
    description: "Crawl target websites to gather intelligence.",
  },
  {
    icon: Layers3,
    title: "Research synthesis",
    description: "Enrich data with market research and public information.",
  },
  {
    icon: ImageIcon,
    title: "Visual strategy",
    description: "Generate supporting images when the deck benefits.",
  },
  {
    icon: FileText,
    title: "Deck assembly",
    description: "Assemble the final personalized presentation.",
  },
];

export function PipelineView() {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);

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
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setSelectedRun(data);
    } catch {
      // silently fail
    } finally {
      setDetailLoading(false);
    }
  }

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
      {/* Pipeline steps reference */}
      <SectionCard
        title="How it works"
        description="Every target goes through these 5 stages."
      >
        <TooltipProvider delayDuration={200}>
          <div className="grid gap-4 sm:grid-cols-5">
            {pipelineSteps.map((step, i) => (
              <div key={step.title} className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default flex-col items-center text-center">
                      <div className="relative mb-2 flex size-10 items-center justify-center rounded-xl bg-muted transition-colors hover:bg-muted/80">
                        <step.icon className="size-4 text-muted-foreground" />
                        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground">
                        {step.title}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{step.description}</p>
                  </TooltipContent>
                </Tooltip>
                {i < pipelineSteps.length - 1 && (
                  <div className="absolute right-0 top-5 hidden h-px w-full translate-x-1/2 bg-border/60 sm:block" />
                )}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </SectionCard>

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
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted">
              <Search className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No runs yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Import targets and launch a run to see progress here.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
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
                    <FileText className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        Run #{run.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
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

      {/* Run detail */}
      {selectedRun && (
        <SectionCard
          title={`Run #${selectedRun.id.slice(0, 8)}`}
          description={`${selectedRun.targets.length} targets · ${selectedRun.deliveryFormat}`}
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
              {/* Target statuses */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">
                  Targets
                </h3>
                <div className="space-y-1">
                  {selectedRun.targets.map((target) => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {target.status === "completed" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : target.status === "failed" ? (
                          <AlertCircle className="size-3.5 text-destructive" />
                        ) : (
                          <Clock3 className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="font-mono text-xs">
                          {target.website_url}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {target.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Events log */}
              {selectedRun.events.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">
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
