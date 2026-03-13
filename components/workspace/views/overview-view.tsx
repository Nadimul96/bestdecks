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
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, StatusPill } from "../view-layout";
import type { CurrentUser, RunSummary } from "@/lib/workspace-types";
import { viewMeta } from "@/lib/workspace-types";

const meta = viewMeta.overview;

interface ReadinessItem {
  id: string;
  label: string;
  icon: LucideIcon;
  hash: string;
  status: "ready" | "incomplete";
  detail: string;
}

export function OverviewView({ currentUser }: { currentUser: CurrentUser }) {
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
  }, []);

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

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={`Welcome${currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}`}
      description={meta.description}
    >
      {/* Quick-start banner */}
      {readinessLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : (
        progress < 100 && (
          <div className="rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.04] to-transparent p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Rocket className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Complete your setup
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {completedCount} of {readiness.length} steps done — finish
                  setup to launch your first run.
                </p>
                <Progress value={progress} className="h-1.5 w-64" />
              </div>
              <Button asChild size="sm">
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
              className="group flex items-start gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:border-border hover:shadow-md"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                {item.status === "ready" ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <item.icon className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <StatusPill status={item.status} />
                </div>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Recent runs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Recent runs
          </h2>
          {runs.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/50 py-16">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted">
              <SearchCheck className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No runs yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete setup to launch your first batch of personalized decks.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href="#onboarding">Get started</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </ViewLayout>
  );
}
