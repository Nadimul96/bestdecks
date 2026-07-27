"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Cloud,
  Code2,
  Database,
  FlaskConical,
  Globe,
  KeyRound,
  Layers3,
  Menu,
  Presentation,
  Search,
  ShieldCheck,
  Terminal,
  Upload,
  X,
} from "lucide-react";

import { Logo } from "@/components/logo";
import {
  CAPABILITY_STATUSES,
  CURRENT_CAPABILITY_COUNTS,
  LIVE_REFERENCE_VERIFICATION,
  OSS_DISTRIBUTION,
  PUBLIC_CAPABILITIES,
  type CapabilityStatus,
} from "@/src/config/capabilities";

const statusPresentation: Record<
  CapabilityStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  implemented: {
    label: "Implemented",
    className: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
    icon: CheckCircle2,
  },
  "reference-verified": {
    label: "Reference-verified",
    className: "bg-blue-500/10 text-blue-700 ring-blue-500/20",
    icon: ShieldCheck,
  },
  experimental: {
    label: "Experimental",
    className: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
    icon: FlaskConical,
  },
  planned: {
    label: "Planned",
    className: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
    icon: CircleDashed,
  },
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-white text-foreground antialiased">
      <MarketingNav />
      <Hero />
      <HowItWorks />
      <CapabilityMatrix />
      <EvidenceBoundary />
      <SelfHosting />
      <DistributionBoundary />
      <FinalSection />
      <Footer />
    </div>
  );
}

function MarketingNav() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#capabilities", label: "Capabilities" },
    { href: "#self-host", label: "Self-host" },
    { href: "#boundaries", label: "Boundaries" },
  ];

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/40 bg-white/90 shadow-sm backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Logo size="md" />

          <div className="hidden items-center gap-7 lg:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/login"
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Open workspace
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="rounded-lg p-2 text-foreground/70 transition-colors hover:text-foreground lg:hidden"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {isOpen && (
          <div className="border-t border-border/30 pb-6 pt-4 lg:hidden">
            <div className="flex flex-col gap-2">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-accent"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/login"
                className="mt-2 rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold"
              >
                Open workspace
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 lg:pb-28 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/[0.07] via-primary/[0.025] to-transparent blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5 text-sm font-medium text-primary">
            <Code2 className="size-3.5" />
            Apache-2.0 · self-hosted · bring your own keys
          </div>

          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-brand-navy sm:text-5xl lg:text-6xl xl:text-7xl">
            Research-to-deck infrastructure
            <span className="block bg-gradient-to-r from-primary to-brand-navy-light bg-clip-text text-transparent">
              designed for self-hosting.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Bestdecks is an open-source pipeline for target intake, provider-backed research,
            structured slide planning, and presentation rendering. You operate the deployment and
            choose the provider accounts; review each provider&apos;s data-handling terms before live use.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#self-host"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-brand-navy px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-brand-navy/20 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
            >
              Review the quickstart
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#capabilities"
              className="group inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3.5 text-base font-medium text-foreground/75 transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              See capability status
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <p className="mt-7 text-sm text-muted-foreground">
            Provider usage is billed by the providers you configure. Bestdecks does not include managed credits.
          </p>
        </div>

        <ReferenceVerificationCallout />
        <ProductSurfacePreview />
      </div>
    </section>
  );
}

