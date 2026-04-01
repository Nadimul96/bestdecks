"use client";

import * as React from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  Users,
  BarChart3,
  UserX,
  UserCheck,
  Zap,
  Shield,
  Globe,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  alaiPreviewThemes,
  getAlaiPreviewTheme,
  type AlaiPreviewTheme,
} from "@/src/examples/alai-preview-themes";

/* ══════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════ */

export interface ExampleSlide {
  title: string;
  subtitle?: string;
  bullets?: string[];
  callout?: string;
  stat?: string;
  statLabel?: string;
  type: "cover" | "tension" | "data" | "vision" | "solution" | "proof" | "cta";
  layout: "centered" | "split" | "stat-left" | "icon-list" | "quote";
  visual?:
    | "gradient-orb"
    | "bar-chart"
    | "line-chart"
    | "churn-grid"
    | "icon-grid"
    | "metrics-row"
    | "testimonial"
    | "dot-table"
    | "metric-grid"
    | "fund-bars"
    | "team-grid"
    | "market-bars"
    | "none";
  bg?: "dark" | "accent-gradient" | "subtle" | "dark-mesh" | "light" | "light-accent";
}

export interface ArchetypeExample {
  archetype: string;
  title: string;
  scenario: string;
  defaultThemeKey?: string;
  coverEyebrow?: string;
  coverFooter?: string;
  watermark?: string;
  slides: ExampleSlide[];
}

/* ══════════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════════ */

function getSurfaceTheme(theme: AlaiPreviewTheme): "light" | "dark" {
  return theme.family;
}

/**
 * Renders text with **bold** markers converted to accent-colored <strong> spans.
 * Used to replicate the Willow deck's inline green-phrase highlighting technique.
 */
function renderHighlight(text: string, accent: string): React.ReactNode {
  if (!text.includes("**")) return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ color: accent }} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Cold Outreach Example — Thiel / Raskin arc (dark mode)
   ══════════════════════════════════════════════════════════════════ */

