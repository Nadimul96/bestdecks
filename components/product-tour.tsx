"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface TourStep {
  title: string;
  description: string;
  hash?: string;
  anchorSelector?: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface ProductTourProps {
  onComplete: () => void;
}

/* ─────────────────────────────────────────────
   Tour Steps
   ───────────────────────────────────────────── */

const TOUR_STEPS: TourStep[] = [
  {
    title: "Sidebar navigation",
    description:
      "Navigate your workspace. Configure \u2192 Execute \u2192 Deliver.",
    anchorSelector: "[data-slot='sidebar']",
    position: "right",
  },
  {
    title: "Your Business",
    description:
      "Start here. Tell us about your business and we\u2019ll auto-fill from your website.",
    hash: "seller-context",
    position: "bottom",
  },
  {
    title: "Deck Style",
    description: "Choose your deck archetype, tone, and visual style.",
    hash: "run-settings",
    position: "bottom",
  },
  {
    title: "Targets",
    description:
      "Paste target company URLs. We\u2019ll research each one and build personalized decks.",
    hash: "target-intake",
    position: "bottom",
  },
  {
    title: "Pipeline & Delivery",
    description:
      "Track progress here. Once complete, download decks from Delivery.",
    hash: "pipeline",
    position: "bottom",
  },
];

const STORAGE_KEY = "bestdecks_tour_complete";

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

export function ProductTour({ onComplete }: ProductTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [animating, setAnimating] = useState(false);

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  /* ── Navigate hash when step changes ────── */
  useEffect(() => {
    if (current?.hash) {
      window.location.hash = current.hash;
    }
  }, [current]);

  /* ── Transition helper ──────────────────── */
  const transitionTo = useCallback((next: number) => {
    setAnimating(true);
    // Brief fade-out, then update step
    const timer = setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  /* ── Handlers ───────────────────────────── */
  const handleNext = useCallback(() => {
    if (isLast) {
      handleComplete();
      return;
    }
    transitionTo(step + 1);
  }, [step, isLast, transitionTo]);

  const handleBack = useCallback(() => {
    if (!isFirst) {
      transitionTo(step - 1);
    }
  }, [step, isFirst, transitionTo]);

  const handleComplete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage may be unavailable
    }
    setVisible(false);
    onComplete();
  }, [onComplete]);

  /* ── Keyboard navigation ────────────────── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleComplete();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handleBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleComplete, handleNext, handleBack]);

  if (!visible) return null;

  return (
    <>
      {/* ── Backdrop overlay ─────────────────── */}
      <div
        className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[2px]"
        onClick={handleComplete}
        aria-hidden="true"
      />

      {/* ── Tour card ────────────────────────── */}
      <div
        role="dialog"
        aria-label={`Product tour - step ${step + 1} of ${TOUR_STEPS.length}`}
        aria-modal="true"
        className={cn(
          "fixed z-[9999] w-[360px] max-w-[calc(100vw-2rem)]",
          "rounded-xl border bg-card card-elevated",
          "p-5 text-card-foreground",
          "transition-opacity duration-150",
          // Center the card on screen
          "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          // For sidebar step, nudge to the right
          step === 0 && "sm:left-[calc(16rem+200px)] sm:translate-x-0",
          animating ? "opacity-0" : "animate-fade-in opacity-100",
        )}
      >
        {/* ── Header ───────────────────────── */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Compass className="size-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                Quick tour
              </p>
              <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                {current.title}
              </h2>
            </div>
          </div>
          <button
            onClick={handleComplete}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* ── Body ─────────────────────────── */}
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">
          {current.description}
        </p>

        {/* ── Footer ───────────────────────── */}
        <div className="flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full transition-all duration-200",
                  i === step
                    ? "w-4 bg-primary"
                    : i < step
                      ? "bg-primary/40"
                      : "bg-muted-foreground/20",
                )}
              />
            ))}
            <span className="ml-2 text-xs text-muted-foreground/60">
              {step + 1} of {TOUR_STEPS.length}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="size-3" data-icon="inline-start" />
                Back
              </Button>
            )}
            {isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleComplete}
                className="text-xs text-muted-foreground"
              >
                Skip tour
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="gap-1 text-xs">
              {isLast ? "Start building" : "Next"}
              {!isLast && (
                <ChevronRight className="size-3" data-icon="inline-end" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
