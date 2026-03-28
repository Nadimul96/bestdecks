"use client";

import * as React from "react";
import { X, ChevronLeft, ChevronRight, ArrowRight, BarChart3, TrendingDown, TrendingUp, Users, Clock, Zap, Target, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════
   Slide data types
   ══════════════════════════════════════════════════════════════════ */

export interface ExampleSlide {
  title: string;
  subtitle?: string;
  bullets?: string[];
  stat?: string;
  statLabel?: string;
  type: "cover" | "tension" | "data" | "vision" | "solution" | "proof" | "cta";
  layout: "centered" | "split" | "stat-left" | "stat-grid" | "icon-list" | "quote";
  /** Visual elements rendered as decorative SVG/CSS */
  visual?: "gradient-orb" | "bar-chart" | "line-chart" | "progress-ring" | "icon-grid" | "testimonial" | "metrics-row" | "none";
  /** Background variant */
  bg?: "dark" | "accent-gradient" | "subtle" | "dark-mesh";
  /** Per-slide accent override */
  accent?: string;
}

export interface ArchetypeExample {
  archetype: string;
  title: string;
  scenario: string;
  accentColor: string;
  slides: ExampleSlide[];
}

/* ══════════════════════════════════════════════════════════════════
   Cold Outreach Example — follows Thiel/Raskin framework
   ══════════════════════════════════════════════════════════════════ */

const coldOutreachExample: ArchetypeExample = {
  archetype: "cold_outreach",
  title: "Cold Outreach",
  scenario: "ClearPath AI pitching NxGen Fitness — a 2-location gym in Portland",
  accentColor: "#06B6D4",
  slides: [
    {
      title: "NxGen Fitness Is Outgrowing Its Tools",
      subtitle: "A custom operations brief — prepared by ClearPath AI",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    {
      title: "400 Members. 14 Trainers.\n2 Spreadsheets.",
      subtitle: "Back-office complexity doubles with each new location — but the tools stay the same.",
      stat: "2x",
      statLabel: "complexity per location",
      type: "tension",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    {
      title: "The Fitness Industry Just Crossed a Threshold",
      bullets: [
        "U.S. gym membership hit 77M in 2024 — an all-time record",
        "Member expectations now mirror fintech, not fitness",
        "Admin costs run 20-30% higher without unified systems",
      ],
      type: "data",
      layout: "icon-list",
      visual: "line-chart",
      bg: "subtle",
    },
    {
      title: "Half Your Members Will Leave Within Six Months",
      subtitle: "And replacing each one costs 5-7x more than keeping them.",
      stat: "50%",
      statLabel: "six-month churn rate",
      bullets: [
        "Members missing 2 weeks → 4x more likely to cancel",
        "Most gyms notice churn only when the email arrives",
      ],
      type: "data",
      layout: "stat-left",
      visual: "progress-ring",
      bg: "dark",
    },
    {
      title: "Imagine Both Locations Running as One",
      subtitle: "Real-time dashboards. Seamless booking. Zero spreadsheets.",
      type: "vision",
      layout: "centered",
      visual: "gradient-orb",
      bg: "accent-gradient",
    },
    {
      title: "One Dashboard. Both Studios.",
      subtitle: "ClearPath unifies attendance, revenue, and scheduling in real time.",
      bullets: [
        "Live attendance and revenue split by location",
        "Trainer conflicts flagged before they create gaps",
        "Ownership and staff see identical, live numbers",
      ],
      type: "solution",
      layout: "split",
      visual: "metrics-row",
      bg: "dark",
    },
    {
      title: "Stop Chasing Cancellations. Prevent Them.",
      subtitle: "Automated retention workflows that act before members ghost.",
      stat: "23%",
      statLabel: "lower monthly churn",
      bullets: [
        "Auto-flag members missing 2+ weeks",
        "Personalized nudges — not generic blasts",
        "Trainers alerted when clients stop rebooking",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "subtle",
    },
    {
      title: "Recover 15 Hours Every Week",
      subtitle: "Check-in scans become rosters. Sessions become payroll. Automatically.",
      stat: "15hrs",
      statLabel: "saved per week",
      type: "solution",
      layout: "stat-left",
      visual: "icon-grid",
      bg: "dark",
    },
    {
      title: "FitHub Co: 3 Locations, Zero Chaos",
      subtitle: "A multi-location fitness brand deployed ClearPath and scaled to a 4th gym in 90 days.",
      stat: "31%",
      statLabel: "less churn in 90 days",
      bullets: [
        "Monthly churn dropped from 8.2% to 5.6%",
        "18 staff-hours recovered per week",
        "Expanded with operational confidence",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "testimonial",
      bg: "dark-mesh",
    },
    {
      title: "Let's Map Your Workflows",
      subtitle: "30 minutes. No contracts. Just clarity on what's costing NxGen time and members.",
      bullets: [
        "Free ops audit across both Portland locations",
        "Identify your 3 highest-impact automations",
        "See your locations unified, live",
      ],
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Registry
   ══════════════════════════════════════════════════════════════════ */

export const archetypeExamples: Record<string, ArchetypeExample> = {
  cold_outreach: coldOutreachExample,
};

/* ══════════════════════════════════════════════════════════════════
   Visual elements — decorative SVG/CSS rendered per slide
   ══════════════════════════════════════════════════════════════════ */

function VisualElement({ type, accent }: { type: ExampleSlide["visual"]; accent: string }) {
  if (type === "none" || !type) return null;

  const shared = "pointer-events-none select-none";

  switch (type) {
    case "gradient-orb":
      return (
        <div className={cn(shared, "absolute -right-20 -top-20 size-80 rounded-full opacity-20 blur-[80px]")} style={{ background: accent }} />
      );

    case "bar-chart":
      return (
        <div className={cn(shared, "flex items-end gap-1.5 opacity-60")}>
          {[40, 65, 55, 80, 70, 95, 85].map((h, i) => (
            <div
              key={i}
              className="w-3 rounded-t-sm transition-all duration-700"
              style={{
                height: `${h}%`,
                maxHeight: "80px",
                background: i === 5 ? accent : `${accent}30`,
              }}
            />
          ))}
        </div>
      );

    case "line-chart":
      return (
        <svg className={cn(shared, "h-20 w-full opacity-40")} viewBox="0 0 200 60" fill="none">
          <path
            d="M0 45 Q25 42 50 38 T100 28 T150 15 T200 8"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M0 45 Q25 42 50 38 T100 28 T150 15 T200 8 V60 H0 Z"
            fill={`${accent}15`}
          />
        </svg>
      );

    case "progress-ring":
      return (
        <svg className={cn(shared, "size-24 opacity-60")} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke={`${accent}20`} strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none" stroke={accent} strokeWidth="8"
            strokeDasharray={`${50 * 2.51} ${100 * 2.51}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="54" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">50%</text>
        </svg>
      );

    case "icon-grid":
      return (
        <div className={cn(shared, "grid grid-cols-4 gap-2 opacity-40")}>
          {[Clock, Users, Zap, Target, Shield, BarChart3, TrendingUp, TrendingDown].map((Icon, i) => (
            <div key={i} className="flex size-9 items-center justify-center rounded-lg" style={{ background: `${accent}15` }}>
              <Icon className="size-4" style={{ color: accent }} />
            </div>
          ))}
        </div>
      );

    case "metrics-row":
      return (
        <div className={cn(shared, "flex gap-4")}>
          {[
            { label: "Attendance", value: "94%", trend: "+12%" },
            { label: "Revenue", value: "$47K", trend: "+8%" },
            { label: "Utilization", value: "87%", trend: "+15%" },
          ].map((m, i) => (
            <div key={i} className="rounded-lg px-3 py-2" style={{ background: `${accent}10`, border: `1px solid ${accent}20` }}>
              <p className="text-[10px] text-white/40">{m.label}</p>
              <p className="text-sm font-bold text-white">{m.value}</p>
              <p className="text-[10px] font-medium" style={{ color: accent }}>{m.trend}</p>
            </div>
          ))}
        </div>
      );

    case "testimonial":
      return (
        <div className={cn(shared, "rounded-xl px-4 py-3")} style={{ background: `${accent}08`, border: `1px solid ${accent}15` }}>
          <p className="text-[13px] italic leading-relaxed text-white/50">
            "ClearPath gave us the operational confidence to open our fourth location. We couldn't have scaled without it."
          </p>
          <p className="mt-2 text-[11px] font-medium" style={{ color: accent }}>
            — Jamie Torres, COO, FitHub Co.
          </p>
        </div>
      );

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   Slide backgrounds
   ══════════════════════════════════════════════════════════════════ */

function slideBgClass(bg: ExampleSlide["bg"], accent: string): { className: string; style?: React.CSSProperties } {
  switch (bg) {
    case "accent-gradient":
      return {
        className: "bg-gradient-to-br",
        style: { backgroundImage: `linear-gradient(135deg, ${accent}18, #0A0F1E 60%, ${accent}08)` },
      };
    case "subtle":
      return { className: "bg-[#0D1220]" };
    case "dark-mesh":
      return {
        className: "",
        style: {
          background: `radial-gradient(ellipse at 20% 50%, ${accent}10, transparent 50%), radial-gradient(ellipse at 80% 20%, ${accent}08, transparent 50%), #0A0F1E`,
        },
      };
    case "dark":
    default:
      return { className: "bg-[#0A0F1E]" };
  }
}

/* ══════════════════════════════════════════════════════════════════
   Slide renderer
   ══════════════════════════════════════════════════════════════════ */

function SlidePreview({ slide, accent }: { slide: ExampleSlide; accent: string }) {
  const bg = slideBgClass(slide.bg, accent);

  return (
    <div
      className={cn("relative aspect-[16/9] w-full overflow-hidden rounded-2xl shadow-2xl", bg.className)}
      style={bg.style}
    >
      {/* Subtle grid pattern overlay for texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Layout-specific content */}
      <div className="relative z-10 flex h-full">
        {/* ── CENTERED layout ── */}
        {(slide.layout === "centered") && (
          <div className="flex h-full w-full flex-col items-center justify-center px-10 text-center sm:px-20">
            <VisualElement type={slide.visual} accent={accent} />
            {slide.stat && (
              <p className="mb-1 text-6xl font-black tracking-tighter sm:text-8xl" style={{ color: accent }}>
                {slide.stat}
              </p>
            )}
            <h3 className={cn(
              "font-bold tracking-tight text-white whitespace-pre-line",
              slide.type === "cover" ? "text-3xl sm:text-5xl leading-[1.1]" : "text-2xl sm:text-4xl leading-tight",
            )}>
              {slide.title}
            </h3>
            {slide.subtitle && (
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/40 sm:text-base">
                {slide.subtitle}
              </p>
            )}
            {slide.bullets && (
              <ul className="mt-6 space-y-2 text-left">
                {slide.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-white/55">
                    <ArrowRight className="size-3 shrink-0" style={{ color: accent }} />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {slide.type === "cover" && (
              <div className="mt-8 flex items-center gap-2">
                <div className="size-2 rounded-full" style={{ background: accent }} />
                <span className="text-xs font-medium tracking-wide text-white/30 uppercase">
                  {slide.subtitle?.split("—")[0]?.trim()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── STAT-LEFT layout ── */}
        {slide.layout === "stat-left" && (
          <>
            {/* Left: stat + visual */}
            <div className="flex w-2/5 flex-col items-center justify-center border-r border-white/[0.06] px-6 sm:px-10">
              {slide.stat && (
                <p className="text-5xl font-black tracking-tighter sm:text-7xl" style={{ color: accent }}>
                  {slide.stat}
                </p>
              )}
              {slide.statLabel && (
                <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-widest text-white/25">
                  {slide.statLabel}
                </p>
              )}
              <div className="mt-4 w-full px-2">
                <VisualElement type={slide.visual} accent={accent} />
              </div>
            </div>
            {/* Right: content */}
            <div className="flex w-3/5 flex-col justify-center px-6 py-8 sm:px-10">
              <h3 className="text-xl font-bold leading-snug tracking-tight text-white whitespace-pre-line sm:text-2xl">
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className="mt-2 text-[13px] leading-relaxed text-white/35">{slide.subtitle}</p>
              )}
              {slide.bullets && (
                <ul className="mt-5 space-y-2.5">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/55">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ── SPLIT layout ── */}
        {slide.layout === "split" && (
          <>
            <div className="flex w-1/2 flex-col justify-center px-6 py-8 sm:px-10">
              <h3 className="text-xl font-bold leading-snug tracking-tight text-white whitespace-pre-line sm:text-2xl">
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className="mt-2 text-[13px] leading-relaxed text-white/35">{slide.subtitle}</p>
              )}
              {slide.bullets && (
                <ul className="mt-5 space-y-2.5">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/55">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex w-1/2 flex-col items-center justify-center border-l border-white/[0.06] px-6">
              <VisualElement type={slide.visual} accent={accent} />
            </div>
          </>
        )}

        {/* ── ICON-LIST layout ── */}
        {slide.layout === "icon-list" && (
          <div className="flex h-full w-full flex-col justify-center px-8 py-8 sm:px-14">
            <div className="flex items-start gap-6">
              <div className="flex-1">
                <h3 className="text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
                  {slide.title}
                </h3>
                {slide.bullets && (
                  <ul className="mt-5 space-y-4">
                    {slide.bullets.map((b, i) => {
                      const icons = [TrendingUp, Users, BarChart3];
                      const Icon = icons[i % icons.length];
                      return (
                        <li key={i} className="flex items-start gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg mt-0.5" style={{ background: `${accent}15` }}>
                            <Icon className="size-3.5" style={{ color: accent }} />
                          </div>
                          <span className="text-[13px] leading-relaxed text-white/55">{b}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="hidden w-1/3 sm:block">
                <VisualElement type={slide.visual} accent={accent} />
              </div>
            </div>
          </div>
        )}

        {/* ── QUOTE layout ── */}
        {slide.layout === "quote" && (
          <div className="flex h-full w-full flex-col items-center justify-center px-12 text-center sm:px-20">
            <div className="text-4xl font-light text-white/20" style={{ color: `${accent}40` }}>"</div>
            <h3 className="text-lg font-medium leading-relaxed tracking-tight text-white/80 sm:text-xl">
              {slide.title}
            </h3>
            {slide.subtitle && (
              <p className="mt-3 text-sm font-medium" style={{ color: accent }}>{slide.subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Type pill — bottom right */}
      <span
        className="absolute bottom-3.5 right-4 z-20 rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em]"
        style={{ color: `${accent}90`, background: `${accent}12` }}
      >
        {slide.type}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Modal
   ══════════════════════════════════════════════════════════════════ */

interface ArchetypePreviewModalProps {
  archetype: string;
  open: boolean;
  onClose: () => void;
}

export function ArchetypePreviewModal({ archetype, open, onClose }: ArchetypePreviewModalProps) {
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [direction, setDirection] = React.useState<"left" | "right">("right");
  const example = archetypeExamples[archetype];

  React.useEffect(() => {
    if (open) setCurrentSlide(0);
  }, [open, archetype]);

  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, example, currentSlide]);

  if (!open || !example) return null;

  const total = example.slides.length;
  const accent = example.accentColor;

  function goNext() {
    if (currentSlide < total - 1) {
      setDirection("right");
      setCurrentSlide((s) => s + 1);
    }
  }
  function goPrev() {
    if (currentSlide > 0) {
      setDirection("left");
      setCurrentSlide((s) => s - 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal container */}
      <div className="relative mx-4 w-full max-w-5xl" role="dialog" aria-modal="true" aria-label={`${example.title} example deck`}>
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-2 rounded-full" style={{ background: accent }} />
            <div>
              <p className="text-sm font-semibold text-white">{example.title} — Example Deck</p>
              <p className="text-[12px] text-white/40">{example.scenario}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium tabular-nums text-white/50">
              {currentSlide + 1} / {total}
            </span>
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Slide with transition */}
        <div className="relative overflow-hidden rounded-2xl">
          <div
            key={currentSlide}
            className={cn(
              "transition-all duration-500 ease-out",
              direction === "right" ? "animate-slide-in-right" : "animate-slide-in-left",
            )}
          >
            <SlidePreview slide={example.slides[currentSlide]} accent={accent} />
          </div>

          {/* Left/right click zones */}
          <button
            onClick={goPrev}
            disabled={currentSlide === 0}
            className="absolute left-0 top-0 bottom-0 w-1/5 cursor-w-resize opacity-0 disabled:cursor-default"
            aria-label="Previous slide"
          />
          <button
            onClick={goNext}
            disabled={currentSlide === total - 1}
            className="absolute right-0 top-0 bottom-0 w-1/5 cursor-e-resize opacity-0 disabled:cursor-default"
            aria-label="Next slide"
          />
        </div>

        {/* Bottom controls */}
        <div className="mt-4 flex items-center justify-between">
          {/* Progress bar */}
          <div className="flex flex-1 items-center gap-1 pr-4">
            {example.slides.map((s, i) => (
              <button
                key={i}
                onClick={() => { setDirection(i > currentSlide ? "right" : "left"); setCurrentSlide(i); }}
                className="group relative h-1 flex-1 rounded-full transition-all"
                style={{ background: i <= currentSlide ? accent : `${accent}20` }}
              >
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60 opacity-0 transition-opacity group-hover:opacity-100">
                  {s.type}
                </span>
              </button>
            ))}
          </div>

          {/* Nav arrows */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={goPrev}
              disabled={currentSlide === 0}
              className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-all hover:bg-white/[0.12] hover:text-white disabled:opacity-20 disabled:cursor-default"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={goNext}
              disabled={currentSlide === total - 1}
              className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-all hover:bg-white/[0.12] hover:text-white disabled:opacity-20 disabled:cursor-default"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