const coldOutreachExample: ArchetypeExample = {
  archetype: "cold_outreach",
  title: "Cold Outreach",
  scenario: "ClearPath AI pitching NxGen Fitness — a 2-location gym in Portland",
  defaultThemeKey: "simple-dark",
  coverEyebrow: "NxGen Fitness · Portland, OR",
  coverFooter: "CLEARPATH AI",
  slides: [
    // ── Slide 1: Cover (Hook) ──
    {
      title: "A Nerve Center for\nNxGen Fitness",
      subtitle: "A custom operations brief for your 2-location fitness operation",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    // ── Slide 2: Pain — Operational Chaos ──
    {
      title: "400 Members. 14 Trainers.\n2 Spreadsheets Holding It Together.",
      subtitle:
        "Back-office complexity doubles with each location — but the tools stay frozen in time.",
      stat: "4 hrs",
      statLabel: "wasted every Monday on reporting",
      bullets: [
        "Portland SE tracks check-ins on paper. NW uses a Google Form. Neither system talks to the other.",
        "Trainer schedules span 3 calendars — conflicts surface only when a member shows up to an empty room",
        "Multi-location gyms with unified systems grow 2.3× faster (IHRSA 2026)",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    // ── Slide 3: Pain — Churn Bleeding Revenue ──
    {
      title: "You're Losing $240K/Year to\nMembers You Could Have Saved",
      subtitle:
        "Acquiring each replacement costs 5–7× more than retaining the one who left.",
      stat: "$240K",
      statLabel: "lost annually to preventable churn",
      bullets: [
        "Members who miss 2 consecutive weeks are 4× more likely to cancel — NxGen has no system to detect this",
        "By the time the cancellation email arrives, the member mentally left 3 weeks ago",
        "Industry average: 50% six-month churn. Gyms with retention systems cut this to 28%",
      ],
      type: "data",
      layout: "split",
      visual: "churn-grid",
      bg: "subtle",
    },
    // ── Slide 4: Vision — The Reframe ──
    {
      title: "What If Both Locations Ran\nAs One Machine?",
      subtitle:
        "Every check-in, every class, every dollar — visible in real time. From any device. By any staff member.",
      stat: "1",
      statLabel: "unified nerve center for all of NxGen",
      type: "vision",
      layout: "centered",
      visual: "gradient-orb",
      bg: "accent-gradient",
    },
    // ── Slide 5: Solution — Unified Operations ──
    {
      title: "One Dashboard. Both Studios.\n15 Hours Back Every Week.",
      subtitle:
        "ClearPath replaces the patchwork — attendance, revenue, scheduling, and payroll unified from day one.",
      stat: "15 hrs",
      statLabel: "saved per week across locations",
      bullets: [
        "Live attendance and revenue by location — no more Monday morning reporting marathons",
        "Trainer conflicts flagged 48 hours before they create gaps in the schedule",
        "Payroll auto-calculated from session logs — accuracy jumps from ~85% to 99.6%",
        "End-of-month close drops from 2 days to 20 minutes",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "metrics-row",
      bg: "dark",
    },
    // ── Slide 6: Solution — Retention Engine ──
    {
      title: "Stop Reacting to Cancellations.\nStart Predicting Them.",
      subtitle:
        "ClearPath's retention engine identifies at-risk members before they ghost — and acts automatically.",
      stat: "23%",
      statLabel: "lower monthly churn",
      bullets: [
        "Auto-flag members missing 2+ sessions — alerts go to their trainer, not a spreadsheet",
        "Personalized win-back sequences triggered by behavior, not batch email blasts",
        "Monthly churn reports with root-cause analysis by location, class type, and trainer",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "icon-grid",
      bg: "dark-mesh",
    },
    // ── Slide 7: Proof — Case Study ──
    {
      title: "FitHub Co Opened Location #4\n90 Days After Deploying ClearPath",
      subtitle:
        "A multi-location brand in Austin deployed ClearPath in March 2025 — and scaled with confidence.",
      stat: "31%",
      statLabel: "less churn in 90 days",
      bullets: [
        "Monthly churn dropped from 8.2% → 5.6% across all locations",
        "18 staff-hours recovered per week — redirected to member experience",
        "Expanded with full operational confidence and zero new admin hires",
      ],
      type: "proof",
      layout: "split",
      visual: "testimonial",
      bg: "subtle",
    },
    // ── Slide 8: CTA ──
    {
      title: "See NxGen Unified. Live.\nIn Under 30 Minutes.",
      subtitle:
        "No contracts. No pressure. Just clarity on what's costing you time and members.",
      bullets: [
        "Free ops audit across both Portland locations",
        "Identify your 3 highest-impact automations",
        "Watch your actual data come alive on a real dashboard",
      ],
      type: "cta",
      layout: "centered",
      visual: "metrics-row",
      bg: "accent-gradient",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Investor Pitch Example — Sequoia arc (light mode, Willow-style)
   Scenario: Meridian AI pitching Series A investors
   ══════════════════════════════════════════════════════════════════ */

const investorPitchExample: ArchetypeExample = {
  archetype: "investor_pitch",
  title: "Investor Pitch",
  scenario: "Meridian AI pitching Series A — $8M raise for AI-native contract intelligence",
  defaultThemeKey: "simple-light",
  coverEyebrow: "Investor Deck",
  watermark: "Meridian",
  slides: [
    {
      title: "Meridian",
      subtitle: "**AI-native contract intelligence** for enterprise legal teams.",
      statLabel: "Series A · Raising $8M · March 2026",
      type: "cover",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    {
      title: "Legal Teams Are Buried in Contracts They Can't Read Fast Enough",
      subtitle:
        "The average Fortune 1000 company processes **20,000–40,000 contracts per year.** Each one reviewed manually — in Word, with tracked changes and email threads.",
      stat: "73%",
      statLabel: "of legal time on manual review",
      bullets: [
        "Missed clauses cost companies **$28M per incident** on average",
        "Existing CLM tools digitize the workflow — they don't understand the contracts",
        "AI-powered contract review has been a promise. Until now.",
      ],
      callout: "These are **primary blockers** to enterprise scale — and no existing tool addresses all three.",
      type: "tension",
      layout: "stat-left",
      visual: "none",
      bg: "light",
    },
    {
      title: "Meridian Reads Every Contract. In Seconds.",
      subtitle:
        "The first AI layer that sits between legal teams and their contract stack — **extracting clauses, scoring risk, and flagging anomalies in real time.**",
      bullets: [
        "**Instant extraction** → every clause, obligation, and deadline indexed on upload",
        "**Risk scoring** → every contract scored against your playbook automatically",
        "**Comparison engine** → deviations from standard terms flagged before you sign",
      ],
      callout: "The result: **legal reviews that take minutes, not days** — with cryptographic audit trails.",
      type: "data",
      layout: "split",
      visual: "metric-grid",
      bg: "light",
    },
    {
      title: "From Zero to $2.1M ARR in 18 Months",
      subtitle:
        "**47 enterprise customers.** Net revenue retention of **138%.** CAC payback in 4 months.",
      stat: "$2.1M",
      statLabel: "ARR · March 2026",
      bullets: [
        "340% year-over-year growth",
        "8 Fortune 500 customers signed in Q1 2026",
        "Average contract value $44K/year — expanding to $67K at 12 months",
      ],
      callout: "**NRR of 138%** means our existing customers are growing faster than we are adding new ones.",
      type: "proof",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "light-accent",
    },
    {
      title: "A $22B Market Waiting for Its AI Moment",
      subtitle:
        "The contract lifecycle management market is **$22B and growing at 14% CAGR** — but every existing solution was built before large language models existed.",
      bullets: [
        "**TAM $22B** — full legal tech and contract lifecycle market",
        "**SAM $4.8B** — mid-market and enterprise contract intelligence",
        "**SOM $620M** — our addressable segment over 36 months",
      ],
      callout: "The market didn't need AI — it needed AI that **actually understands legal language.**",
      type: "data",
      layout: "split",
      visual: "market-bars",
      bg: "light",
    },
    {
      title: "Every Competitor Solves Half the Problem",
      subtitle:
        "The CLM category digitizes contracts. AI add-ons add search. **None deliver real-time risk intelligence at enterprise scale.**",
      callout: "Meridian is the only platform with **end-to-end AI understanding** — from ingestion to signed risk report.",
      type: "data",
      layout: "split",
      visual: "dot-table",
      bg: "light",
    },
    {
      title: "Built by People Who Have Lived This Problem",
      subtitle:
        "Our founders spent a combined **40 years in enterprise legal, AI, and SaaS GTM** — and this isn't the first time we've scaled a category.",
      callout: "3 of 6 founders have **previously exited companies** in legal tech or enterprise SaaS.",
      type: "proof",
      layout: "split",
      visual: "team-grid",
      bg: "light",
    },
    {
      title: "Raising $8M to Own Enterprise Legal AI",
      subtitle: "18-month runway to $8M ARR, 120 enterprise customers, and **Series B readiness.**",
      bullets: [
        "**Engineering (40%)** — model fine-tuning, platform scaling, 6 new engineers",
        "**Sales & Marketing (30%)** — 4 AEs, 2 SDRs, legal conference presence",
        "**Infrastructure (20%)** — SOC 2 Type II, enterprise security, 99.9% SLA",
        "**G&A (10%)** — legal, finance, and operational overhead",
      ],
      callout: "At our current trajectory, this round gets Meridian to **$8M ARR and Series B territory** — with 18 months of runway to prove it.",
      type: "cta",
      layout: "split",
      visual: "fund-bars",
      bg: "light-accent",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Registry
   ══════════════════════════════════════════════════════════════════ */

export const archetypeExamples: Record<string, ArchetypeExample> = {
  cold_outreach: coldOutreachExample,
  investor_pitch: investorPitchExample,
};

/* ══════════════════════════════════════════════════════════════════
   Visual elements
   ══════════════════════════════════════════════════════════════════ */

function VisualElement({
  type,
  accent,
  theme = "dark",
}: {
  type: ExampleSlide["visual"];
  accent: string;
  theme?: "light" | "dark";
}) {
  if (type === "none" || !type) return null;
  const ptr = "pointer-events-none select-none";
  const isLight = theme === "light";

  /* ── Ambient glow orb (dark mode only) ── */
  if (type === "gradient-orb") {
    return (
      <>
        <div
          className={cn(ptr, "absolute right-0 bottom-0 size-64 rounded-full opacity-25 blur-[80px]")}
          style={{ background: accent }}
        />
        <div
          className={cn(ptr, "absolute left-[10%] top-[10%] size-40 rounded-full opacity-10 blur-[60px]")}
          style={{ background: accent }}
        />
      </>
    );
  }

  /* ── Bar chart (SVG — immune to flex height-resolution bugs) ── */
  if (type === "bar-chart") {
    const bars = [
      { label: "Jan", v: 38 },
      { label: "Feb", v: 52 },
      { label: "Mar", v: 48 },
      { label: "Apr", v: 67 },
      { label: "May", v: 62 },
      { label: "Jun", v: 83 },
      { label: "Jul", v: 100 },
    ];
    const CH = 52;
    const CW = 210;
    const bW = 22;
    const gap = 8;
    const startX = 4;
    const textFill = isLight ? "#374151" : "white";
    const textOpacity = isLight ? "0.6" : "0.45";

    return (
      <div className={cn(ptr, "w-full")}>
        <p
          className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}
        >
          Monthly ARR Growth
        </p>
        <svg viewBox={`0 0 ${CW} ${CH + 20}`} className="w-full" style={{ height: "auto", display: "block" }}>
          <line x1="0" y1={CH} x2={CW} y2={CH} stroke={textFill} strokeOpacity={isLight ? "0.15" : "0.12"} strokeWidth="0.75" />
          {bars.map((b, i) => {
            const barH = (b.v / 100) * CH;
            const x = startX + i * (bW + gap);
            const isLast = i === bars.length - 1;
            return (
              <g key={i}>
                <rect x={x} y={CH - barH} width={bW} height={barH} rx="2" fill={accent} fillOpacity={isLast ? 1 : 0.4} />
                <text x={x + bW / 2} y={CH + 13} textAnchor="middle" fill={textFill} fillOpacity={textOpacity} fontSize="8" fontFamily="system-ui, sans-serif">
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
        <p style={{ color: isLight ? "#9CA3AF" : "rgba(255,255,255,0.30)" }} className="mt-1 text-[9px] italic">
          Source: Internal CRM data, March 2026
        </p>
      </div>
    );
  }

  /* ── Line chart ── */
  if (type === "line-chart") {
    const CH = 58;
    const CW = 210;
    const pts: [number, number][] = [[8, 52], [60, 42], [112, 29], [164, 15], [202, 5]];
    const years = ["2022", "2023", "2024", "2025", "2026"];
    const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
    const fillD = `${pathD} L${pts[4][0]},${CH} L${pts[0][0]},${CH} Z`;
    const textFill = isLight ? "#374151" : "white";

    return (
      <div className={cn(ptr, "w-full")}>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>
          U.S. Gym Memberships (millions)
        </p>
        <svg viewBox={`0 0 ${CW} ${CH + 20}`} className="w-full" style={{ height: "auto", display: "block" }}>
          <line x1="0" y1={CH} x2={CW} y2={CH} stroke={textFill} strokeOpacity="0.12" strokeWidth="0.75" />
          <line x1="0" y1={CH * 0.5} x2={CW} y2={CH * 0.5} stroke={textFill} strokeOpacity="0.08" strokeWidth="0.5" strokeDasharray="4 4" />
          <path d={fillD} fill={accent} fillOpacity="0.14" />
          <path d={pathD} stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx={pts[4][0]} cy={pts[4][1]} r="3" fill={accent} />
          {pts.map((p, i) => (
            <text key={i} x={p[0]} y={CH + 13} textAnchor="middle" fill={textFill} fillOpacity="0.45" fontSize="8" fontFamily="system-ui, sans-serif">
              {years[i]}
            </text>
          ))}
          <text x={pts[4][0] + 5} y={pts[4][1] - 4} fill={accent} fontSize="9" fontWeight="bold" fontFamily="system-ui, sans-serif">83M</text>
        </svg>
        <p className="mt-1 text-[9px] italic" style={{ color: isLight ? "#9CA3AF" : "rgba(255,255,255,0.30)" }}>
          Source: IHRSA Global Report, 2026
        </p>
      </div>
    );
  }

  /* ── Churn member grid ── */
  if (type === "churn-grid") {
    return (
      <div className={cn(ptr, "w-full space-y-2.5")}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Of every 10 members…
        </p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const lost = i >= 5;
            return (
              <div
                key={i}
                className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: lost ? "rgba(239,68,68,0.18)" : `${accent}22`,
                  border: `1.5px ${lost ? "dashed" : "solid"} ${lost ? "rgba(239,68,68,0.40)" : `${accent}40`}`,
                }}
              >
                {lost
                  ? <UserX className="size-5" style={{ color: "rgba(239,68,68,0.85)" }} />
                  : <UserCheck className="size-5" style={{ color: accent }} />}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full" style={{ background: accent }} />
            <span className="text-[10px] text-white/50">Retained (5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-red-500/60" />
            <span className="text-[10px] text-white/50">Lost (5)</span>
          </div>
        </div>
        <p className="text-[9px] italic text-white/30">Source: IHRSA Retention Study, 2025</p>
      </div>
    );
  }

  /* ── Icon grid ── */
  if (type === "icon-grid") {
    const items = [
      { Icon: BarChart3, label: "Reports" },
      { Icon: Users, label: "Rosters" },
      { Icon: TrendingUp, label: "Revenue" },
      { Icon: Zap, label: "Payroll" },
    ];
    return (
      <div className={cn(ptr, "grid grid-cols-2 gap-2 w-full")}>
        {items.map(({ Icon, label }, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1.5 rounded-lg py-3"
            style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}
          >
            <Icon className="size-6" style={{ color: accent }} />
            <span className="text-[11px] font-medium text-white/55">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  /* ── Metrics row (dark mode solution slide) ── */
  if (type === "metrics-row") {
    const metrics = [
      { label: "Attendance", value: "94%", trend: "+12%" },
      { label: "Revenue", value: "$47K", trend: "+8%" },
      { label: "Utilization", value: "87%", trend: "+15%" },
    ];
    return (
      <div className={cn(ptr, "flex flex-col gap-2 w-full")}>
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
            <span className="text-[11px] font-medium text-white/55">{m.label}</span>
            <div className="flex items-center gap-2.5">
              <span className="text-[14px] font-bold text-white">{m.value}</span>
              <span className="text-[10px] font-semibold" style={{ color: accent }}>{m.trend}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ── Testimonial ── */
  if (type === "testimonial") {
    return (
      <div className={cn(ptr, "w-full space-y-3")}>
        <div className="rounded-xl px-5 py-4" style={{ background: `${accent}12`, borderTop: `3px solid ${accent}`, borderLeft: `1px solid ${accent}20`, borderRight: `1px solid ${accent}20`, borderBottom: `1px solid ${accent}20` }}>
          <div className="text-3xl font-light leading-none mb-2" style={{ color: `${accent}60` }}>&ldquo;</div>
          <p className="text-[13px] italic leading-relaxed text-white/75">
            ClearPath gave us the operational confidence to open our fourth location. We couldn&apos;t have scaled without it.
          </p>
          <p className="mt-3 text-[11px] font-semibold" style={{ color: accent }}>
            — Jamie Torres, COO · FitHub Co.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-4 py-2" style={{ background: `${accent}08`, border: `1px solid ${accent}15` }}>
          <span className="text-[18px] font-black" style={{ color: accent }}>31%</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">less churn in 90 days</span>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     ── NEW: Investor pitch visuals (light-mode optimised)
     ══════════════════════════════════════════════════════ */

  /* ── Metric grid (2×2 KPI tiles) ── */
  if (type === "metric-grid") {
    const tiles = [
      { label: "Net Revenue Retention", value: "138%", sub: "industry avg 108%" },
      { label: "Enterprise Customers", value: "47", sub: "added 12 in Q1 2026" },
      { label: "ARR Growth YoY", value: "+340%", sub: "last 12 months" },
      { label: "CAC Payback Period", value: "4 mo", sub: "industry avg 18 mo" },
    ];
    return (
      <div className={cn(ptr, "grid grid-cols-2 gap-2 w-full")}>
        {tiles.map((t, i) => (
          <div
            key={i}
            className="rounded-xl px-3 py-2.5"
            style={{
              background: isLight ? "white" : `${accent}10`,
              border: `1px solid ${isLight ? "#E5E7EB" : `${accent}25`}`,
            }}
          >
            <p className="text-[10px] font-medium" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>
              {t.label}
            </p>
            <p className="mt-0.5 text-[18px] font-black tracking-tight" style={{ color: i === 0 ? accent : isLight ? "#111827" : "white" }}>
              {t.value}
            </p>
            <p className="text-[9px]" style={{ color: isLight ? "#9CA3AF" : "rgba(255,255,255,0.30)" }}>
              {t.sub}
            </p>
          </div>
        ))}
      </div>
    );
  }

  /* ── Dot-table (feature comparison matrix) ── */
  if (type === "dot-table") {
    const features = [
      { name: "AI Extraction",       m: "g", c: "g",  ir: "y", k: "g"  },
      { name: "Risk Scoring",        m: "g", c: "y",  ir: "r", k: "r"  },
      { name: "Playbook Matching",   m: "g", c: "r",  ir: "y", k: "r"  },
      { name: "Clause Comparison",   m: "g", c: "y",  ir: "r", k: "y"  },
      { name: "API-first",           m: "g", c: "r",  ir: "y", k: "r"  },
      { name: "Real-time Analysis",  m: "g", c: "r",  ir: "r", k: "r"  },
      { name: "No-code Setup",       m: "g", c: "y",  ir: "g", k: "r"  },
    ];
    const dotColor: Record<string, string> = { g: "#16A34A", y: "#F59E0B", r: "#DC2626" };
    // SVG coordinate system
    const featureW = 100; // feature label column width
    const colW = 38;      // each company column width
    const rH = 22;        // row height
    const headerH = 24;   // header row height
    const CW = featureW + colW * 4 + 8; // 260
    const CH = headerH + features.length * rH + 20; // header + rows + legend
    const cols = [
      { label: "Meridian", cx: featureW + colW * 0.5 },
      { label: "CPodAi",   cx: featureW + colW * 1.5 },
      { label: "Ironclad", cx: featureW + colW * 2.5 },
      { label: "Kira",     cx: featureW + colW * 3.5 },
    ];
    const dots = (row: typeof features[0]) => [row.m, row.c, row.ir, row.k];

    return (
      <div className={cn(ptr, "w-full")}>
        <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: "auto", display: "block" }}>
          {/* Header row bg */}
          <rect x="0" y="0" width={CW} height={headerH} fill={isLight ? "#F3F4F6" : "rgba(255,255,255,0.05)"} rx="4" />
          {/* Meridian column highlight */}
          <rect x={featureW} y="0" width={colW} height={headerH + features.length * rH} fill={isLight ? "#DCFCE7" : `${accent}14`} rx="0" />
          {/* Column headers */}
          {cols.map((col, ci) => (
            <text
              key={ci}
              x={col.cx}
              y={headerH - 8}
              textAnchor="middle"
              fontSize="7.5"
              fontWeight={ci === 0 ? "700" : "500"}
              fill={ci === 0 ? accent : isLight ? "#374151" : "rgba(255,255,255,0.55)"}
              fontFamily="system-ui, sans-serif"
            >
              {col.label}
            </text>
          ))}
          {/* Feature rows */}
          {features.map((f, ri) => {
            const y = headerH + ri * rH;
            const isEven = ri % 2 === 0;
            return (
              <g key={ri}>
                {/* Alternate row tint */}
                <rect x="0" y={y} width={featureW} height={rH}
                  fill={isLight ? (isEven ? "#F9FAFB" : "white") : (isEven ? "rgba(255,255,255,0.02)" : "transparent")} />
                {/* Feature label */}
                <text x={4} y={y + rH / 2 + 3.5} fontSize="8" fill={isLight ? "#374151" : "rgba(255,255,255,0.65)"} fontFamily="system-ui, sans-serif">
                  {f.name}
                </text>
                {/* Dots */}
                {dots(f).map((d, di) => (
                  <circle key={di} cx={cols[di].cx} cy={y + rH / 2} r="5.5" fill={dotColor[d]} fillOpacity="0.9" />
                ))}
              </g>
            );
          })}
          {/* Divider */}
          <line x1="0" y1={headerH} x2={CW} y2={headerH} stroke={isLight ? "#E5E7EB" : "rgba(255,255,255,0.08)"} strokeWidth="0.5" />
          {/* Legend */}
          {[{ c: "#16A34A", l: "Yes" }, { c: "#F59E0B", l: "Partial" }, { c: "#DC2626", l: "No" }].map((leg, i) => (
            <g key={i}>
              <circle cx={8 + i * 50} cy={headerH + features.length * rH + 11} r="4" fill={leg.c} fillOpacity="0.9" />
              <text x={15 + i * 50} y={headerH + features.length * rH + 15} fontSize="7" fill={isLight ? "#6B7280" : "rgba(255,255,255,0.40)"} fontFamily="system-ui, sans-serif">
                {leg.l}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  /* ── Market bars (TAM / SAM / SOM) ── */
  if (type === "market-bars") {
    const bars = [
      { label: "TAM", value: "$22B", desc: "Full legal tech & CLM market", pct: 100 },
      { label: "SAM", value: "$4.8B", desc: "Enterprise contract intelligence", pct: 60 },
      { label: "SOM", value: "$620M", desc: "Addressable in 36 months", pct: 32 },
    ];
    return (
      <div className={cn(ptr, "w-full space-y-3")}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>
          Market sizing
        </p>
        {bars.map((b, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>{b.label}</span>
                <span className="text-[13px] font-black" style={{ color: i === 2 ? accent : isLight ? "#111827" : "white" }}>{b.value}</span>
              </div>
              <span className="text-[9px]" style={{ color: isLight ? "#9CA3AF" : "rgba(255,255,255,0.30)" }}>{b.desc}</span>
            </div>
            <div className="h-2 w-full rounded-full" style={{ background: isLight ? "#F3F4F6" : "rgba(255,255,255,0.07)" }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${b.pct}%`,
                  background: accent,
                  opacity: i === 0 ? 0.3 : i === 1 ? 0.55 : 1,
                }}
              />
            </div>
          </div>
        ))}
        <p className="text-[9px] italic" style={{ color: isLight ? "#9CA3AF" : "rgba(255,255,255,0.30)" }}>
          Source: Gartner CLM Market Report, 2025 · IDC AI Legal Tech Forecast
        </p>
      </div>
    );
  }

  /* ── Team grid ── */
  if (type === "team-grid") {
    const team = [
      { name: "Sarah Chen", title: "CEO", init: "SC", note: "Ex-GC at Salesforce · Stanford Law" },
      { name: "Marcus Williams", title: "CTO", init: "MW", note: "Ex-Google DeepMind · MIT CS" },
      { name: "Priya Nair", title: "CPO", init: "PN", note: "Built ContractPodAi's core AI" },
      { name: "David Park", title: "VP Sales", init: "DP", note: "$0→$20M ARR at LegalZoom Ent." },
      { name: "Aiko Tanaka", title: "Head of Research", init: "AT", note: "Ex-OpenAI · NLP & legal domain" },
      { name: "James Okafor", title: "CFO", init: "JO", note: "Scaled 3 SaaS cos to IPO" },
    ];
    return (
      <div className={cn(ptr, "grid grid-cols-2 gap-x-3 gap-y-2.5 w-full")}>
        {team.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: accent }}
            >
              {p.init}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-none" style={{ color: isLight ? "#111827" : "white" }}>
                {p.name}
              </p>
              <p className="text-[9px] font-semibold mt-0.5" style={{ color: accent }}>{p.title}</p>
              <p className="text-[9px] leading-tight mt-0.5" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>
                {p.note}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ── Fund bars (use-of-funds allocation) ── */
  if (type === "fund-bars") {
    const segments = [
      { label: "Engineering", pct: 40, opacity: 1 },
      { label: "Sales & Mktg", pct: 30, opacity: 0.7 },
      { label: "Infrastructure", pct: 20, opacity: 0.5 },
      { label: "G&A", pct: 10, opacity: 0.3 },
    ];
    return (
      <div className={cn(ptr, "w-full space-y-3")}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.45)" }}>
          $8M Use of Funds
        </p>
        {/* Segmented bar */}
        <div className="flex h-5 w-full overflow-hidden rounded-full">
          {segments.map((s, i) => (
            <div key={i} className="h-full" style={{ width: `${s.pct}%`, background: accent, opacity: s.opacity }} />
          ))}
        </div>
        {/* Labels */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="size-2 rounded-full flex-shrink-0" style={{ background: accent, opacity: s.opacity }} />
              <span className="text-[10px]" style={{ color: isLight ? "#374151" : "rgba(255,255,255,0.65)" }}>
                <strong>{s.label}</strong> {s.pct}%
              </span>
            </div>
          ))}
        </div>
        <div
          className="mt-1 rounded-lg px-3 py-2"
          style={{ background: isLight ? "white" : `${accent}10`, border: `1px solid ${isLight ? "#E5E7EB" : `${accent}25`}` }}
        >
          <p className="text-[10px]" style={{ color: isLight ? "#374151" : "rgba(255,255,255,0.60)" }}>
            Target: <strong style={{ color: accent }}>$8M ARR</strong> · 120 customers · Series B ready by Q1 2028
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════════
   Slide backgrounds
   ══════════════════════════════════════════════════════════════════ */

function getSlideBg(bg: ExampleSlide["bg"], theme: AlaiPreviewTheme): React.CSSProperties {
  const { accent, accentSoft, family, surface, surfaceAlt, surfaceGlow } = theme;

  if (family === "light") {
    switch (bg) {
      case "accent-gradient":
        return {
          background: `radial-gradient(circle at 82% 22%, ${surfaceGlow} 0%, transparent 34%), linear-gradient(140deg, ${surface} 0%, ${surfaceAlt} 52%, #FFFFFF 100%)`,
        };
      case "dark-mesh":
        return {
          background: `radial-gradient(circle at 18% 28%, ${surfaceGlow} 0%, transparent 38%), radial-gradient(circle at 82% 18%, ${accentSoft}20 0%, transparent 32%), ${surface}`,
        };
      case "subtle":
        return { background: `linear-gradient(180deg, ${surface} 0%, ${surfaceAlt} 100%)` };
      case "light-accent":
        return { background: `linear-gradient(180deg, ${surfaceAlt} 0%, #FFFFFF 100%)` };
      case "light":
      case "dark":
      default:
        return { background: surface };
    }
  }

  switch (bg) {
    case "light":
    case "light-accent":
      return {
        background: `linear-gradient(180deg, ${surfaceAlt} 0%, ${surface} 100%)`,
      };
    case "accent-gradient":
      return {
        background: `radial-gradient(ellipse at 80% 70%, ${accentSoft}24 0%, transparent 54%), linear-gradient(135deg, ${surface} 0%, ${surfaceAlt} 100%)`,
      };
    case "dark-mesh":
      return {
        background: `radial-gradient(ellipse at 24% 55%, ${surfaceGlow} 0%, transparent 55%), radial-gradient(ellipse at 76% 20%, ${accentSoft}18 0%, transparent 48%), ${surface}`,
      };
    case "subtle":
      return { background: surfaceAlt };
    case "dark":
    default:
      return { background: surface };
  }
}

/* ══════════════════════════════════════════════════════════════════
   Slide renderer
   ══════════════════════════════════════════════════════════════════ */

function SlidePreview({
  slide,
  theme,
  watermark,
  coverEyebrow,
  coverFooter,
}: {
  slide: ExampleSlide;
  theme: AlaiPreviewTheme;
  watermark?: string;
  coverEyebrow?: string;
  coverFooter?: string;
}) {
  const bgStyle = getSlideBg(slide.bg, theme);
  const surfaceTheme = getSurfaceTheme(theme);
  const isLight = surfaceTheme === "light";
  const accent = theme.accent;

  // Theme-derived text classes
  const headingCls = isLight ? "text-gray-900" : "text-white";
  const subtitleCls = isLight ? "text-gray-600" : "text-white/55";
  const bulletCls = isLight ? "text-gray-700" : "text-white/65";
  const mutedCls = isLight ? "text-gray-400" : "text-white/35";
  const dividerCls = isLight ? "border-gray-200" : "border-white/[0.06]";

  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden rounded-xl shadow-2xl"
      style={bgStyle}
    >
      {/* Dark mode dot-grid texture */}
      {!isLight && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
      )}
      {/* Light mode subtle grid */}
      {isLight && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "linear-gradient(#9CA3AF 1px, transparent 1px), linear-gradient(90deg, #9CA3AF 1px, transparent 1px)", backgroundSize: "40px 40px" }}
        />
      )}

      {/* Slide type pill — top left */}
      <span
        className={cn(
          "absolute left-4 top-3.5 z-20 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]",
          isLight ? "bg-gray-100 text-gray-500 border border-gray-200" : ""
        )}
        style={isLight ? {} : { color: accent, background: `${accent}18`, border: `1px solid ${accent}28` }}
      >
        {slide.type}
      </span>

      {/* Watermark — bottom right */}
      {watermark && (
        <div className="absolute bottom-3.5 right-4 z-20 flex items-center gap-1.5">
          <div className="size-2 rounded-sm" style={{ background: accent }} />
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: isLight ? "#6B7280" : "rgba(255,255,255,0.25)" }}
          >
            {watermark}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex h-full">

        {/* ─── CENTERED ─── */}
        {slide.layout === "centered" && (
          <div className="flex h-full w-full flex-col items-center justify-center px-12 text-center sm:px-20">
            <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />

            {slide.type === "cover" ? (
              /* ── Cover slide ── */
              isLight ? (
                /* Light-mode investor pitch cover */
                <>
                  {/* Geometric accent shapes — Willow-style structural decoration */}
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      width: 320, height: 420, right: -60, bottom: -80,
                      borderRadius: 24, transform: "rotate(14deg)",
                      background: accent, opacity: 0.045,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      width: 180, height: 180, left: -40, top: -50,
                      borderRadius: 16, transform: "rotate(-8deg)",
                      background: accent, opacity: 0.03,
                    }}
                  />
                  <div className="mb-4 flex items-center gap-2">
                    <div className="size-2.5 rounded-sm" style={{ background: accent }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                      {coverEyebrow ?? "Deck Preview"}
                    </span>
                  </div>
                  <h1 className="text-5xl font-black tracking-tight text-gray-900 sm:text-7xl">
                    {slide.title}
                  </h1>
                  {slide.subtitle && (
                    <p className="mt-3 max-w-md text-base text-gray-600 leading-relaxed">
                      {renderHighlight(slide.subtitle, accent)}
                    </p>
                  )}
                  {slide.statLabel && (
                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>
                      {slide.statLabel}
                    </p>
                  )}
                  {!slide.statLabel && coverFooter && (
                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>
                      {coverFooter}
                    </p>
                  )}
                </>
              ) : (
                /* Dark-mode cold outreach cover */
                <>
                  <div
                    className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                    style={{ background: `${accent}14`, border: `1px solid ${accent}28`, color: accent }}
                  >
                    <div className="size-1.5 rounded-full" style={{ background: accent }} />
                    {coverEyebrow ?? "Deck Preview"}
                  </div>
                  <h3 className="text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-[2.75rem]">
                    {slide.title}
                  </h3>
                  {slide.subtitle && (
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
                      {slide.subtitle}
                    </p>
                  )}
                  {coverFooter && (
                    <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                      {coverFooter}
                    </p>
                  )}
                </>
              )
            ) : (
              /* ── Non-cover slides ── */
              <>
                {slide.stat && (
                  <p className="mb-1 text-6xl font-black tracking-tighter sm:text-8xl" style={{ color: accent }}>
                    {slide.stat}
                  </p>
                )}
                <h3 className={cn("font-black tracking-tight text-2xl leading-tight sm:text-4xl", headingCls)}>
                  {slide.title}
                </h3>
                {slide.subtitle && (
                  <p className={cn("mt-3 max-w-lg text-sm leading-relaxed sm:text-base", subtitleCls)}>
                    {renderHighlight(slide.subtitle, accent)}
                  </p>
                )}
                {slide.bullets && (
                  <ul className="mt-4 space-y-2 text-left">
                    {slide.bullets.map((b, i) => (
                      <li key={i} className={cn("flex items-start gap-2.5 text-sm", bulletCls)}>
                        <ArrowRight className="size-3 mt-0.5 shrink-0" style={{ color: accent }} />
                        {renderHighlight(b, accent)}
                      </li>
                    ))}
                  </ul>
                )}
                {slide.type === "cta" && (
                  <div
                    className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                    style={{ background: accent }}
                  >
                    {isLight ? "Book an Investor Call" : "Book a Free Ops Audit"}
                    <ArrowRight className="size-3.5" />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── STAT-LEFT ─── */}
        {slide.layout === "stat-left" && (
          <>
            {/* Left: stat only */}
            <div className={cn("flex w-[38%] flex-col items-center justify-center border-r px-6 sm:px-8", dividerCls)}>
              {slide.stat && (
                <div className="text-center">
                  <p className="text-5xl font-black tracking-tighter sm:text-6xl" style={{ color: accent }}>
                    {slide.stat}
                  </p>
                  {slide.statLabel && (
                    <p className={cn("mt-2 text-[10px] font-semibold uppercase tracking-widest", mutedCls)}>
                      {slide.statLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* Right: content + visual + callout */}
            <div className="flex w-[62%] flex-col justify-start pt-6 pb-4 px-6 sm:px-9 sm:pt-8 sm:pb-6">
              <h3 className={cn("text-lg font-bold leading-tight tracking-tight whitespace-pre-line sm:text-xl", headingCls)}>
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className={cn("mt-2 text-[12px] leading-relaxed", subtitleCls)}>
                  {renderHighlight(slide.subtitle, accent)}
                </p>
              )}
              {slide.bullets && (
                <ul className="mt-2.5 space-y-1.5">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className={cn("flex items-start gap-2 text-[11px] leading-relaxed", bulletCls)}>
                      <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {renderHighlight(b, accent)}
                    </li>
                  ))}
                </ul>
              )}
              {slide.callout && (
                <div
                  className="mt-3 rounded-r-lg border-l-2 px-3 py-2"
                  style={{
                    borderColor: accent,
                    background: isLight ? `${accent}08` : `${accent}10`,
                  }}
                >
                  <p className={cn("text-[11px] leading-relaxed", isLight ? "text-gray-700" : "text-white/60")}>
                    {renderHighlight(slide.callout, accent)}
                  </p>
                </div>
              )}
              {slide.visual && slide.visual !== "none" && (
                <div className="mt-2">
                  <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── SPLIT ─── */}
        {slide.layout === "split" && (
          <>
            <div className="flex w-[48%] flex-col justify-start pt-7 pb-5 px-6 sm:px-9 sm:pt-9 sm:pb-6">
              <h3 className={cn("text-lg font-bold leading-tight tracking-tight whitespace-pre-line sm:text-xl", headingCls)}>
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className={cn("mt-2 text-[12px] leading-relaxed", subtitleCls)}>
                  {renderHighlight(slide.subtitle, accent)}
                </p>
              )}
              {slide.bullets && (
                <ul className="mt-3 space-y-2">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className={cn("flex items-start gap-2 text-[11px] leading-relaxed", bulletCls)}>
                      <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {renderHighlight(b, accent)}
                    </li>
                  ))}
                </ul>
              )}
              {slide.callout && (
                <div
                  className="mt-3 rounded-r-lg border-l-2 px-3 py-2"
                  style={{ borderColor: accent, background: isLight ? `${accent}08` : `${accent}10` }}
                >
                  <p className={cn("text-[11px] leading-relaxed", isLight ? "text-gray-700" : "text-white/60")}>
                    {renderHighlight(slide.callout, accent)}
                  </p>
                </div>
              )}
            </div>
            <div className={cn("flex w-[52%] flex-col items-start justify-center border-l px-5 sm:px-7", dividerCls)}>
              <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />
            </div>
          </>
        )}

        {/* ─── ICON-LIST ─── */}
        {slide.layout === "icon-list" && (
          <div className="flex h-full w-full flex-col justify-center px-8 py-8 sm:px-12">
            <div className="flex items-start gap-6">
              <div className="flex-1">
                <h3 className={cn("text-xl font-bold leading-snug tracking-tight sm:text-2xl", headingCls)}>
                  {slide.title}
                </h3>
                {slide.bullets && (
                  <ul className="mt-4 space-y-3.5">
                    {slide.bullets.map((b, i) => {
                      const icons = [TrendingUp, Users, BarChart3];
                      const Icon = icons[i % icons.length];
                      return (
                        <li key={i} className="flex items-start gap-3">
                          <div
                            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: isLight ? `${accent}12` : `${accent}14` }}
                          >
                            <Icon className="size-3.5" style={{ color: accent }} />
                          </div>
                          <span className={cn("text-[13px] leading-relaxed", bulletCls)}>
                            {renderHighlight(b, accent)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex w-2/5 shrink-0 flex-col items-end">
                <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />
              </div>
            </div>
          </div>
        )}

        {/* ─── QUOTE ─── */}
        {slide.layout === "quote" && (
          <div className="flex h-full w-full flex-col items-center justify-center px-12 text-center sm:px-20">
            <div className="mb-3 text-4xl font-light" style={{ color: `${accent}55` }}>"</div>
            <h3 className={cn("text-lg font-medium leading-relaxed tracking-tight sm:text-xl", isLight ? "text-gray-800" : "text-white/85")}>
              {slide.title}
            </h3>
            {slide.subtitle && (
              <p className="mt-3 text-sm font-semibold" style={{ color: accent }}>{slide.subtitle}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Lightbox modal
   ══════════════════════════════════════════════════════════════════ */

interface ArchetypePreviewModalProps {
  archetype: string;
  open: boolean;
  onClose: () => void;
}

interface AlaiThemeCatalogResponse {
  source?: "alai" | "fallback";
  themes?: AlaiPreviewTheme[];
}

export function ArchetypePreviewModal({ archetype, open, onClose }: ArchetypePreviewModalProps) {
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [direction, setDirection] = React.useState<"left" | "right">("right");
  const [availableThemes, setAvailableThemes] = React.useState(alaiPreviewThemes);
  const [themeSource, setThemeSource] = React.useState<"loading" | "alai" | "fallback">("fallback");
  const example = archetypeExamples[archetype];

  React.useEffect(() => {
    if (!open || !example) return;
    setCurrentSlide(0);
    setDirection("right");
  }, [open, archetype, example]);

  const [selectedThemeKey, setSelectedThemeKey] = React.useState(
    example?.defaultThemeKey ?? alaiPreviewThemes[0]!.key,
  );

  React.useEffect(() => {
    if (!open || !example) return;
    setSelectedThemeKey(example.defaultThemeKey ?? alaiPreviewThemes[0]!.key);
  }, [open, archetype, example]);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setThemeSource("loading");

    void fetch("/api/alai/themes", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<AlaiThemeCatalogResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted || !Array.isArray(payload.themes) || payload.themes.length === 0) {
          return;
        }
        setAvailableThemes(payload.themes);
        setThemeSource(payload.source === "alai" ? "alai" : "fallback");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAvailableThemes(alaiPreviewThemes);
        setThemeSource("fallback");
      });

    return () => controller.abort();
  }, [open]);

  React.useEffect(() => {
    if (!availableThemes.some((theme) => theme.key === selectedThemeKey)) {
      setSelectedThemeKey(example?.defaultThemeKey ?? availableThemes[0]?.key ?? alaiPreviewThemes[0]!.key);
    }
  }, [availableThemes, selectedThemeKey, example]);

  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (example && currentSlide < example.slides.length - 1) {
          setDirection("right");
          setCurrentSlide((s) => s + 1);
        }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentSlide > 0) {
          setDirection("left");
          setCurrentSlide((s) => s - 1);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, example, currentSlide]);

  if (!example) return null;

  const total = example.slides.length;
  const selectedTheme = availableThemes.find((theme) => theme.key === selectedThemeKey)
    ?? getAlaiPreviewTheme(example.defaultThemeKey);
  const accent = selectedTheme.accent;
  const themeStatusLabel = themeSource === "alai"
    ? "Live themes"
    : "Themes";

  function goNext() {
    if (currentSlide < total - 1) { setDirection("right"); setCurrentSlide((s) => s + 1); }
  }
  function goPrev() {
    if (currentSlide > 0) { setDirection("left"); setCurrentSlide((s) => s - 1); }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-5xl -translate-x-[50%] -translate-y-[50%] px-4 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">
            {example.title} quick preview
          </DialogPrimitive.Title>
          <div className="mb-4 rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_28px_120px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <div className="size-2 rounded-full" style={{ background: accent }} />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Quick preview
                  </p>
                </div>
                <p className="mt-2 text-lg font-semibold text-white">{example.title}</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/55">{example.scenario}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-white/38">
                  Deck arc stays fixed. Switch themes to compare treatment without leaving the archetype flow.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/55">
                  {themeStatusLabel}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-[11px] font-medium tabular-nums text-white/55">
                  {currentSlide + 1} / {total}
                </span>
                <DialogPrimitive.Close
                  className="flex size-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-white/55 transition-colors hover:bg-white/[0.12] hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </DialogPrimitive.Close>
              </div>
            </div>

          </div>

          {/* Horizontal split: slide preview (left) + sidebar (right) */}
          <div className="mt-4 flex gap-4">
            {/* Left: slide preview + navigation + slide thumbnails */}
            <div className="min-w-0 flex-1 flex flex-col gap-3">
              {/* Slide */}
              <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#05070B] p-3 shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
                <div
                  className="pointer-events-none absolute inset-0 opacity-90"
                  style={{
                    background: `radial-gradient(circle at top right, ${selectedTheme.surfaceGlow} 0%, transparent 34%), radial-gradient(circle at bottom left, ${selectedTheme.accent}18 0%, transparent 28%)`,
                  }}
                />
                <div key={currentSlide} className={cn("relative", direction === "right" ? "animate-slide-in-right" : "animate-slide-in-left")}>
                  <SlidePreview
                    slide={example.slides[currentSlide]}
                    theme={selectedTheme}
                    watermark={example.watermark}
                    coverEyebrow={example.coverEyebrow}
                    coverFooter={example.coverFooter}
                  />
                </div>
                <button onClick={goPrev} disabled={currentSlide === 0} className="absolute bottom-0 left-0 top-0 w-[18%] cursor-w-resize opacity-0 disabled:cursor-default" aria-label="Previous slide" />
                <button onClick={goNext} disabled={currentSlide === total - 1} className="absolute bottom-0 right-0 top-0 w-[18%] cursor-e-resize opacity-0 disabled:cursor-default" aria-label="Next slide" />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-1 pr-4">
                  {example.slides.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setDirection(i > currentSlide ? "right" : "left"); setCurrentSlide(i); }}
                      className="group relative h-1 flex-1 rounded-full transition-colors"
                      style={{ background: i <= currentSlide ? accent : `${accent}22` }}
                      aria-label={`Go to slide ${i + 1}: ${s.type}`}
                    >
                      <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[9px] capitalize text-white/65 opacity-0 transition-opacity group-hover:opacity-100">
                        {s.type}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={goPrev} disabled={currentSlide === 0} className="flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-white/55 transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-default disabled:opacity-25">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button onClick={goNext} disabled={currentSlide === total - 1} className="flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-white/55 transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-default disabled:opacity-25">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              {/* Slide thumbnails — horizontal scrollable row */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {example.slides.map((slide, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setDirection(i > currentSlide ? "right" : "left"); setCurrentSlide(i); }}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
                      currentSlide === i
                        ? "border-white/[0.14] bg-white/[0.08]"
                        : "border-white/[0.06] bg-black/[0.16] hover:border-white/[0.12] hover:bg-white/[0.05]",
                    )}
                  >
                    <span className={cn(
                      "flex size-5 items-center justify-center rounded text-[10px] font-bold",
                      currentSlide === i ? "bg-white/[0.12] text-white" : "bg-white/[0.06] text-white/40",
                    )}>
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-medium text-white/60 whitespace-nowrap">
                      {slide.type.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: themes only */}
            <div className="w-[260px] shrink-0 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(80vh - 120px)" }}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Themes</p>

              <div className="flex flex-col gap-2">
                {availableThemes.map((theme) => {
                  const selected = theme.key === selectedTheme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => setSelectedThemeKey(theme.key)}
                      className={cn(
                        "w-full rounded-2xl border px-3.5 py-3 text-left transition-all",
                        selected
                          ? "border-white/[0.14] bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : "border-white/[0.06] bg-black/[0.16] hover:border-white/[0.12] hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ background: theme.accent }} />
                        <span
                          className="h-2 w-7 rounded-full"
                          style={{ background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.accentSoft} 100%)` }}
                        />
                        <span
                          className={cn(
                            "ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                            theme.family === "light"
                              ? "bg-white text-slate-700"
                              : "bg-white/[0.08] text-white/55",
                          )}
                        >
                          {theme.family}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{theme.name}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/45">{theme.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
