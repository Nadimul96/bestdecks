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
  type: "cover" | "tension" | "data" | "vision" | "solution" | "proof" | "cta" | "contact";
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
    // ── Slide 1: Cover — hook with curiosity + personalization ──
    {
      title: "NxGen Is Growing.\nYour Back Office Isn't.",
      subtitle: "We analyzed your locations, class schedule, and online reviews. Here's what we'd fix first.",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    // ── Slide 2: Tension — name the problem better than they can ──
    {
      title: "400 Members. 14 Trainers.\n2 Spreadsheets.",
      subtitle:
        "Your SE location tracks check-ins on paper. NW uses Google Forms. Your staff wastes Monday mornings stitching it together.",
      stat: "4 hrs",
      statLabel: "lost every Monday to manual reporting",
      bullets: [
        "Trainer schedules live in 3 calendars — conflicts show up as empty rooms",
        "No single view of revenue, attendance, or payroll across locations",
        "Gyms that fix this grow 2.3× faster (IHRSA 2026)",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    // ── Slide 3: Data — $240K is the headline, reframe in subtitle ──
    {
      title: "$240K/Year Lost\nto Members You Can't See Leaving",
      subtitle:
        "Replacing each one costs 5–7× more than catching them before they quit. Right now, NxGen has no early warning system.",
      stat: "$240K",
      statLabel: "annual cost of invisible churn",
      bullets: [
        "Members who miss 2 weeks are 4× more likely to cancel",
        "By the cancellation email, they mentally left 3 weeks ago",
        "Industry average: 50% six-month churn. Detection drops it to 28%",
      ],
      type: "data",
      layout: "split",
      visual: "churn-grid",
      bg: "subtle",
    },
    // ── Slide 4: Vision — what Monday morning looks like AFTER ──
    {
      title: "Imagine Opening One Screen\nand Seeing Both Gyms.",
      subtitle:
        "Every check-in, every class, every dollar — live. No stitching spreadsheets. No calling the other location. Just answers.",
      stat: "100%",
      statLabel: "visibility across both Portland locations",
      type: "vision",
      layout: "centered",
      visual: "gradient-orb",
      bg: "accent-gradient",
    },
    // ── Slide 5: Solution — outcome first, mechanism second ──
    {
      title: "You Get 15 Hours Back.\nEvery Single Week.",
      subtitle:
        "ClearPath replaces the patchwork. Attendance, revenue, scheduling, payroll — one place, day one.",
      stat: "15 hrs",
      statLabel: "saved per week across both locations",
      bullets: [
        "Revenue by location, live — no more Monday morning data marathons",
        "Trainer conflicts flagged 48 hours before they hit members",
        "Month-end close: 2 days → 20 minutes",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "metrics-row",
      bg: "dark",
    },
    // ── Slide 6: Solution — conviction, not hedging ──
    {
      title: "Stop Reacting to Cancellations.\nStart Predicting Them.",
      subtitle:
        "You'll see 23% lower monthly churn within 90 days. Here's how it works.",
      stat: "23%",
      statLabel: "lower monthly churn in 90 days",
      bullets: [
        "Members missing 2+ sessions get flagged — alerts go to their trainer",
        "Win-back sequences fire automatically based on behavior, not guesswork",
        "Monthly churn reports by location, class, and trainer — root causes exposed",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "icon-grid",
      bg: "dark-mesh",
    },
    // ── Slide 7: Proof — mirror, not press release ──
    {
      title: "FitHub Had the Same Problem.\nThey Opened Location #4 in 90 Days.",
      subtitle:
        "\"We went from Sunday-night spreadsheet panic to knowing every number before coffee.\" — Jamie R., FitHub Ops Lead",
      stat: "31%",
      statLabel: "less churn in 90 days",
      bullets: [
        "Churn: 8.2% → 5.6% across all locations",
        "18 staff-hours recovered per week",
        "Opened location #4 with zero new admin hires",
      ],
      type: "proof",
      layout: "split",
      visual: "testimonial",
      bg: "subtle",
    },
    // ── Slide 8: CTA — one ask, no hedging ──
    {
      title: "15 Minutes. Your Locations.\nA Live Dashboard.",
      subtitle:
        "We'll pull NxGen's real data into a working dashboard while you watch. No contracts. No commitment. Just clarity.",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    // ── Slide 9: Contact — closing slide ──
    {
      title: "ClearPath AI",
      subtitle: "Operations intelligence for multi-location fitness brands.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
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
    // ── Slide 1: Cover — name + one-liner + proof point ──
    {
      title: "Meridian",
      subtitle: "**AI-native contract intelligence** for enterprise legal teams.",
      statLabel: "$2.1M ARR · 138% NRR · Series A",
      type: "cover",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    // ── Slide 2: Problem — one pain, quantified ──
    {
      title: "73% of Legal Time Is Spent\nReading Contracts Manually",
      subtitle:
        "Fortune 1000 companies process 20,000+ contracts per year. Each one reviewed in Word, with tracked changes and email threads.",
      stat: "73%",
      statLabel: "of legal time on manual review",
      bullets: [
        "Missed clauses cost **$28M per incident** on average",
        "CLM tools digitize the workflow — they don't understand the contracts",
        "One bad clause in one deal can wipe out an entire quarter",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "none",
      bg: "light",
    },
    // ── Slide 3: Traction — front-loaded, the money slide ──
    {
      title: "$2.1M ARR. 47 Customers.\n340% YoY Growth.",
      subtitle:
        "18 months from first line of code to enterprise traction. The product sells itself — our customers expand faster than we can acquire.",
      stat: "$2.1M",
      statLabel: "ARR · March 2026",
      bullets: [
        "**138% net revenue retention** — customers expand 38% in year one",
        "**8 Fortune 500** logos signed in Q1 2026 alone",
        "**$44K ACV** expanding to $67K at 12 months — 52% net expansion",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "light-accent",
    },
    // ── Slide 4: Solution — show the product, not features ──
    {
      title: "Upload a Contract.\nGet a Risk Report in 90 Seconds.",
      subtitle:
        "Meridian reads, extracts, scores, and compares every clause against your playbook — automatically.",
      bullets: [
        "Every clause, obligation, and deadline indexed on upload",
        "Risk scored against your legal playbook — deviations flagged instantly",
        "Reviews that took 4 hours now take 90 seconds with full audit trail",
      ],
      type: "data",
      layout: "split",
      visual: "metric-grid",
      bg: "light",
    },
    // ── Slide 5: Why Now? — the unlock ──
    {
      title: "This Company Was Impossible\n2 Years Ago.",
      subtitle:
        "Three shifts converged in 2024–2025 that made AI contract intelligence viable at enterprise scale for the first time.",
      bullets: [
        "**LLM context windows** hit 128K tokens — a full contract fits in one pass",
        "**Fine-tuning costs** dropped 90% — domain-specific legal AI is now affordable",
        "**Enterprise AI budgets** tripled — legal teams have buy-in to adopt",
      ],
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "light-accent",
    },
    // ── Slide 6: Market — bottom-up, not Gartner ──
    {
      title: "$4.8B Addressable.\nGrowing 14% Per Year.",
      subtitle:
        "The $22B legal tech market was built before LLMs existed. Every incumbent is retrofitting AI. We're built on it.",
      bullets: [
        "**TAM $22B** — global legal tech and contract lifecycle",
        "**SAM $4.8B** — mid-market + enterprise contract intelligence",
        "**SOM $620M** — our segment over 36 months",
      ],
      type: "data",
      layout: "split",
      visual: "market-bars",
      bg: "light",
    },
    // ── Slide 7: Business Model — how we make money ──
    {
      title: "$44K ACV. 4-Month Payback.\n80% Gross Margins.",
      subtitle:
        "Land with legal ops, expand to procurement and compliance. Every department that touches a contract is a new seat.",
      stat: "4 mo",
      statLabel: "CAC payback period",
      bullets: [
        "Per-seat pricing with volume tiers — $800–1,200/user/month",
        "**LTV:CAC of 8.2x** — best-in-class for enterprise SaaS",
        "3 expansion vectors: seats, departments, contract volume",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "none",
      bg: "light",
    },
    // ── Slide 8: Competition — different category ──
    {
      title: "Every Competitor\nSolves Half the Problem.",
      subtitle:
        "CLM tools digitize workflows. AI add-ons add search. None deliver real-time risk intelligence at enterprise scale.",
      callout: "Meridian is the only platform built on AI from day one — not bolted on after.",
      type: "data",
      layout: "split",
      visual: "dot-table",
      bg: "light",
    },
    // ── Slide 9: Team — names and credentials ──
    {
      title: "3 Exits. 40 Years in Legal Tech.\nThis Isn't Our First Time.",
      subtitle:
        "The founding team built and sold two legal SaaS companies before starting Meridian. We know this market because we've lived in it.",
      callout: "Backed by Sequoia Scout, First Round Capital, and angels from Ironclad, DocuSign, and Relativity.",
      type: "proof",
      layout: "split",
      visual: "team-grid",
      bg: "light",
    },
    // ── Slide 10: The Ask — surgical ──
    {
      title: "Raising $8M to Hit\n$8M ARR by Q4 2027.",
      subtitle:
        "18-month runway. Clear milestones. Series B readiness by month 14.",
      bullets: [
        "**Engineering (40%)** — model fine-tuning, 6 new engineers, SOC 2 Type II",
        "**Go-to-Market (35%)** — 4 AEs, 2 SDRs, legal conference presence",
        "**Infrastructure (25%)** — enterprise security, 99.9% SLA, EU expansion",
      ],
      type: "cta",
      layout: "split",
      visual: "fund-bars",
      bg: "light-accent",
    },
    // ── Slide 11: Contact ──
    {
      title: "Meridian",
      subtitle: "AI-native contract intelligence for enterprise legal teams.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Warm Intro Example — Bridgepoint Analytics → DTC brand
   ══════════════════════════════════════════════════════════════════ */

const warmIntroExample: ArchetypeExample = {
  archetype: "warm_intro",
  title: "Warm Intro",
  scenario: "Bridgepoint Analytics pitching Luma Home — introduced by shared board advisor",
  defaultThemeKey: "simple-dark",
  coverEyebrow: "Luma Home · Denver, CO",
  coverFooter: "BRIDGEPOINT ANALYTICS",
  slides: [
    {
      title: "Sarah Chen Thought\nWe Should Talk.",
      subtitle: "She mentioned you're rebuilding your demand forecasting stack after expanding to 500+ SKUs. We've helped 3 brands navigate that exact transition.",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    {
      title: "What We Noticed\nAbout Luma's Growth",
      subtitle: "You've 4×'d your SKU count in 18 months. Your Shopify reviews mention inconsistent shipping times — a classic signal that forecasting hasn't kept up with catalog expansion.",
      stat: "4×",
      statLabel: "SKU growth in 18 months",
      bullets: [
        "12 new product lines since Q3 2025 — fastest catalog expansion in DTC home",
        "Shipping complaints up 34% in the last 90 days (Trustpilot data)",
        "Your competitor AllHaus solved the same problem at this exact stage",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    {
      title: "The Pattern:\nCatalog Grows, Forecasting Breaks.",
      subtitle: "Every DTC brand that scales past 200 SKUs hits the same wall — demand planning tools built for 50 products can't handle 500.",
      bullets: [
        "Overstock on slow movers locks up $200K+ in working capital",
        "Stockouts on top sellers cost 2-3× the margin of the lost sale",
        "Manual forecasting takes 15+ hours/week at your current catalog size",
      ],
      type: "data",
      layout: "split",
      visual: "churn-grid",
      bg: "subtle",
    },
    {
      title: "AllHaus Had the Same Problem.\nThey Fixed It in 6 Weeks.",
      subtitle: "450-SKU DTC brand. Same growth stage. We deployed predictive inventory and they recaptured $1.2M in working capital within one quarter.",
      stat: "$1.2M",
      statLabel: "working capital recovered in 90 days",
      bullets: [
        "Stockouts dropped 71% in the first 60 days",
        "Overstock reduced by $340K — freed up warehouse space for new lines",
        "Forecast accuracy jumped from 62% to 91%",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "metrics-row",
      bg: "dark",
    },
    {
      title: "What Working Together\nLooks Like for Luma",
      subtitle: "A focused 6-week engagement. We connect to your Shopify and warehouse data, build a predictive model, and hand you a live dashboard.",
      bullets: [
        "Week 1-2: Data integration + baseline forecast accuracy audit",
        "Week 3-4: Custom model trained on Luma's sales patterns",
        "Week 5-6: Live dashboard deployed — your team owns it from day one",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "icon-grid",
      bg: "dark-mesh",
    },
    {
      title: "One Ask:\nLet Us Run Your Q3 Data.",
      subtitle: "We'll put your last 90 days through our model and show you exactly where you're bleeding margin. Takes us 48 hours. Costs you nothing.",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "Bridgepoint Analytics",
      subtitle: "Predictive inventory intelligence for high-growth DTC brands.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Agency Proposal Example — Redhawk Creative → hospital network
   ══════════════════════════════════════════════════════════════════ */

const agencyProposalExample: ArchetypeExample = {
  archetype: "agency_proposal",
  title: "Agency Proposal",
  scenario: "Redhawk Creative proposing a patient acquisition strategy for Pinnacle Health (12 facilities)",
  defaultThemeKey: "simple-light",
  coverEyebrow: "Proposal for Pinnacle Health",
  watermark: "Redhawk",
  slides: [
    {
      title: "Redhawk × Pinnacle Health",
      subtitle: "A unified patient acquisition strategy for 12 facilities.",
      statLabel: "Proposal · April 2026",
      type: "cover",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    {
      title: "Your Challenge, As We\nUnderstand It",
      subtitle: "12 facilities. 12 marketing strategies. Zero shared performance data. Pinnacle is spending $4.2M/year on patient acquisition with no visibility into which channels actually convert.",
      stat: "$4.2M",
      statLabel: "annual patient acquisition spend",
      bullets: [
        "Each facility runs its own Google Ads — bidding against each other on the same keywords",
        "No shared attribution model — you can't tell which dollar drives a booked appointment",
        "Brand consistency varies wildly between your Denver and Colorado Springs locations",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "none",
      bg: "light",
    },
    {
      title: "What We Think Is\nReally Going On",
      subtitle: "This isn't a branding problem. It's a measurement problem. Pinnacle doesn't need 12 better campaigns — it needs one system that tells you what's working.",
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "light-accent",
    },
    {
      title: "The 3-Phase Approach",
      subtitle: "Audit → Consolidate → Scale. 90 days to unified performance data, 180 days to optimized cost-per-acquisition across all 12 facilities.",
      bullets: [
        "**Phase 1 (Days 1-30):** Full channel audit. What's working, what's wasting money, and where",
        "**Phase 2 (Days 30-90):** Consolidate into one acquisition engine with shared attribution",
        "**Phase 3 (Days 90-180):** Optimize per-facility spend based on real conversion data",
      ],
      type: "solution",
      layout: "split",
      visual: "metric-grid",
      bg: "light",
    },
    {
      title: "We Did This for\nSummit Medical Group.",
      subtitle: "8-facility network in Arizona. Same fragmented marketing. Same wasted spend. We unified their acquisition in 4 months.",
      stat: "38%",
      statLabel: "lower cost-per-acquisition in 6 months",
      bullets: [
        "Consolidated 8 separate Google Ads accounts into one managed platform",
        "Cost-per-booked-appointment dropped from $127 to $79",
        "Patient volume up 22% with 15% less total ad spend",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "light-accent",
    },
    {
      title: "Your Team. Named.",
      subtitle: "These are the people who will actually work on Pinnacle's account — not a B-team after the pitch.",
      callout: "Led by **Maya Torres** (12 years in healthcare marketing, former VP at HCA Healthcare) and **David Park** (performance media lead, managed $30M+ in healthcare ad spend).",
      type: "proof",
      layout: "split",
      visual: "team-grid",
      bg: "light",
    },
    {
      title: "Investment: $28K/Month.\nFirst Results in 30 Days.",
      subtitle: "All-in: strategy, media management, creative, reporting, and a dedicated Slack channel. No hidden fees. 90-day initial commitment.",
      bullets: [
        "Monthly performance reviews with your CMO and facility directors",
        "Real-time dashboard — patient volume, CPA, and ROAS by facility",
        "30-day exit clause after the initial 90 days — we earn your renewal",
      ],
      type: "cta",
      layout: "split",
      visual: "fund-bars",
      bg: "light-accent",
    },
    {
      title: "Redhawk Creative",
      subtitle: "Performance marketing for multi-location healthcare.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Case Study Example — Vaultline → aerospace company
   ══════════════════════════════════════════════════════════════════ */

const caseStudyExample: ArchetypeExample = {
  archetype: "case_study",
  title: "Case Study",
  scenario: "Vaultline showing how they cut procurement cycles 62% for a Fortune 500 auto parts manufacturer",
  defaultThemeKey: "simple-dark",
  coverEyebrow: "Customer Story",
  coverFooter: "VAULTLINE",
  slides: [
    {
      title: "How Autoforge Cut\nProcurement Time by 62%",
      subtitle: "A Fortune 500 auto parts manufacturer went from 11-hour weekly PO reconciliation to real-time procurement — in 5 months.",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    {
      title: "Why This Story\nMatters to You",
      subtitle: "Like your team, Autoforge manages 4,000+ SKUs across 3 continents with mixed ERP systems. They were drowning in the same complexity you're facing right now.",
      stat: "4,000+",
      statLabel: "SKUs across 3 continents",
      type: "tension",
      layout: "stat-left",
      visual: "none",
      bg: "dark",
    },
    {
      title: "The Starting Point:\n11 Hours/Week on Manual POs",
      subtitle: "Autoforge's procurement team spent every Monday reconciling purchase orders across SAP, Oracle, and a homegrown Access database that no one fully understood.",
      stat: "11 hrs",
      statLabel: "per week on manual reconciliation",
      bullets: [
        "3 disconnected ERP systems — no single source of truth",
        "Average PO cycle time: 14 days (industry benchmark: 5 days)",
        "2 full-time staff dedicated entirely to data entry and reconciliation",
      ],
      type: "data",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    {
      title: "They'd Already Tried\nTwo Other Solutions.",
      subtitle: "A custom integration project (failed after 8 months and $400K). An off-the-shelf connector tool (handled 60% of their SKUs, broke on the rest). The problem was genuinely hard.",
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "subtle",
    },
    {
      title: "What Vaultline Did Differently",
      subtitle: "Instead of connecting their ERPs, we built an intelligence layer that sits above them — reading from all three, writing to one unified procurement ledger.",
      bullets: [
        "Mapped 4,200 SKUs across all 3 systems in 3 weeks — including the Access edge cases",
        "Deployed parallel-run for 30 days so the team could validate before switching",
        "PO routing automated for 94% of standard orders by month 2",
      ],
      type: "solution",
      layout: "split",
      visual: "icon-grid",
      bg: "dark-mesh",
    },
    {
      title: "62% Faster Procurement.\n$1.8M in Savings.",
      subtitle: "PO cycle time dropped from 14 days to 5.3 days. The two full-time reconciliation roles were redeployed to strategic sourcing.",
      stat: "62%",
      statLabel: "reduction in procurement cycle time",
      bullets: [
        "Cycle time: 14 days → 5.3 days",
        "$1.8M saved annually in labor and error correction",
        "2 FTEs redeployed from reconciliation to strategic sourcing",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "metrics-row",
      bg: "dark",
    },
    {
      title: "\"Monday Mornings Used to Be\nAbout Firefighting. Now They're\nAbout Planning.\"",
      subtitle: "— Kira Tanaka, VP Procurement, Autoforge",
      type: "proof",
      layout: "quote",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "You're Managing Similar\nComplexity Right Now.",
      subtitle: "Would cutting your PO cycle time by even half of what Autoforge saw change how you allocate your Q3 budget?",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
    },
    {
      title: "Vaultline",
      subtitle: "Supply chain intelligence for complex, multi-system enterprises.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Competitive Swap Example — Canopy HR → mid-market HRIS switch
   ══════════════════════════════════════════════════════════════════ */

const competitiveSwapExample: ArchetypeExample = {
  archetype: "competitive_displacement",
  title: "Competitive Swap",
  scenario: "Canopy HR pitching mid-market companies to switch from legacy HRIS to a modern platform",
  defaultThemeKey: "aurora-flux",
  coverEyebrow: "The Modern HRIS",
  coverFooter: "CANOPY HR",
  slides: [
    {
      title: "Your Workforce Changed.\nYour HR Stack Didn't.",
      subtitle: "Remote-first teams, global contractors, async workflows. The tools built for single-office companies in 2015 weren't designed for how you work today.",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    {
      title: "What Modern HR Teams\nActually Need",
      subtitle: "A single system that handles a full-time employee in Austin, a contractor in Berlin, and an intern in Lagos — without three different workflows.",
      bullets: [
        "Compliance that updates automatically when regulations change",
        "Onboarding that works across time zones, not just office locations",
        "Compensation data that's real-time, not quarterly spreadsheet exports",
      ],
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "The Hidden Cost of\nStanding Still",
      subtitle: "Legacy HRIS platforms aren't free — even if they're paid for. They cost you in workarounds, manual processes, and the senior HR time spent on tasks that should be automated.",
      stat: "6 hrs",
      statLabel: "per week on tasks your HRIS should handle",
      bullets: [
        "Average mid-market HR team spends 6 hrs/week on manual data entry and exports",
        "68% of HR leaders say their current system can't handle distributed teams",
        "Compliance gaps in legacy systems cost mid-market companies $127K/year on average",
      ],
      type: "data",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    {
      title: "Same Outcome. Completely\nDifferent Experience.",
      subtitle: "We built Canopy on the assumption that your workforce is distributed, your compliance needs are dynamic, and your HR team is too small for the work being asked of it.",
      bullets: [
        "PTO request: 4 clicks and 30 seconds. Not a form, an email, and a spreadsheet update.",
        "Onboarding: one workflow handles US W-2s and German contracts — no switching tools",
        "Compensation review: real-time benchmarking, not last quarter's data in a PDF",
      ],
      type: "solution",
      layout: "split",
      visual: "metric-grid",
      bg: "subtle",
    },
    {
      title: "Migration Takes 3 Weeks.\nWe Handle All of It.",
      subtitle: "The #1 reason companies stay on legacy systems is fear of switching pain. We've migrated 200+ companies — the average timeline is 18 business days.",
      stat: "18",
      statLabel: "business days average migration",
      bullets: [
        "Automated data migration from every major HRIS — including custom fields",
        "Parallel-run period so your team validates before you cut over",
        "Dedicated migration specialist assigned to your account for 60 days",
      ],
      type: "solution",
      layout: "stat-left",
      visual: "none",
      bg: "dark-mesh",
    },
    {
      title: "Nextera Made the Switch.\n90 Days Later, They Wish\nThey'd Done It Sooner.",
      subtitle: "\"We spent 18 months saying 'next quarter.' The actual migration took 14 days. The only regret is not switching earlier.\" — Lisa Morales, VP People, Nextera (340 employees)",
      stat: "14",
      statLabel: "days to full migration",
      bullets: [
        "HR admin time dropped 40% in the first month",
        "First international contractor onboarded in 2 hours (was 2 weeks)",
        "Zero compliance incidents since migration — down from 3/quarter",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "testimonial",
      bg: "dark",
    },
    {
      title: "15 Minutes. Your Data.\nA Side-by-Side You Can Feel.",
      subtitle: "We'll run your current top 3 HR workflows through Canopy — live. You'll see the difference in experience, not just features.",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "Canopy HR",
      subtitle: "The modern HRIS for distributed, growing teams.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Thought Leadership Example — Meridian Carbon → CFOs
   ══════════════════════════════════════════════════════════════════ */

const thoughtLeadershipExample: ArchetypeExample = {
  archetype: "thought_leadership",
  title: "Thought Leadership",
  scenario: "Meridian Carbon presenting to manufacturing CFOs on Scope 3 emissions as a procurement blocker",
  defaultThemeKey: "simple-light",
  coverEyebrow: "Research Brief · Q2 2026",
  watermark: "Meridian Carbon",
  slides: [
    {
      title: "Scope 3 Is No Longer Optional.\nIt's a Procurement Qualifier.",
      subtitle: "23% of enterprise procurement RFPs now require Scope 3 emissions data. In 2023, it was 4%. If you can't report it, you can't bid.",
      type: "cover",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    {
      title: "3 Forces Are Making This\nUnavoidable in 2026",
      subtitle: "This isn't driven by one regulation or one customer. It's a convergence that's making Scope 3 reporting a gating function for enterprise procurement.",
      bullets: [
        "**EU CSRD** now requires Scope 3 reporting for 50,000+ companies — including US suppliers",
        "**Apple, Microsoft, and Walmart** added Scope 3 to supplier scorecards in 2025",
        "**Institutional investors** managing $18T in assets now require climate disclosure",
      ],
      type: "tension",
      layout: "split",
      visual: "line-chart",
      bg: "light",
    },
    {
      title: "The Misconception:\n\"This Is a Compliance Exercise.\"",
      subtitle: "Most CFOs treat Scope 3 as a box to check. The companies getting ahead see it differently — it's becoming a competitive qualification for their largest contracts.",
      stat: "23%",
      statLabel: "of RFPs now require Scope 3 data",
      type: "data",
      layout: "stat-left",
      visual: "none",
      bg: "light-accent",
    },
    {
      title: "Where Does Your Company\nSit Right Now?",
      subtitle: "Most manufacturers fall into one of four stages. The gap between Stage 2 and Stage 3 is where deals start getting lost.",
      bullets: [
        "**Stage 1:** No measurement. Reporting is manual or nonexistent.",
        "**Stage 2:** Estimated data. Using industry averages, not actual supplier data.",
        "**Stage 3:** Primary data. Collecting from suppliers, but not automated.",
        "**Stage 4:** Real-time. Automated collection, audit-ready, embedded in procurement.",
      ],
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    {
      title: "What Leaders Are\nDoing Differently",
      subtitle: "Three manufacturers moved from Stage 2 to Stage 4 in under 6 months. The common thread wasn't budget — it was treating emissions data as a supply chain signal, not a compliance report.",
      bullets: [
        "Continental AG automated Scope 3 collection from 400+ suppliers — bid-win rate up 18%",
        "A US aerospace manufacturer embedded emissions data into supplier scoring — saved $3.2M in carbon offsets",
        "All three started with their top 20 suppliers, not a company-wide rollout",
      ],
      type: "proof",
      layout: "split",
      visual: "metric-grid",
      bg: "light",
    },
    {
      title: "If You Do Nothing Else,\nDo These 3 Things in Q3.",
      subtitle: "Regardless of what tools you use, these three actions will move you from Stage 2 to Stage 3 — where contracts stop being at risk.",
      bullets: [
        "**Map your top 20 suppliers** by emissions impact — 80% of Scope 3 lives in 20% of suppliers",
        "**Request primary data** from your 5 largest — a simple email template works",
        "**Add emissions to your supplier scorecard** — even directionally, it signals intent to buyers",
      ],
      type: "solution",
      layout: "split",
      visual: "icon-grid",
      bg: "light-accent",
    },
    {
      title: "Where Companies Get Stuck\n(And How We Help)",
      subtitle: "The manual approach works until you hit 50+ suppliers. After that, collection, normalization, and audit-readiness require automation. That's exactly what Meridian Carbon does.",
      type: "solution",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
    {
      title: "One Thought to Leave With",
      subtitle: "The question isn't whether Scope 3 reporting matters. It's whether your competitors will be ready before you are.",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "light-accent",
    },
    {
      title: "Meridian Carbon",
      subtitle: "Automated Scope 3 intelligence for manufacturing supply chains.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "light",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Product Launch Example — Stackmesh AI Code Review
   ══════════════════════════════════════════════════════════════════ */

const productLaunchExample: ArchetypeExample = {
  archetype: "product_launch",
  title: "Product Launch",
  scenario: "Stackmesh announcing an AI-powered code review agent to 8,000 engineering teams",
  defaultThemeKey: "midnight-ember",
  coverEyebrow: "New from Stackmesh",
  coverFooter: "STACKMESH",
  slides: [
    {
      title: "Code Review Is the Last\nManual Bottleneck in CI/CD.",
      subtitle: "Your senior engineers spend 8-12 hours per week reviewing pull requests. That's an entire engineering headcount reading diffs instead of shipping features.",
      type: "cover",
      layout: "centered",
      visual: "gradient-orb",
      bg: "dark-mesh",
    },
    {
      title: "The Old Way:\n8 Hours/Week Reading Diffs.",
      subtitle: "Pull requests sit for hours. Context gets lost. Your best engineers become bottlenecks instead of builders.",
      stat: "8 hrs",
      statLabel: "per senior engineer per week on code review",
      bullets: [
        "Average PR wait time: 4.2 hours — longer than the code took to write",
        "Senior engineers context-switch 11× per day between writing and reviewing",
        "60% of review comments are style/formatting — not logic or architecture",
      ],
      type: "tension",
      layout: "stat-left",
      visual: "bar-chart",
      bg: "dark",
    },
    {
      title: "What Changed:\nLLMs Can Finally Read Code.",
      subtitle: "Until 2025, AI code analysis was limited to linting and pattern matching. Models with 128K context windows can now understand entire codebases — not just individual files.",
      type: "vision",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "Introducing Stackmesh\nCode Agent.",
      subtitle: "An AI reviewer that reads your PRs, understands your codebase conventions, and delivers review-quality feedback before a human ever looks at it.",
      bullets: [
        "Understands your team's style guide, architecture patterns, and naming conventions",
        "Catches logic bugs, security issues, and performance regressions — not just formatting",
        "Reviews in 90 seconds. Humans focus on design decisions, not nitpicks.",
      ],
      type: "solution",
      layout: "split",
      visual: "icon-grid",
      bg: "dark-mesh",
    },
    {
      title: "Beta Results:\n4.2 Hours → 22 Minutes.",
      subtitle: "140 teams. 47,000 PRs reviewed. Median time from PR open to first actionable feedback dropped by 94%.",
      stat: "94%",
      statLabel: "faster time-to-first-review",
      bullets: [
        "Median review time: 4.2 hours → 22 minutes",
        "False positive rate: 3.1% — lower than most human reviewers",
        "87% of teams reported senior engineers reclaimed 5+ hours per week",
      ],
      type: "proof",
      layout: "stat-left",
      visual: "metrics-row",
      bg: "dark",
    },
    {
      title: "Works With Your Stack.\nChanges Nothing Else.",
      subtitle: "GitHub, GitLab, and Bitbucket. Drops into your existing PR workflow as a reviewer — no new tools, no migration, no training.",
      bullets: [
        "One-click install via GitHub App or GitLab integration",
        "Respects your existing CODEOWNERS and branch protection rules",
        "Python, Go, TypeScript, Java, Rust — with more languages shipping monthly",
      ],
      type: "solution",
      layout: "split",
      visual: "metric-grid",
      bg: "subtle",
    },
    {
      title: "Available Now.\nFree for Teams Under 10.",
      subtitle: "Start in 2 minutes. No credit card. No sales call. Install the GitHub App and your next PR gets reviewed automatically.",
      type: "cta",
      layout: "centered",
      visual: "none",
      bg: "accent-gradient",
    },
    {
      title: "Stackmesh",
      subtitle: "AI-native developer tools for modern engineering teams.",
      type: "contact",
      layout: "centered",
      visual: "none",
      bg: "dark-mesh",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   Registry
   ══════════════════════════════════════════════════════════════════ */

export const archetypeExamples: Record<string, ArchetypeExample> = {
  cold_outreach: coldOutreachExample,
  warm_intro: warmIntroExample,
  agency_proposal: agencyProposalExample,
  investor_pitch: investorPitchExample,
  case_study: caseStudyExample,
  competitive_displacement: competitiveSwapExample,
  thought_leadership: thoughtLeadershipExample,
  product_launch: productLaunchExample,
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

  /* ── Theme-aware text helpers for visual elements ── */
  const vizText = theme === "light" ? "text-gray-700" : "text-white/65";
  const vizMuted = theme === "light" ? "text-gray-400" : "text-white/40";
  const vizSubtle = theme === "light" ? "text-gray-500" : "text-white/50";

  /* ── Churn member grid ── */
  if (type === "churn-grid") {
    return (
      <div className={cn(ptr, "w-full space-y-2.5")}>
        <p className={cn("text-[10px] font-semibold uppercase tracking-widest", vizMuted)}>
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
            <span className={cn("text-[10px]", vizSubtle)}>Retained (5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-red-500/60" />
            <span className={cn("text-[10px]", vizSubtle)}>Lost (5)</span>
          </div>
        </div>
        <p className={cn("text-[9px] italic", vizMuted)}>Source: IHRSA Retention Study, 2025</p>
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
      <div className={cn(ptr, "grid grid-cols-4 gap-1.5 w-full")}>
        {items.map(({ Icon, label }, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 rounded-lg py-2"
            style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}
          >
            <Icon className="size-4" style={{ color: accent }} />
            <span className={cn("text-[9px] font-medium", vizSubtle)}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  /* ── Metrics row ── */
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
            <span className={cn("text-[11px] font-medium", vizSubtle)}>{m.label}</span>
            <div className="flex items-center gap-2.5">
              <span className={cn("text-[14px] font-bold", theme === "light" ? "text-gray-900" : "text-white")}>{m.value}</span>
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
          <p className={cn("text-[13px] italic leading-relaxed", vizText)}>
            ClearPath gave us the operational confidence to open our fourth location. We couldn&apos;t have scaled without it.
          </p>
          <p className="mt-3 text-[11px] font-semibold" style={{ color: accent }}>
            — Jamie Torres, COO · FitHub Co.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-4 py-2" style={{ background: `${accent}08`, border: `1px solid ${accent}15` }}>
          <span className="text-[18px] font-black" style={{ color: accent }}>31%</span>
          <span className={cn("text-[10px] font-medium uppercase tracking-wider", vizMuted)}>less churn in 90 days</span>
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

export function SlidePreview({
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
      className="relative h-full w-full overflow-hidden rounded-xl shadow-2xl transition-all duration-500 ease-in-out"
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
        {slide.type === "cta" ? "next step" : slide.type === "contact" ? "contact" : slide.type}
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
      <div className="relative z-10 flex h-full [&_*]:transition-colors [&_*]:duration-500 [&_*]:ease-in-out">

        {/* ─── CENTERED ─── */}
        {slide.layout === "centered" && (
          <div className="flex h-full w-full flex-col items-center justify-center px-12 text-center sm:px-20">
            <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />

            {slide.type === "contact" ? (
              /* ── Contact / closing slide ── */
              <>
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="size-3 rounded-sm" style={{ background: accent }} />
                  <div className="h-[2px] w-8 rounded-full" style={{ background: accent }} />
                </div>
                <h3 className={cn("text-4xl font-black tracking-tight sm:text-5xl", headingCls)}>
                  {slide.title}
                </h3>
                {slide.subtitle && (
                  <p className={cn("mt-3 max-w-md text-sm leading-relaxed", subtitleCls)}>
                    {slide.subtitle}
                  </p>
                )}
                <div className={cn("mt-8 space-y-2 text-[13px]", mutedCls)}>
                  <p>{watermark ? `${watermark.toLowerCase().replace(/\s+/g, "")}.ai` : "bestdecks.co"}</p>
                  <p>{watermark ? `hello@${watermark.toLowerCase().replace(/\s+/g, "")}.ai` : "hello@bestdecks.co"}</p>
                </div>
                {coverFooter && (
                  <p className={cn("mt-6 text-[10px] font-medium uppercase tracking-[0.18em]", mutedCls)} style={{ opacity: 0.6 }}>
                    {coverFooter}
                  </p>
                )}
              </>
            ) : slide.type === "cover" ? (
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
            <div className={cn("flex w-[32%] flex-col items-center justify-center border-r px-5", dividerCls)}>
              {slide.stat && (
                <div className="text-center">
                  <p className="text-5xl font-black tracking-tighter" style={{ color: accent }}>
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
            <div className="flex w-[68%] flex-col justify-center overflow-hidden py-6 px-6 sm:px-8">
              <h3 className={cn("text-xl font-bold leading-tight tracking-tight whitespace-pre-line sm:text-2xl", headingCls)}>
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className={cn("mt-2 text-[13px] leading-relaxed", subtitleCls)}>
                  {renderHighlight(slide.subtitle, accent)}
                </p>
              )}
              {slide.bullets && (
                <ul className="mt-3 space-y-1.5">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className={cn("flex items-start gap-2.5 text-[12px] leading-snug", bulletCls)}>
                      <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {renderHighlight(b, accent)}
                    </li>
                  ))}
                </ul>
              )}
              {slide.callout && (
                <div
                  className="mt-2 rounded-r-lg border-l-2 px-3 py-1.5"
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
                <div className="mt-auto pt-2">
                  <VisualElement type={slide.visual} accent={accent} theme={surfaceTheme} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── SPLIT ─── */}
        {slide.layout === "split" && (
          <>
            <div className="flex w-[48%] flex-col justify-center overflow-hidden py-6 px-6 sm:px-8">
              <h3 className={cn("text-xl font-bold leading-tight tracking-tight whitespace-pre-line sm:text-2xl", headingCls)}>
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className={cn("mt-2 text-[13px] leading-relaxed", subtitleCls)}>
                  {renderHighlight(slide.subtitle, accent)}
                </p>
              )}
              {slide.bullets && (
                <ul className="mt-3 space-y-1.5">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className={cn("flex items-start gap-2.5 text-[12px] leading-snug", bulletCls)}>
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
          className="fixed inset-4 z-50 flex flex-col outline-none sm:inset-6 lg:inset-8 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">
            {example.title} quick preview
          </DialogPrimitive.Title>

          {/* Header — fixed at top */}
          <div className="shrink-0 rounded-t-[20px] border border-b-0 border-white/[0.08] bg-white/[0.04] px-4 py-3 shadow-[0_28px_120px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full" style={{ background: accent }} />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                      Quick preview
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-white">{example.title}</p>
                  <p className="hidden text-[12px] text-white/40 lg:block">
                    {example.scenario}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-white/55">
                  {themeStatusLabel}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium tabular-nums text-white/55">
                  {currentSlide + 1} / {total}
                </span>
                <DialogPrimitive.Close
                  className="flex size-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-white/55 transition-colors hover:bg-white/[0.12] hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-3.5" />
                </DialogPrimitive.Close>
              </div>
            </div>
          </div>

          {/* Body — fills remaining viewport height */}
          <div className="flex min-h-0 flex-1 gap-0 rounded-b-[20px] border border-t-0 border-white/[0.08] bg-white/[0.04] backdrop-blur-xl overflow-hidden">
            {/* Left: slide preview + navigation + slide pills */}
            <div className="min-w-0 flex-1 flex flex-col">
              {/* Slide — fills available space */}
              <div className="relative flex-1 min-h-0 overflow-hidden border-b border-white/[0.06] flex items-center justify-center p-2">
                <div
                  className="pointer-events-none absolute inset-0 opacity-90 transition-all duration-500 ease-in-out"
                  style={{
                    background: `radial-gradient(circle at top right, ${selectedTheme.surfaceGlow} 0%, transparent 34%), radial-gradient(circle at bottom left, ${selectedTheme.accent}18 0%, transparent 28%)`,
                  }}
                />
                <div key={currentSlide} className={cn("relative aspect-video max-h-full max-w-full", direction === "right" ? "animate-slide-in-right" : "animate-slide-in-left")} style={{ height: "100%" }}>
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

              {/* Progress bar + arrows — fixed at bottom of slide area */}
              <div className="shrink-0 flex items-center gap-3 border-t border-white/[0.06] px-3 py-2">
                <div className="flex flex-1 items-center gap-1">
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
                <div className="flex items-center gap-1">
                  <button onClick={goPrev} disabled={currentSlide === 0} className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-white/55 transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-default disabled:opacity-25">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button onClick={goNext} disabled={currentSlide === total - 1} className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-white/55 transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-default disabled:opacity-25">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Slide pills — fixed at bottom */}
              <div className="shrink-0 flex gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3 py-2">
                {example.slides.map((slide, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setDirection(i > currentSlide ? "right" : "left"); setCurrentSlide(i); }}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-all",
                      currentSlide === i
                        ? "border-white/[0.14] bg-white/[0.08]"
                        : "border-white/[0.06] bg-black/[0.16] hover:border-white/[0.12] hover:bg-white/[0.05]",
                    )}
                  >
                    <span className={cn(
                      "flex size-4 items-center justify-center rounded text-[9px] font-bold",
                      currentSlide === i ? "bg-white/[0.12] text-white" : "bg-white/[0.06] text-white/40",
                    )}>
                      {i + 1}
                    </span>
                    <span className="text-[10px] font-medium text-white/60 whitespace-nowrap">
                      {slide.type === "cta" ? "NEXT STEP" : slide.type === "contact" ? "CONTACT" : slide.type.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: themes sidebar */}
            <div className="w-[200px] shrink-0 flex flex-col gap-1.5 overflow-y-auto border-l border-white/[0.06] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Themes</p>

              <div className="flex flex-col gap-1.5">
                {availableThemes.map((theme) => {
                  const selected = theme.key === selectedTheme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => setSelectedThemeKey(theme.key)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left transition-all",
                        selected
                          ? "border-white/[0.14] bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : "border-white/[0.06] bg-black/[0.16] hover:border-white/[0.12] hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: theme.accent }} />
                        <span
                          className="h-1.5 w-5 rounded-full"
                          style={{ background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.accentSoft} 100%)` }}
                        />
                        <span
                          className={cn(
                            "ml-auto rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]",
                            theme.family === "light"
                              ? "bg-white text-slate-700"
                              : "bg-white/[0.08] text-white/55",
                          )}
                        >
                          {theme.family}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-white">{theme.name}</p>
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
