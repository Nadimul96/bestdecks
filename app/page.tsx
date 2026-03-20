"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Gift,
  Globe,
  Layers,
  LayoutTemplate,
  Lightbulb,
  Menu,
  MousePointerClick,
  Presentation,
  Rocket,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { pricingPlans } from "@/lib/workspace-types";

/* ─────────────────────────────────────────────
   Landing Page — bestdecks.co
   ───────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-white text-foreground antialiased">
      <MarketingNav />
      <Hero />
      <LogoStrip />
      <HowItWorks />
      <Features />
      <ProductShowcase />
      <Pricing />
      <ReferralCTA />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ─── Navigation ─────────────────────────────── */

function MarketingNav() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 shadow-sm backdrop-blur-xl border-b border-border/40"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-18">
          <Logo size="md" />

          {/* Desktop links */}
          <div className="hidden items-center gap-8 lg:flex">
            <a href="#how-it-works" className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground">
              Pricing
            </a>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-navy/20 transition-all hover:shadow-xl hover:shadow-brand-navy/30 hover:-translate-y-px"
            >
              Start free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 text-foreground/70 transition-colors hover:text-foreground lg:hidden"
          >
            {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="border-t border-border/30 pb-6 pt-4 lg:hidden">
            <div className="flex flex-col gap-3">
              <a href="#how-it-works" onClick={() => setIsOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-accent">How it works</a>
              <a href="#features" onClick={() => setIsOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-accent">Features</a>
              <a href="#pricing" onClick={() => setIsOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-accent">Pricing</a>
              <hr className="border-border/30" />
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70">Log in</Link>
              <Link href="/signup" className="rounded-lg bg-brand-navy px-3 py-2.5 text-center text-sm font-semibold text-white">Start free</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

/* ─── Hero ────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 lg:pt-36 lg:pb-28">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/[0.06] via-primary/[0.03] to-transparent blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-20 -left-32 h-[300px] w-[300px] rounded-full bg-brand-navy/[0.03] blur-3xl" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="size-3.5" />
            3 free decks when you sign up
            <ChevronRight className="size-3.5" />
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-brand-navy sm:text-5xl lg:text-6xl xl:text-7xl">
            Personalized pitch decks{" "}
            <br className="hidden sm:block" />
            for every lead.{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-primary via-primary to-brand-navy-light bg-clip-text text-transparent">
                Automatically.
              </span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                <path d="M2 8C50 2 100 2 150 6C200 10 250 4 298 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary/30" />
              </svg>
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl lg:text-xl">
            Upload your prospect list. Our AI researches each company, then crafts a{" "}
            <strong className="font-semibold text-foreground/80">tailored presentation</strong>{" "}
            that proves you understand their business. Close more deals by leading with value, not volume.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-brand-navy px-8 py-4 text-base font-semibold text-white shadow-xl shadow-brand-navy/25 transition-all hover:shadow-2xl hover:shadow-brand-navy/30 hover:-translate-y-0.5"
            >
              Start for free — 3 decks on us
              <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="group inline-flex items-center gap-2 rounded-xl border border-border px-6 py-4 text-base font-medium text-foreground/70 transition-all hover:border-border/80 hover:text-foreground hover:bg-accent/50"
            >
              See how it works
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          {/* Trust */}
          <p className="mt-8 text-sm text-muted-foreground/60">
            No credit card required · Setup in 2 minutes · Cancel anytime
          </p>
        </div>

        {/* Product mockup */}
        <div className="relative mx-auto mt-16 max-w-5xl lg:mt-20">
          <div className="relative rounded-2xl border border-border/50 bg-white/80 p-2 shadow-2xl shadow-brand-navy/10 ring-1 ring-brand-navy/5 backdrop-blur">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 rounded-t-xl border-b border-border/30 bg-accent/40 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-red-400/60" />
                <div className="size-3 rounded-full bg-amber-400/60" />
                <div className="size-3 rounded-full bg-green-400/60" />
              </div>
              <div className="mx-auto flex items-center gap-2 rounded-lg bg-white/70 px-4 py-1.5 text-xs text-muted-foreground/50">
                <Globe className="size-3" />
                console.bestdecks.co
              </div>
            </div>
            {/* App preview */}
            <div className="rounded-b-xl bg-gradient-to-b from-background to-accent/20 p-6 lg:p-10">
              <div className="grid grid-cols-12 gap-4">
                {/* Sidebar mock */}
                <div className="col-span-3 hidden space-y-3 lg:block">
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
                    <div className="size-2 rounded-full bg-primary" />
                    <div className="h-2 w-16 rounded bg-primary/30" />
                  </div>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <div className="size-2 rounded-full bg-muted-foreground/20" />
                      <div className="h-2 rounded bg-muted-foreground/10" style={{ width: `${50 + i * 12}px` }} />
                    </div>
                  ))}
                </div>
                {/* Content area mock */}
                <div className="col-span-12 space-y-4 lg:col-span-9">
                  {/* Stats cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Decks Generated", value: "247", color: "bg-emerald-500" },
                      { label: "Total Targets", value: "1,024", color: "bg-primary" },
                      { label: "Avg Quality", value: "87/100", color: "bg-amber-500" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border/40 bg-white p-4 shadow-sm">
                        <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                        <p className="mt-1 text-xl font-bold text-foreground">{stat.value}</p>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-accent">
                          <div className={`h-1.5 rounded-full ${stat.color}`} style={{ width: "72%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Deck cards mock */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      { company: "Acme Corp", score: 92, status: "completed" },
                      { company: "TechFlow", score: 88, status: "completed" },
                      { company: "Meridian", score: 85, status: "completed" },
                    ].map((deck) => (
                      <div key={deck.company} className="group rounded-xl border border-border/40 bg-white p-3 shadow-sm transition-all hover:shadow-md">
                        <div className="aspect-[16/10] rounded-lg bg-gradient-to-br from-brand-navy/5 to-primary/5 mb-2.5 flex items-center justify-center">
                          <Presentation className="size-8 text-brand-navy/20" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{deck.company}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Star className="size-3 text-amber-500" fill="currentColor" />
                          <span className="text-xs font-medium text-muted-foreground">{deck.score}/100</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Glow beneath */}
          <div className="absolute -bottom-8 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
        </div>
      </div>
    </section>
  );
}

