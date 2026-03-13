"use client";

import * as React from "react";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Rocket,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
   Setup steps
   ───────────────────────────────────────────── */

interface SetupStep {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  hash: string;
  checkEndpoint: string;
}

const steps: SetupStep[] = [
  {
    id: "seller",
    label: "Business context",
    description: "Tell us what you sell and who you help",
    icon: Briefcase,
    hash: "#seller-context",
    checkEndpoint: "/api/onboarding/seller-context",
  },
  {
    id: "settings",
    label: "Run settings",
    description: "Configure deck style, tone, and format",
    icon: Settings2,
    hash: "#run-settings",
    checkEndpoint: "/api/onboarding/questionnaire",
  },
  {
    id: "targets",
    label: "Import targets",
    description: "Add companies to personalize decks for",
    icon: Upload,
    hash: "#target-intake",
    checkEndpoint: "/api/runs",
  },
];

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

export function SetupGuide() {
  const [expanded, setExpanded] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [completed, setCompleted] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  /* Check actual setup state on mount */
  React.useEffect(() => {
    async function checkReadiness() {
      const done = new Set<string>();

      try {
        // Check seller context
        const sellerRes = await fetch("/api/onboarding/seller-context");
        if (sellerRes.ok) {
          const data = await sellerRes.json();
          if (data?.companyName || data?.offerSummary) {
            done.add("seller");
          }
        }
      } catch {
        // ignore
      }

      try {
        // Check questionnaire
        const questRes = await fetch("/api/onboarding/questionnaire");
        if (questRes.ok) {
          const data = await questRes.json();
          if (data?.audience || data?.objective) {
            done.add("settings");
          }
        }
      } catch {
        // ignore
      }

      try {
        // Check runs — if any exist, targets have been imported
        const runsRes = await fetch("/api/runs");
        if (runsRes.ok) {
          const data = await runsRes.json();
          if (Array.isArray(data) && data.length > 0) {
            done.add("targets");
          }
        }
      } catch {
        // ignore
      }

      setCompleted(done);
      setLoading(false);
    }

    checkReadiness();
  }, []);

  const completedCount = completed.size;
  const allDone = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  /* Auto-dismiss once everything is done */
  React.useEffect(() => {
    if (allDone && !loading) {
      const timer = setTimeout(() => setDismissed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [allDone, loading]);

  /* Don't render if dismissed or all done */
  if (dismissed) return null;

  /* Minimized pill */
  if (!expanded) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-scale-in">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg transition-all hover:shadow-xl",
            "bg-primary text-primary-foreground",
            "hover:scale-[1.02] active:scale-[0.98]",
          )}
        >
          <Rocket className="size-4" />
          <span className="text-sm font-medium">
            Setup {completedCount}/{steps.length}
          </span>
          <div className="flex items-center gap-0.5">
            {steps.map((step) => (
              <span
                key={step.id}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  completed.has(step.id)
                    ? "bg-primary-foreground"
                    : "bg-primary-foreground/30",
                )}
              />
            ))}
          </div>
          <ChevronUp className="ml-0.5 size-3.5" />
        </button>
      </div>
    );
  }

  /* Expanded card */
  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-scale-in">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-primary/[0.06] to-transparent px-4 py-3">
          <div className="flex items-center gap-2">
            {allDone ? (
              <Sparkles className="size-4 text-primary" />
            ) : (
              <Rocket className="size-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {allDone ? "You're all set!" : "Setup guide"}
            </h3>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
            {allDone && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setDismissed(true)}
              >
                <X className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedCount} of {steps.length} complete
            </span>
            <span className="font-medium tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} className="mt-1.5 h-1.5" />
        </div>

        {/* Steps */}
        <div className="px-3 pb-3 pt-1">
          <div className="space-y-0.5">
            {steps.map((step) => {
              const isDone = completed.has(step.id);

              return (
                <a
                  key={step.id}
                  href={step.hash}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    isDone
                      ? "opacity-60"
                      : "hover:bg-muted/60",
                  )}
                >
                  {/* Step icon */}
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isDone
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>

                  {/* Step action icon */}
                  <step.icon
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0 transition-colors",
                      isDone
                        ? "text-muted-foreground/30"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                </a>
              );
            })}
          </div>
        </div>

        {/* Footer CTA when not done */}
        {!allDone && (
          <div className="border-t border-border/40 px-4 py-3">
            <Button asChild size="sm" className="w-full gap-1.5 shadow-sm">
              <a
                href={
                  steps.find((s) => !completed.has(s.id))?.hash ?? "#onboarding"
                }
              >
                Continue setup
                <Rocket className="size-3.5" />
              </a>
            </Button>
          </div>
        )}

        {/* Celebration footer when all done */}
        {allDone && (
          <div className="border-t border-border/40 px-4 py-3">
            <Button
              asChild
              size="sm"
              className="w-full gap-1.5 shadow-sm"
            >
              <a href="#target-intake">
                Launch your first run
                <Sparkles className="size-3.5" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