function ReferenceVerificationCallout() {
  return (
    <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-amber-500/25 bg-amber-50/70 p-5 text-left">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div>
          <p className="font-semibold text-amber-950">{LIVE_REFERENCE_VERIFICATION.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/75">
            {LIVE_REFERENCE_VERIFICATION.reason} Implemented adapters are listed as implemented,
            not as Reference-verified.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProductSurfacePreview() {
  const stages = [
    { label: "Target intake", status: "Input accepted", icon: Upload },
    { label: "Provider research", status: "Adapter configured", icon: Search },
    { label: "Deck artifact", status: "Human review required", icon: Presentation },
  ];

  return (
    <div className="relative mx-auto mt-12 max-w-5xl">
      <div className="rounded-2xl border border-border/50 bg-white/85 p-2 shadow-2xl shadow-brand-navy/10 ring-1 ring-brand-navy/5 backdrop-blur">
        <div className="flex items-center justify-between rounded-t-xl border-b border-border/30 bg-accent/40 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="size-3 rounded-full bg-red-400/60" />
            <div className="size-3 rounded-full bg-amber-400/60" />
            <div className="size-3 rounded-full bg-green-400/60" />
          </div>
          <div className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Sample data
          </div>
        </div>

        <div className="rounded-b-xl bg-gradient-to-b from-background to-accent/20 p-6 lg:p-9">
          <div className="grid gap-4 md:grid-cols-3">
            {stages.map(({ label, status, icon: Icon }, index) => (
              <div key={label} className="relative rounded-xl border border-border/40 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-navy/8 text-brand-navy">
                    <Icon className="size-4.5" />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground/50">
                    0{index + 1}
                  </span>
                </div>
                <p className="mt-5 text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{status}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/40 bg-white px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Example Company · PPTX artifact</p>
              <p className="text-xs text-muted-foreground">Illustrative interface only; no customer result is represented.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Evidence coverage unavailable
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Provide seller context and targets",
      description:
        "Enter seller-provided facts, paste target URLs, or upload a CSV or TSV file. The intake layer normalizes those values into a typed run contract.",
      icon: Upload,
    },
    {
      number: "02",
      title: "Run configured provider adapters",
      description:
        "The implemented path can call Cloudflare for crawling, Perplexity for enrichment, and Gemini for brief and slide planning when you supply credentials.",
      icon: Layers3,
    },
    {
      number: "03",
      title: "Render, inspect, and retain the artifact",
      description:
        "The runtime measures claim-level evidence coverage and blocks rendering when a factual claim lacks source support. A configured renderer returns a verified artifact; human review remains required until the full live path is reference-verified.",
      icon: Presentation,
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-border/30 py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="One explicit pipeline, with its limits visible"
          description="Each status below describes repository code, not an implied production benchmark."
        />

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-3">
          {steps.map(({ number, title, description, icon: Icon }) => (
            <article key={number} className="rounded-2xl border border-border/50 bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-white">
                  <Icon className="size-5" />
                </div>
                <span className="text-3xl font-bold text-brand-navy/10">{number}</span>
              </div>
              <h3 className="mt-6 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilityMatrix() {
  return (
    <section id="capabilities" className="scroll-mt-20 bg-accent/30 py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Capability matrix"
          title="Current capabilities"
          description="The canonical source for this matrix is src/config/capabilities.ts."
        />

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
          {CURRENT_CAPABILITY_COUNTS.map((capability) => (
            <article
              key={capability.id}
              className="rounded-2xl border border-border/50 bg-white p-6 text-center shadow-sm"
            >
              <p className="text-4xl font-bold tracking-tight text-brand-navy">{capability.value}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{capability.label}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {capability.definition}
              </p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-4xl text-center text-xs text-muted-foreground">
          Availability depends on the providers you configure.
        </p>

        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-center gap-2">
          {CAPABILITY_STATUSES.map((status) => {
            const presentation = statusPresentation[status];
            const Icon = presentation.icon;
            const count = PUBLIC_CAPABILITIES.filter((capability) => capability.status === status).length;
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}
              >
                <Icon className="size-3.5" />
                {presentation.label} ({count})
              </span>
            );
          })}
        </div>

        <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left">
              <thead className="bg-brand-navy text-white">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider">Capability</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider">Boundary</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider">Source evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {PUBLIC_CAPABILITIES.map((capability) => {
                  const presentation = statusPresentation[capability.status];
                  const Icon = presentation.icon;
                  return (
                    <tr key={capability.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-foreground">{capability.name}</p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                          {capability.summary}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-muted-foreground">
                        {capability.boundary === "oss-core" ? "OSS core" : "Provider adapter"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${presentation.className}`}
                        >
                          <Icon className="size-3" />
                          {presentation.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                          {capability.evidence.map((source) => (
                            <li key={source}>{source}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceBoundary() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid gap-8 rounded-3xl border border-border/50 bg-white p-8 shadow-sm lg:grid-cols-[0.8fr_1.2fr] lg:p-12">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">Evidence boundary</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy">
              No synthetic quality score stands in for provenance.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The runtime computes deterministic claim-level evidence coverage from the persisted
              evidence ledger. Every factual claim must be source-backed before rendering can
              proceed; seller-supplied claims and model inferences remain explicitly labeled.
              Bestdecks does not substitute a subjective quality score for that evidence, and
              generated artifacts still require human review.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SelfHosting() {
  const requirements = [
    { icon: Terminal, label: "Node.js 24.18.0 and pnpm 11.7.0" },
    { icon: Database, label: "A writable local SQLite path" },
    { icon: KeyRound, label: "Your own provider credentials" },
    { icon: Box, label: "A reachable Presenton service for the documented renderer path" },
  ];

  return (
    <section id="self-host" className="scroll-mt-20 bg-brand-navy py-24 text-white lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/55">Self-hosting</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Run the public core with accounts you control.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
            Copy the environment template, provide independent secrets, configure the provider
            adapters you intend to use, then start the local application. See docs/self-hosting.md
            for the security and deployment checklist.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {requirements.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <Icon className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <span className="text-sm text-white/75">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="quickstart" className="rounded-2xl border border-white/10 bg-black/20 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Terminal className="size-4" />
              Local application
            </div>
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              BYOK
            </span>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-5 text-[13px] leading-7 text-emerald-200">
            <code>{`cp -n .env.example .env.local\n# Fill required secrets and provider keys\npnpm install --frozen-lockfile\npnpm doctor\npnpm dev\n# In a second terminal:\npnpm worker`}</code>
          </pre>
          <p className="mt-4 text-xs leading-relaxed text-white/45">
            The doctor command reports configuration presence only. It is not a live provider or
            security verification receipt.
          </p>
        </div>
      </div>
    </section>
  );
}

function DistributionBoundary() {
  return (
    <section id="boundaries" className="scroll-mt-20 py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Distribution boundary"
          title="Open core and managed operations have different jobs"
          description="The open-source version is not feature-crippled. A future managed service would sell operation and scale."
        />

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-emerald-500/25 bg-emerald-50/50 p-7">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700">
              <Code2 className="size-5" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-emerald-700">Public core</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">{OSS_DISTRIBUTION.license}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {OSS_DISTRIBUTION.coreBoundary}
            </p>
            <p className="mt-4 text-sm font-medium text-emerald-900">{OSS_DISTRIBUTION.mode}</p>
          </article>

          <article className="rounded-2xl border border-border/60 bg-accent/30 p-7">
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-navy/8 text-brand-navy">
              <Cloud className="size-5" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Managed service</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Deferred; no public pricing</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {OSS_DISTRIBUTION.cloudBoundary}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              No plan allowance or price is published before measured completed-run cost data exists.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

function FinalSection() {
  return (
    <section className="border-t border-border/30 bg-accent/20 py-20">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <BookOpen className="mx-auto size-7 text-primary" />
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-brand-navy">
          Inspect the contract before you run the pipeline.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Start with the README, self-hosting guide, capability inventory, and release-readiness
          checklist. The documented gaps are part of the product surface.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#capabilities"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-6 py-3 text-sm font-semibold text-white"
          >
            Review capabilities
            <ArrowRight className="size-4" />
          </a>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-6 py-3 text-sm font-semibold text-foreground"
          >
            Open workspace
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/30 bg-white py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <Logo size="md" />
          <p className="mt-2 text-sm text-muted-foreground">
            Open-source research-to-deck infrastructure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#capabilities" className="transition-colors hover:text-foreground">Capabilities</a>
          <a href="#self-host" className="transition-colors hover:text-foreground">Self-host</a>
          <span className="inline-flex items-center gap-1.5 text-foreground/70">
            <Globe className="size-3.5" />
            Apache-2.0
          </span>
        </div>
      </div>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