/* ─── Logo Strip / Social Proof ──────────────── */

function LogoStrip() {
  return (
    <section className="border-y border-border/30 bg-accent/20 py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="mb-6 text-center text-sm font-medium tracking-wide text-muted-foreground/60 uppercase">
          Built for builders who close
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {[
            { icon: Target, label: "Agencies" },
            { icon: Rocket, label: "Startups" },
            { icon: Users, label: "Sales Teams" },
            { icon: Lightbulb, label: "Consultants" },
            { icon: TrendingUp, label: "Freelancers" },
            { icon: Globe, label: "SaaS Founders" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-muted-foreground/40">
              <Icon className="size-5" />
              <span className="text-sm font-semibold tracking-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ───────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Drop in your leads",
      description:
        "Paste website URLs or upload a CSV with your prospects. That's all we need — a website tells us everything about their business.",
      icon: Upload,
      detail: "CSV, XLSX, or paste URLs directly",
    },
    {
      step: "02",
      title: "AI does the deep research",
      description:
        "Our AI crawls each prospect's site, analyzes their business model, pain points, tech stack, and market position. Then it maps your services to their specific needs.",
      icon: Search,
      detail: "Powered by Claude, GPT, Gemini & more",
    },
    {
      step: "03",
      title: "Get decks ready to send",
      description:
        "Receive polished, personalized pitch decks — each one uniquely crafted for that prospect. Download as PDF, PPTX, or share a beautiful bestdecks.co link.",
      icon: Send,
      detail: "PDF · PPTX · Google Slides · Shareable link",
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl lg:text-5xl">
            Three steps to decks that close
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From prospect list to personalized presentations — in minutes, not days.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3 lg:gap-12">
          {steps.map(({ step, title, description, icon: Icon, detail }, i) => (
            <div key={step} className="group relative">
              {/* Connector line */}
              {i < 2 && (
                <div className="absolute right-0 top-12 hidden h-px w-12 translate-x-full bg-gradient-to-r from-border to-transparent lg:block" />
              )}

              <div className="relative rounded-2xl border border-border/40 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:border-primary/20 hover:-translate-y-1">
                {/* Step number */}
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-brand-navy text-white shadow-lg shadow-brand-navy/20">
                    <Icon className="size-5.5" />
                  </div>
                  <span className="text-4xl font-bold text-brand-navy/10">{step}</span>
                </div>

                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Zap className="size-3 text-primary" />
                  {detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ───────────────────────────────── */

function Features() {
  const features = [
    {
      icon: Search,
      title: "Deep prospect research",
      description:
        "AI crawls each prospect's website and extracts their business model, services, team, recent news, and pain points — building a complete intelligence brief before generating a single slide.",
    },
    {
      icon: LayoutTemplate,
      title: "8 deck archetypes",
      description:
        "Cold outreach, warm intro, agency proposal, investor pitch, case study, competitive swap, thought leadership, or product launch — pick the framework that fits.",
    },
    {
      icon: Sparkles,
      title: "AI quality scoring",
      description:
        "Every deck is scored 0-100 on relevance, completeness, persuasion, visual quality, and personalization. Only send decks that meet your quality bar.",
    },
    {
      icon: Layers,
      title: "Multiple export formats",
      description:
        "Download as PDF, PowerPoint, push to Google Slides, or share a responsive bestdecks.co link. Your prospect sees a polished presentation however they open it.",
    },
    {
      icon: Target,
      title: "Batch at any scale",
      description:
        "Generate 5 decks or 500. Upload a CSV, map your columns, and let the pipeline handle the rest. Each deck is unique — no templates, no copy-paste.",
    },
    {
      icon: Shield,
      title: "Multi-model AI",
      description:
        "Choose between Claude, GPT, Gemini, or Kimi K2.5 — each excels at different presentation strengths. Switch models anytime from your dashboard.",
    },
  ];

  return (
    <section id="features" className="scroll-mt-20 bg-accent/30 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl lg:text-5xl">
            Everything you need to outreach at scale
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Research, personalize, generate, and deliver — all from one platform.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border/40 bg-white p-7 shadow-sm transition-all hover:shadow-lg hover:border-primary/20 hover:-translate-y-1"
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <Icon className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Product Showcase ───────────────────────── */

function ProductShowcase() {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left - Text */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Why bestdecks
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
              Because generic pitches don&apos;t close deals. Personalized value does.
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">
              The best salespeople spend hours researching each prospect before crafting
              a custom pitch. That works — but it doesn&apos;t scale. bestdecks gives you
              that same depth of personalization for every single lead on your list.
            </p>

            <div className="mt-8 space-y-5">
              {[
                {
                  title: "10x response rate",
                  description:
                    "Prospects who receive a personalized deck are far more likely to reply than those who get a generic email.",
                },
                {
                  title: "Hours saved per prospect",
                  description:
                    "What used to take 2-4 hours of manual research and deck creation now happens automatically in minutes.",
                },
                {
                  title: "Show up with value",
                  description:
                    "Instead of asking for time, you're offering an analysis of their business. That changes the entire dynamic of the conversation.",
                },
              ].map(({ title, description }) => (
                <div key={title} className="flex gap-4">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Check className="size-4" strokeWidth={3} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{title}</h4>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Visual */}
          <div className="relative">
            <div className="relative rounded-2xl border border-border/50 bg-white p-6 shadow-xl">
              {/* Mock deck preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-navy/10">
                    <Presentation className="size-5 text-brand-navy" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Acme Corp — Cold Outreach Deck</p>
                    <p className="text-xs text-muted-foreground">12 slides · Generated 2 min ago</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1">
                    <Star className="size-3 text-emerald-600" fill="currentColor" />
                    <span className="text-xs font-bold text-emerald-700">92</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["Company-Specific Hook", "Pain Point Analysis", "Our Solution Mapped"].map(
                    (slide, i) => (
                      <div
                        key={slide}
                        className="aspect-[16/10] rounded-lg border border-border/30 bg-gradient-to-br from-accent/50 to-white p-2.5 flex flex-col justify-between"
                      >
                        <div className="h-1 w-8 rounded bg-brand-navy/30" />
                        <div className="space-y-1">
                          <div className="h-1 w-full rounded bg-brand-navy/10" />
                          <div className="h-1 w-3/4 rounded bg-brand-navy/10" />
                        </div>
                        <p className="text-[8px] font-medium text-muted-foreground/60">{slide}</p>
                      </div>
                    ),
                  )}
                </div>

                {/* Score breakdown */}
                <div className="rounded-xl border border-border/30 bg-accent/30 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Quality Breakdown
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: "Relevance", score: 95, color: "bg-emerald-500" },
                      { label: "Personalization", score: 94, color: "bg-primary" },
                      { label: "Persuasion", score: 90, color: "bg-amber-500" },
                      { label: "Completeness", score: 88, color: "bg-purple-500" },
                    ].map(({ label, score, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="w-24 text-xs text-muted-foreground">{label}</span>
                        <div className="flex-1 h-2 rounded-full bg-accent">
                          <div
                            className={`h-2 rounded-full ${color} transition-all`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-bold text-foreground">{score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 size-24 rounded-full bg-primary/[0.05] blur-2xl" />
            <div className="absolute -bottom-6 -left-6 size-32 rounded-full bg-brand-navy/[0.04] blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ────────────────────────────────── */

function Pricing() {
  const [annual, setAnnual] = React.useState(false);
  const plans = pricingPlans.filter((p) => p.tier !== "enterprise");

  return (
    <section id="pricing" className="scroll-mt-20 bg-brand-navy py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-foreground/60">
            Simple pricing
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            1 credit = 1 deck, end to end
          </h2>
          <p className="mt-4 text-lg text-white/60">
            No hidden fees. No per-slide charges. One credit covers research, generation, scoring, and delivery.
          </p>

          {/* Annual toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1.5">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                !annual ? "bg-white text-brand-navy shadow-sm" : "text-white/60 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                annual ? "bg-white text-brand-navy shadow-sm" : "text-white/60 hover:text-white"
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs font-bold text-emerald-500">-20%</span>
            </button>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const price = annual
              ? Math.round(plan.priceMonthly * 0.8)
              : plan.priceMonthly;
            const isPopular = plan.tier === "growth";

            return (
              <div
                key={plan.tier}
                className={`relative rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                  isPopular
                    ? "border-2 border-primary bg-white shadow-2xl shadow-primary/20 scale-[1.03]"
                    : "border border-white/10 bg-white/[0.04] backdrop-blur"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-white shadow-lg">
                    Most Popular
                  </div>
                )}

                <h3
                  className={`text-xl font-bold ${isPopular ? "text-foreground" : "text-white"}`}
                >
                  {plan.name}
                </h3>

                <div className="mt-4 flex items-baseline gap-1">
                  <span
                    className={`text-5xl font-bold tracking-tight ${
                      isPopular ? "text-foreground" : "text-white"
                    }`}
                  >
                    ${price}
                  </span>
                  <span
                    className={`text-sm ${isPopular ? "text-muted-foreground" : "text-white/50"}`}
                  >
                    /month
                  </span>
                </div>

                <p
                  className={`mt-2 text-sm font-medium ${
                    isPopular ? "text-primary" : "text-white/60"
                  }`}
                >
                  {plan.credits} decks included
                </p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${
                          isPopular ? "text-primary" : "text-emerald-400"
                        }`}
                        strokeWidth={3}
                      />
                      <span
                        className={`text-sm ${
                          isPopular ? "text-muted-foreground" : "text-white/70"
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={`mt-8 block rounded-xl py-3.5 text-center text-sm font-semibold transition-all ${
                    isPopular
                      ? "bg-brand-navy text-white shadow-lg shadow-brand-navy/25 hover:shadow-xl hover:-translate-y-px"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  Get started
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise */}
        <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div>
              <h3 className="text-xl font-bold text-white">Enterprise</h3>
              <p className="mt-1 text-sm text-white/60">
                Custom volume, SSO, SLA, dedicated account manager, and custom integrations.
              </p>
            </div>
            <a
              href="mailto:nadimul96@gmail.com"
              className="shrink-0 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              Contact sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Referral CTA ───────────────────────────── */

function ReferralCTA() {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-white to-brand-navy/[0.03] p-10 lg:p-16">
          {/* Decorative */}
          <div className="pointer-events-none absolute -top-20 -right-20 size-60 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 size-48 rounded-full bg-brand-navy/[0.04] blur-3xl" />

          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                <Gift className="size-4" />
                Referral program
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
                Give 23 decks.{" "}
                <span className="text-primary">Get 20 free.</span>
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
                Share your referral link with a friend. When they become a paid customer,
                they get <strong className="font-semibold text-foreground">3 sign-up credits + 20 bonus credits</strong>.
                You get <strong className="font-semibold text-foreground">20 free credits</strong> too.
                Everyone wins.
              </p>
            </div>

            <div className="space-y-4">
              {/* Step cards */}
              {[
                {
                  icon: Send,
                  title: "Share your link",
                  desc: "Get a unique referral URL from your dashboard",
                },
                {
                  icon: Users,
                  title: "Friend signs up & subscribes",
                  desc: "They get 3 free credits instantly + 20 bonus on first plan",
                },
                {
                  icon: Gift,
                  title: "You earn 20 credits",
                  desc: "Credited to your account automatically",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex items-start gap-4 rounded-xl border border-border/40 bg-white/80 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ──────────────────────────────── */

function FinalCTA() {
  return (
    <section className="border-t border-border/30 bg-accent/20 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl lg:text-5xl">
            Ready to stop sending pitches that get ignored?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Join builders who are closing more deals by leading every conversation with
            a personalized deck that proves they did the homework.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-brand-navy px-8 py-4 text-base font-semibold text-white shadow-xl shadow-brand-navy/25 transition-all hover:shadow-2xl hover:shadow-brand-navy/30 hover:-translate-y-0.5"
            >
              Get 3 free decks — no card required
              <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-500" strokeWidth={3} />
              Free tier available
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-500" strokeWidth={3} />
              Setup in 2 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-500" strokeWidth={3} />
              Cancel anytime
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border/30 bg-white py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Logo size="md" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Personalized pitch decks at scale. Built for builders who close.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Product
            </h4>
            <ul className="mt-4 space-y-2.5">
              {["How it works", "Features", "Pricing", "Changelog"].map((item) => (
                <li key={item}>
                  <a href={`#${item.toLowerCase().replace(/ /g, "-")}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5">
              {["About", "Blog", "Careers", "Contact"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Legal
            </h4>
            <ul className="mt-4 space-y-2.5">
              {["Privacy Policy", "Terms of Service", "Security"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/30 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground/60">
            &copy; {new Date().getFullYear()} bestdecks. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {/* Social icons */}
            {[
              { label: "Twitter", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
              { label: "LinkedIn", path: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z M2 9h4v12H2z M4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" },
            ].map(({ label, path }) => (
              <a
                key={label}
                href="#"
                className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                aria-label={label}
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d={path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
