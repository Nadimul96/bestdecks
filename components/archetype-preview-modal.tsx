"use client";

import * as React from "react";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Slide data for each archetype example ─────────────────────── */

export interface ExampleSlide {
  title: string;
  subtitle?: string;
  bullets?: string[];
  stat?: string;
  type: "statement" | "content" | "data" | "proof" | "cta";
  accent?: string; // override accent color
}

export interface ArchetypeExample {
  archetype: string;
  title: string;
  scenario: string;
  slides: ExampleSlide[];
}

/* ── Cold Outreach example (ClearPath AI → NxGen Fitness) ──────── */

const coldOutreachExample: ArchetypeExample = {
  archetype: "cold_outreach",
  title: "Cold Outreach",
  scenario: "ClearPath AI pitching NxGen Fitness — a 2-location gym chain in Portland",
  slides: [
    {
      title: "NxGen Fitness Is Outgrowing\nIts Tools",
      subtitle: "A custom operations brief from ClearPath AI",
      type: "statement",
    },
    {
      title: "400 Members. 14 Trainers.\n2 Spreadsheets Holding It Together.",
      subtitle: "Back-office complexity doubles with each new gym — but the tools stay the same",
      stat: "2x",
      type: "statement",
    },
    {
      title: "The Fitness Industry Crossed\na Threshold",
      subtitle: "Members expect app-first, instant everything. Operators still toggle between 6+ tools daily.",
      bullets: [
        "U.S. gym membership hit 77M in 2024 — a record",
        "Member expectations now mirror fintech, not fitness",
        "Admin costs run 20-30% higher without unified systems",
      ],
      type: "data",
    },
    {
      title: "Half Your New Members Will Quit\nWithin Six Months",
      subtitle: "Acquiring each replacement costs 5-7x more than keeping them",
      stat: "50%",
      bullets: [
        "Average annual gym churn: 30-50%",
        "Members missing 2 weeks are 4x more likely to cancel",
        "Most gyms only notice when the cancellation arrives",
      ],
      type: "data",
    },
    {
      title: "The Gym That Runs Itself Wins",
      subtitle: "Imagine both Portland locations operating as one synchronized system",
      bullets: [
        "Real-time dashboards across every studio",
        "Members book seamlessly at either location",
        "No CSV exports. No end-of-month scrambles.",
      ],
      type: "content",
    },
    {
      title: "One Dashboard. Both Locations.\nZero Guesswork.",
      subtitle: "ClearPath unifies attendance, revenue, and scheduling in real time",
      bullets: [
        "Live attendance and revenue split by studio",
        "Trainer scheduling conflicts flagged automatically",
        "Ownership and managers see identical numbers",
      ],
      type: "content",
    },
    {
      title: "Stop Chasing Cancellations.\nPrevent Them.",
      subtitle: "Automated retention workflows that intervene before members ghost",
      stat: "23%",
      bullets: [
        "Auto-flag members missing 2+ consecutive weeks",
        "Personalized nudges — not generic email blasts",
        "Trainers alerted when clients stop rebooking",
      ],
      type: "content",
    },
    {
      title: "Kill 15 Hours of Busywork\nEvery Week",
      subtitle: "Check-in scans become rosters. Sessions become payroll. Automatically.",
      stat: "15hrs",
      bullets: [
        "Class rosters populate from check-in data",
        "Payroll calculates from actual sessions taught",
        "No manual reconciliation across locations",
      ],
      type: "data",
    },
    {
      title: "FitHub Co: 3 Locations, Zero Chaos",
      subtitle: "A multi-location fitness brand in Austin deployed ClearPath and scaled to a 4th gym in 90 days",
      stat: "31%",
      bullets: [
        "Monthly churn dropped from 8.2% to 5.6%",
        "18 staff-hours recovered per week",
        "Expanded to a 4th location with confidence",
      ],
      type: "proof",
    },
    {
      title: "Let's Map Your Workflows\nin 30 Minutes",
      subtitle: "No contracts. No commitments. Just clarity on what's costing NxGen time and members.",
      bullets: [
        "Free ops audit across both Portland locations",
        "Identify your 3 highest-impact automations",
        "See your locations unified, live",
      ],
      type: "cta",
    },
  ],
};

/* ── Registry (add more archetypes here) ────────────────────────── */

export const archetypeExamples: Record<string, ArchetypeExample> = {
  cold_outreach: coldOutreachExample,
};

/* ── Slide renderer ─────────────────────────────────────────────── */

