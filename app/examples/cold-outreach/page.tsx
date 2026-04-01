import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Download, ExternalLink, Eye, FileText, Sparkles } from "lucide-react";

import { coldOutreachExample, type ExampleDeckSlide } from "@/src/examples/cold-outreach-example";

function renderInlineFormatting(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function roleAccent(role: ExampleDeckSlide["role"]) {
  switch (role) {
    case "cover":
      return "from-cyan-400/30 via-sky-500/12 to-transparent";
    case "tension":
      return "from-rose-400/24 via-orange-500/10 to-transparent";
    case "data":
      return "from-emerald-400/24 via-cyan-500/10 to-transparent";
    case "vision":
      return "from-violet-400/24 via-cyan-500/12 to-transparent";
    case "solution":
      return "from-sky-400/24 via-cyan-500/10 to-transparent";
    case "proof":
      return "from-amber-300/22 via-emerald-400/10 to-transparent";
    case "roi":
      return "from-teal-300/24 via-emerald-500/10 to-transparent";
    case "cta":
      return "from-indigo-400/24 via-cyan-500/10 to-transparent";
    case "about":
      return "from-slate-300/18 via-cyan-500/8 to-transparent";
  }
}

function SlideCanvas({ slide }: { slide: ExampleDeckSlide }) {
  return (
    <section className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${roleAccent(slide.role)}`} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.8) 1px, transparent 1px)",
        backgroundSize: "88px 88px",
      }} />

      <div className="relative flex aspect-[16/9.2] flex-col justify-between px-8 py-8 sm:px-10 sm:py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-100/80">
              <span className="size-1.5 rounded-full bg-cyan-300" />
              {slide.role.replaceAll("_", " ")}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-white/30">Slide</p>
            <p className="mt-1 text-xl font-semibold text-white/85">{slide.id}</p>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] md:items-end">
          <div className="min-w-0">
            <h2 className="max-w-4xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              {slide.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/62 sm:text-lg">
              {slide.subtitle}
            </p>
          </div>

          <div className="space-y-4">
            {slide.keyMetric ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 backdrop-blur-sm">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Key metric</p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-cyan-100">{slide.keyMetric}</p>
              </div>
            ) : null}

            {slide.bullets.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Talking points</p>
                <ul className="mt-3 space-y-3">
                  {slide.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm leading-relaxed text-white/72">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-300" />
                      <span>{renderInlineFormatting(bullet)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ColdOutreachExamplePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.18),_transparent_38%),linear-gradient(180deg,_#040914_0%,_#081120_35%,_#0b1527_100%)] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/console#run-settings"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to run settings
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
            <Sparkles className="size-4" />
            Internal BestDecks example
          </div>
        </div>

        <header className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:items-start">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-200/65">Cold outreach example</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {coldOutreachExample.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/62">
              {coldOutreachExample.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/api/examples/cold-outreach/download?format=pdf"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_-18px_rgba(103,232,249,0.85)] transition-transform hover:-translate-y-0.5"
              >
                <Download className="size-4" />
                Download PDF
              </a>
              <a
                href="/api/examples/cold-outreach/download?format=pptx"
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white/84 transition-colors hover:bg-white/[0.1]"
              >
                <FileText className="size-4" />
                Download PPTX
              </a>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/54">
                <Eye className="size-4" />
                Rendered inside BestDecks
              </span>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-black/20 p-6 backdrop-blur-md">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/32">Deck summary</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Target</p>
                <p className="mt-2 text-base font-semibold text-white/88">{coldOutreachExample.summary.target}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Slides</p>
                <p className="mt-2 text-base font-semibold text-white/88">{coldOutreachExample.summary.slideCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Audience</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/76">{coldOutreachExample.audience}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Generated</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/76">
                  {new Date(coldOutreachExample.generatedAt).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <ul className="mt-5 space-y-3">
              {coldOutreachExample.summary.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-3 text-sm leading-relaxed text-white/68">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>

            <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-white/74">
                Debug fallback
              </summary>
              <div className="mt-3 space-y-2 text-sm text-white/58">
                <p>This stays off the primary UX. Use it only to compare BestDecks against the raw hosted presentation.</p>
                <a
                  href={coldOutreachExample.source.alaiViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-200 hover:text-cyan-100"
                >
                  Open presentation
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </details>
          </aside>
        </header>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-black/15 px-6 py-5 text-sm leading-relaxed text-white/62 backdrop-blur-sm">
          <span className="font-semibold text-white/84">What this page is:</span> a BestDecks-owned viewer for a real generated example.
          <span className="mx-2 text-white/18">|</span>
          <span className="font-semibold text-white/84">What it is not:</span> an embedded third-party app surface.
        </div>

        <div className="mt-10 space-y-8">
          {coldOutreachExample.slides.map((slide) => (
            <SlideCanvas key={slide.id} slide={slide} />
          ))}
        </div>
      </div>
    </main>
  );
}
