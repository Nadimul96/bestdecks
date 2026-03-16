"use client";

import * as React from "react";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileText,
  Rocket,
  SearchCheck,
  Settings2,
  Sparkles,
  Star,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, StatusPill } from "../view-layout";
import type { CurrentUser, RunSummary } from "@/lib/workspace-types";
import { viewMeta } from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const meta = viewMeta.overview;

function formatOverviewRunName(run: RunSummary): string {
  let siteName = "Run";
  if (run.first_target_url) {
    try {
      const u = run.first_target_url;
      const url = new URL(u.startsWith("http") ? u : `https://${u}`);
      siteName = url.hostname.replace(/^www\./, "");
    } catch {
      siteName = run.first_target_url;
    }
  }
  const d = new Date(run.created_at);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (run.target_count > 1) return `${siteName} +${run.target_count - 1} · ${date} ${time}`;
  return `${siteName} · ${date} ${time}`;
}

interface ReadinessItem {
  id: string;
  label: string;
  icon: LucideIcon;
  hash: string;
  status: "ready" | "incomplete";
  detail: string;
}

export function OverviewView({ currentUser }: { currentUser: CurrentUser }) {
  const { currentBusiness, businesses, credits } = useBusinessContext();
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [readinessLoading, setReadinessLoading] = React.useState(true);
  const [readinessState, setReadinessState] = React.useState<
    Record<string, boolean>
  >({
    seller: false,
    settings: false,
    targets: false,
  });

  const setupComplete = currentBusiness?.setupComplete ?? false;

  /* Fetch runs */
  React.useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => {
        setRuns(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* Check actual readiness — mirrors setup-guide.tsx logic */
  React.useEffect(() => {
    if (setupComplete) {
      setReadinessState({ seller: true, settings: true, targets: true });
      setReadinessLoading(false);
      return;
    }

    async function checkReadiness() {
      const done: Record<string, boolean> = {
        seller: false,
        settings: false,
        targets: false,
      };

      try {
        const sellerRes = await fetch("/api/onboarding/seller-context");
        if (sellerRes.ok) {
          const data = await sellerRes.json();
          if (data?.companyName || data?.offerSummary) {
            done.seller = true;
          }
        }
      } catch {
        // ignore
      }

      try {
        const questRes = await fetch("/api/onboarding/questionnaire");
        if (questRes.ok) {
          const data = await questRes.json();
          if (data?.audience || data?.objective) {
            done.settings = true;
          }
        }
      } catch {
        // ignore
      }

      try {
        const runsRes = await fetch("/api/runs");
        if (runsRes.ok) {
          const data = await runsRes.json();
          if (Array.isArray(data) && data.length > 0) {
            done.targets = true;
          }
        }
      } catch {
        // ignore
      }

      setReadinessState(done);
      setReadinessLoading(false);
    }

    checkReadiness();
  }, [setupComplete]);

  const readiness: ReadinessItem[] = [
    {
      id: "seller",
      label: "Business context",
      icon: Briefcase,
      hash: "#seller-context",
      status: readinessState.seller ? "ready" : "incomplete",
      detail: readinessState.seller
        ? "Context configured"
        : "Tell us what you sell",
    },
    {
      id: "settings",
      label: "Run settings",
      icon: Settings2,
      hash: "#run-settings",
      status: readinessState.settings ? "ready" : "incomplete",
      detail: readinessState.settings
        ? "Preferences saved"
        : "Configure deck style and tone",
    },
    {
      id: "targets",
      label: "Targets imported",
      icon: Upload,
      hash: "#target-intake",
      status: readinessState.targets ? "ready" : "incomplete",
      detail: readinessState.targets
        ? "Targets added"
        : "Add companies to personalize for",
    },
  ];

  const completedCount = readiness.filter((r) => r.status === "ready").length;
  const progress = Math.round((completedCount / readiness.length) * 100);

  const firstName = currentUser?.name?.split(" ")[0];

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={`Welcome${firstName ? `, ${firstName}` : ""}`}
      description={
        setupComplete && currentBusiness
          ? `Managing ${currentBusiness.name}. ${businesses.length > 1 ? `${businesses.length} businesses total.` : ""}`
          : meta.description
      }
    >
      {/* ── Setup complete: ready-state hero ── */}
      {setupComplete && (
        <div className="rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.04] via-background to-background p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Sparkles className="size-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">
                  {currentBusiness?.name} is ready
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {credits
                    ? `${credits.balance} credit${credits.balance !== 1 ? "s" : ""} available`
                    : "Start generating decks for your targets"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="#delivery">
                  <FileText className="size-3.5" />
                  View decks
                </a>
              </Button>
              <Button asChild size="sm" className="gap-1.5 shadow-sm">
                <a href="#target-intake">
                  <Rocket className="size-3.5" />
                  New run
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup incomplete: progress banner ── */}
      {!setupComplete && (
        <>
          {readinessLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : (
            progress < 100 && (
              <div className="card-elevated rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-primary/[0.02] to-transparent p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                        <Rocket className="size-3.5 text-primary" />
                      </div>
                      <h2 className="text-[15px] font-semibold text-foreground">
                        {currentBusiness
                          ? `Set up ${currentBusiness.name}`
                          : "Complete your setup"}
                      </h2>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {completedCount} of {readiness.length} steps done — finish
                      setup to launch your first run.
                    </p>
                    <Progress value={progress} className="h-1.5 w-64" />
                  </div>
                  <Button asChild size="sm" className="gap-1.5 shadow-sm">
                    <a
                      href={
                        readiness.find((r) => r.status === "incomplete")?.hash ??
                        "#onboarding"
                      }
                    >
                      Continue setup
                      <ArrowRight className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            )
          )}

          {/* Readiness checklist */}
          {readinessLoading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {readiness.map((item) => (
                <a
                  key={item.label}
                  href={item.hash}
                  className="card-elevated group flex items-start gap-3.5 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-border hover:shadow-md"
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      item.status === "ready"
                        ? "bg-emerald-500/10"
                        : "bg-muted group-hover:bg-muted/80",
                    )}
                  >
                    {item.status === "ready" ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <item.icon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-foreground">
                        {item.label}
                      </p>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {/* Recent runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">
            Recent runs
          </h2>
          {runs.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
              <a href="#pipeline">
                View all
                <ArrowRight className="size-3" />
              </a>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/50 py-16">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
              <SearchCheck className="size-5 text-muted-foreground/60" />
            </div>
            <p className="text-[13px] font-medium text-foreground">
              No runs yet
            </p>
            <p className="mt-1 max-w-[260px] text-center text-[12px] leading-relaxed text-muted-foreground">
              {setupComplete
                ? "Import targets to launch your first batch of personalized decks."
                : "Complete setup and import targets to launch your first batch of personalized decks."}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
              <a href={setupComplete ? "#target-intake" : "#onboarding"}>
                {setupComplete ? "Import targets" : "Get started"}
                <ArrowRight className="size-3" />
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {runs.slice(0, 5).map((run) => (
              <a
                key={run.id}
                href="#pipeline"
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3 transition-all hover:border-border/60 hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <FileText className="size-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {formatOverviewRunName(run)}
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
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {new Date(run.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </ViewLayout>
  );
}