function SlidePreview({ slide, index, total }: { slide: ExampleSlide; index: number; total: number }) {
  const accentColor = slide.accent ?? "#06B6D4";

  // Type-based accent bars
  const typeColors: Record<string, string> = {
    statement: "#06B6D4",
    content: "#22C55E",
    data: "#F59E0B",
    proof: "#8B5CF6",
    cta: "#EF4444",
  };
  const barColor = typeColors[slide.type] ?? accentColor;

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#0A0F1E] shadow-2xl">
      {/* Top accent bar */}
      <div
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${barColor}00, ${barColor}, ${barColor}00)` }}
      />

      {/* Slide number badge */}
      <div className="absolute right-5 top-5 z-10 flex items-center gap-1.5">
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/40 tabular-nums backdrop-blur-sm">
          {index + 1} / {total}
        </span>
      </div>

      {/* Slide content — two-column for data/proof with stat, single col otherwise */}
      <div className={cn(
        "flex h-full",
        slide.stat && slide.bullets ? "items-center gap-6 px-8 py-8 sm:gap-10 sm:px-14 sm:py-12" : "flex-col justify-center px-8 py-8 sm:px-14 sm:py-12",
      )}>
        {/* Left: stat callout (if present and has bullets — side-by-side layout) */}
        {slide.stat && slide.bullets && (
          <div className="flex shrink-0 flex-col items-center justify-center">
            <p
              className="text-5xl font-black tracking-tighter sm:text-7xl"
              style={{ color: accentColor }}
            >
              {slide.stat}
            </p>
            {slide.type === "proof" && (
              <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-white/20">
                improvement
              </span>
            )}
          </div>
        )}

        {/* Right (or full-width): title + subtitle + bullets */}
        <div className="min-w-0 flex-1">
          {/* Inline stat for statement slides without bullets */}
          {slide.stat && !slide.bullets && (
            <p
              className="mb-3 text-5xl font-black tracking-tighter sm:text-7xl"
              style={{ color: accentColor }}
            >
              {slide.stat}
            </p>
          )}

          {/* Title */}
          <h3 className={cn(
            "font-bold tracking-tight text-white whitespace-pre-line",
            slide.type === "statement" && !slide.stat
              ? "text-2xl leading-tight sm:text-[2.5rem] sm:leading-[1.15]"
              : "text-lg leading-snug sm:text-2xl",
          )}>
            {slide.title}
          </h3>

          {/* Subtitle */}
          {slide.subtitle && (
            <p
              className={cn(
                "mt-2 text-[13px] leading-relaxed sm:text-sm",
                slide.type === "cta" ? "font-medium" : "",
              )}
              style={{ color: slide.type === "cta" ? accentColor : "rgba(255,255,255,0.35)" }}
            >
              {slide.subtitle}
            </p>
          )}

          {/* Bullets */}
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/55 sm:text-sm">
                  <span
                    className="mt-[7px] size-1 shrink-0 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom-right type label */}
      <span
        className="absolute bottom-4 right-5 rounded-sm px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest"
        style={{ color: `${barColor}80`, backgroundColor: `${barColor}10` }}
      >
        {slide.type}
      </span>
    </div>
  );
}

/* ── Modal component ────────────────────────────────────────────── */

interface ArchetypePreviewModalProps {
  archetype: string;
  open: boolean;
  onClose: () => void;
}

export function ArchetypePreviewModal({ archetype, open, onClose }: ArchetypePreviewModalProps) {
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const example = archetypeExamples[archetype];

  // Reset slide on open
  React.useEffect(() => {
    if (open) setCurrentSlide(0);
  }, [open, archetype]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentSlide((s) => Math.min(s + 1, (example?.slides.length ?? 1) - 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentSlide((s) => Math.max(s - 1, 0));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, example]);

  if (!open || !example) return null;

  const slide = example.slides[currentSlide];
  const total = example.slides.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-4xl animate-scale-in" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{example.title} Example</p>
            <p className="text-xs text-white/50">{example.scenario}</p>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Slide */}
        <SlidePreview slide={slide} index={currentSlide} total={total} />

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between">
          {/* Slide dots */}
          <div className="flex items-center gap-1">
            {example.slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === currentSlide
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/20 hover:bg-white/40",
                )}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentSlide((s) => Math.max(s - 1, 0))}
              disabled={currentSlide === 0}
              className="h-8 gap-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <span className="text-xs tabular-nums text-white/40">
              {currentSlide + 1} of {total}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentSlide((s) => Math.min(s + 1, total - 1))}
              disabled={currentSlide === total - 1}
              className="h-8 gap-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
