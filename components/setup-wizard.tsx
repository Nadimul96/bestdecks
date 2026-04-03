"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Globe,
  LoaderCircle,
  PartyPopper,
  Rocket,
  Eye,
  Sparkles,
  Target,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/logo";
import {
  intentOptions,
  type DeckIntent,
  type Business,
} from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { archetypeExamples, ArchetypePreviewModal } from "@/components/archetype-preview-modal";
import { dispatchRunStart } from "@/lib/run-launch";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface SetupWizardProps {
  currentUser: { name: string; email: string };
  onComplete: () => void;
}

interface WizardState {
  websiteUrl: string;
  companyName: string;
  offerSummary: string;
  targetCustomer: string;
  intent: DeckIntent;
  websitesText: string;
  contactsCsvText: string;
  showCsv: boolean;
}

/* ─────────────────────────────────────────────
   Steps
   ───────────────────────────────────────────── */

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "business", label: "Your Business" },
  { id: "goal", label: "Your Goal" },
  { id: "targets", label: "First Targets" },
  { id: "launch", label: "Launch" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const TOTAL_STEPS = STEPS.length;

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

export function SetupWizard({ currentUser, onComplete }: SetupWizardProps) {
  const { currentBusiness, addBusiness, updateBusiness } =
    useBusinessContext();

  const [step, setStep] = React.useState(0);
  const [crawling, setCrawling] = React.useState(false);
  const [crawlStatus, setCrawlStatus] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [launched, setLaunched] = React.useState(false);
  const [previewArchetype, setPreviewArchetype] = React.useState<string | null>(null);

  // Map intent → archetype for preview lookup
  const intentToArchetype: Record<string, string> = {
    cold_pitch: "cold_outreach",
    post_call: "warm_intro",
    agency_rfp: "agency_proposal",
    investor: "investor_pitch",
    partnership: "warm_intro",
    event_sponsor: "agency_proposal",
    product_demo: "product_launch",
    upsell: "warm_intro",
    board_update: "thought_leadership",
    custom: "cold_outreach",
  };

  const [state, setState] = React.useState<WizardState>({
    websiteUrl: "",
    companyName: "",
    offerSummary: "",
    targetCustomer: "",
    intent: "cold_pitch",
    websitesText: "",
    contactsCsvText: "",
    showCsv: false,
  });

  const stepId = STEPS[step].id;
  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  function update<K extends keyof WizardState>(
    field: K,
    value: WizardState[K],
  ) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  /* ── Navigation guards ── */

  const canAdvance: boolean = (() => {
    switch (stepId) {
      case "welcome":
        return true;
      case "business":
        return state.websiteUrl.length > 0;
      case "goal":
        return !!state.intent;
      case "targets":
        return true;
      case "launch":
        return true;
      default:
        return true;
    }
  })();

  function next() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  /* ── Auto-fill ── */

  async function handleAutofill() {
    if (!state.websiteUrl) return;
    setCrawling(true);
    setCrawlStatus("Crawling your website…");
    try {
      const res = await fetch("/api/onboarding/crawl-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: state.websiteUrl }),
      });

      if (!res.ok || !res.body) {
        toast.error("Couldn\u2019t analyze that website. Fill in the fields manually.");
        setCrawling(false);
        setCrawlStatus(null);
        return;
      }

      // Stream SSE events for real-time progress
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "status") {
              setCrawlStatus(event.message ?? "Analyzing…");
            } else if (event.type === "complete") {
              const sc = event.sellerContext;
              if (sc) {
                setState((prev) => ({
                  ...prev,
                  companyName: sc.companyName ?? prev.companyName,
                  offerSummary: sc.offerSummary ?? prev.offerSummary,
                  targetCustomer: sc.targetCustomer ?? prev.targetCustomer,
                }));
                toast.success("We analyzed your website and filled in the details.");
              }
            } else if (event.type === "error") {
              toast.error(event.message ?? "Analysis failed. Fill in the fields manually.");
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCrawling(false);
      setCrawlStatus(null);
    }
  }

  /* ── Launch ── */

  async function handleLaunch() {
    setSaving(true);
    try {
      // 1. Save seller context
      await fetch("/api/onboarding/seller-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: state.websiteUrl,
          companyName: state.companyName,
          offerSummary: state.offerSummary,
          targetCustomer: state.targetCustomer,
          desiredOutcome: "",
          servicesText: "",
          differentiatorsText: "",
          proofPointsText: "",
          constraintsText: "",
        }),
      });

      // 2. Save questionnaire with archetype derived from intent
      const archetypeMap: Record<DeckIntent, string> = {
        cold_pitch: "cold_outreach",
        post_call: "warm_intro",
        agency_rfp: "agency_proposal",
        investor: "investor_pitch",
        partnership: "warm_intro",
        event_sponsor: "agency_proposal",
        product_demo: "product_launch",
        upsell: "warm_intro",
        board_update: "thought_leadership",
        custom: "cold_outreach",
      };
      await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetype: archetypeMap[state.intent] }),
      });

      // 3. If targets were provided, create a run
      const urls = state.websitesText
        .split("\n")
        .filter((l) => l.trim().length > 0);

      let runId: string | null = null;

      if (urls.length > 0) {
        const runResponse = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websitesText: state.websitesText,
            contactsCsvText: state.contactsCsvText || undefined,
            autoLaunch: false,
          }),
        });

        const runPayload = (await runResponse.json().catch(() => null)) as
          | { runId?: string; error?: string }
          | null;

        if (!runResponse.ok || !runPayload?.runId) {
          throw new Error(
            runPayload?.error ?? "Failed to create the initial run.",
          );
        }

        runId = runPayload.runId;
      }

      // 4. Create or update the business entity in context
      const now = new Date().toISOString();
      if (currentBusiness && currentBusiness.id !== "default") {
        updateBusiness(currentBusiness.id, {
          name: state.companyName || currentBusiness.name,
          websiteUrl: state.websiteUrl,
          setupComplete: true,
          updatedAt: now,
        });
      } else {
        const newBiz: Business = {
          id: crypto.randomUUID(),
          name: state.companyName || "My Business",
          websiteUrl: state.websiteUrl,
          setupComplete: true,
          createdAt: now,
          updatedAt: now,
        };
        addBusiness(newBiz);

        try {
          await fetch("/api/businesses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newBiz),
          });
        } catch {
          // context state is already updated
        }
      }

      // 5. Show celebration, then redirect
      setLaunched(true);

      if (runId) {
        dispatchRunStart(runId);
      }

      setTimeout(() => {
        if (urls.length > 0) {
          toast.success(
            `Setup complete! Launched a run with ${urls.length} target${urls.length > 1 ? "s" : ""}.`,
          );
        } else {
          toast.success("Setup complete! Add targets whenever you\u2019re ready.");
        }
        window.location.hash = "overview";
        onComplete();
      }, 2400);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Derived values ── */

  const websiteCount = state.websitesText
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  const firstName = currentUser.name?.split(" ")[0];

  /* ── Render ── */

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Progress bar ── */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-12 sm:px-8">
          {/* ── Step counter + skip ── */}
          <div className="mb-8 flex items-center justify-between text-xs text-muted-foreground animate-fade-in">
            <span>
              {stepId !== "welcome" ? `Step ${step + 1} of ${TOTAL_STEPS}` : ""}
            </span>
            <div className="flex items-center gap-3">
              {stepId !== "welcome" && (
                <div className="flex items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <div
                      key={s.id}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-colors",
                        i <= step ? "bg-primary" : "bg-muted-foreground/20",
                      )}
                    />
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onComplete}
                className="gap-1.5 text-[11px]"
              >
                {stepId === "welcome" ? "Skip setup" : "Set up later"}
              </Button>
            </div>
          </div>

          {/* ── Step content ── */}
          <div className="flex-1">
            {/* ═══════ Step 1: Welcome ═══════ */}
            {stepId === "welcome" && (
              <div className="flex min-h-[60vh] flex-col items-center justify-center text-center animate-fade-up">
                <Logo size="lg" className="mb-8" />

                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Welcome{firstName ? `, ${firstName}` : ""} to BestDecks
                </h1>

                <p className="mt-4 max-w-md text-base text-muted-foreground leading-relaxed">
                  AI-powered personalized pitch decks for every prospect.
                  Let&apos;s get you set up in under two minutes.
                </p>

                <Button
                  size="lg"
                  className="mt-10 h-12 px-8 text-base gap-2"
                  onClick={next}
                >
                  Get Started
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}

            {/* ═══════ Step 2: Your Business ═══════ */}
            {stepId === "business" && (
              <div className="space-y-8 animate-fade-up">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Tell us about your business
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We&apos;ll use this to personalize every deck we generate for
                    you.
                  </p>
                </div>

                {/* Hero card — website input + auto-fill */}
                <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card">
                  <div
                    className="pointer-events-none absolute -right-20 -top-20 size-40 rounded-full opacity-40"
                    style={{
                      background:
                        "radial-gradient(circle, oklch(0.55 0.18 255 / 20%), transparent 70%)",
                    }}
                  />
                  <div className="relative p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Sparkles className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Start with your website
                        </p>
                        <p className="text-xs text-muted-foreground">
                          We&apos;ll analyze it and auto-fill everything below
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                          value={state.websiteUrl}
                          onChange={(e) => update("websiteUrl", e.target.value)}
                          placeholder="https://yourcompany.com"
                          className="h-11 pl-10 text-sm"
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleAutofill()
                          }
                          autoFocus
                        />
                      </div>
                      <Button
                        onClick={handleAutofill}
                        disabled={crawling || !state.websiteUrl}
                        className="h-11 px-5"
                      >
                        {crawling ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Zap className="size-4" />
                            Auto-fill
                          </>
                        )}
                      </Button>
                    </div>

                    {crawling && (
                      <div className="mt-3 flex items-center gap-2 text-xs animate-fade-in">
                        <div className="h-1.5 flex-1 max-w-[240px] rounded-full bg-primary/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{
                              animation: "shimmer 2s ease-in-out infinite",
                              width: "60%",
                            }}
                          />
                        </div>
                        <span className="text-muted-foreground text-[12px]">
                          {crawlStatus ?? "Starting…"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-filled fields */}
                <div className="rounded-xl border border-border/50 bg-card p-6 card-elevated">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-foreground">
                      Confirm your details
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Edit anything that doesn&apos;t look right.
                    </p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        Company name
                      </label>
                      <Input
                        value={state.companyName}
                        onChange={(e) => update("companyName", e.target.value)}
                        placeholder="Acme Agency"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        Who do you sell to?
                      </label>
                      <Input
                        value={state.targetCustomer}
                        onChange={(e) =>
                          update("targetCustomer", e.target.value)
                        }
                        placeholder="B2B SaaS founders, $1M-$10M ARR"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-medium text-foreground">
                        What do you offer?
                      </label>
                      <Textarea
                        value={state.offerSummary}
                        onChange={(e) => update("offerSummary", e.target.value)}
                        placeholder="We build high-converting landing pages for SaaS companies that want to 2-3x their demo requests."
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════ Step 3: Your Goal ═══════ */}
            {stepId === "goal" && (
              <div className="space-y-8 animate-fade-up">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    What are you building decks for?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This shapes how we research targets and frame your pitch.
                  </p>
                </div>

                <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                  {intentOptions.map((opt) => {
                    const archetype = intentToArchetype[opt.value];
                    const example = archetype ? archetypeExamples[archetype] : undefined;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update("intent", opt.value)}
                        className={cn(
                          "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                          state.intent === opt.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                            : "border-border/60 bg-card hover:border-border hover:shadow-sm",
                        )}
                      >
                        <span className="mt-0.5 text-lg shrink-0">
                          {opt.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {opt.description}
                          </p>
                          {example && (
                            <span
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewArchetype(archetype);
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                            >
                              <Eye className="size-3" />
                              Preview ({example.slides.length} slides)
                            </span>
                          )}
                        </div>
                        {state.intent === opt.value && (
                          <CheckCircle2 className="absolute right-2.5 top-2.5 size-4 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══════ Step 4: First Targets ═══════ */}
            {stepId === "targets" && (
              <div className="space-y-8 animate-fade-up">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Add your first targets
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Paste the websites of companies you want decks for. You can
                    always add more later.
                  </p>
                </div>

                <div className="rounded-xl border border-border/50 bg-card p-6 card-elevated">
                  <div className="mb-4 flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">
                      Website URLs
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {websiteCount > 0
                        ? `${websiteCount} target${websiteCount > 1 ? "s" : ""}`
                        : "One URL per line"}
                    </span>
                  </div>
                  <Textarea
                    value={state.websitesText}
                    onChange={(e) => update("websitesText", e.target.value)}
                    placeholder={`https://acmeplumbing.com\nhttps://northshoreclinic.com\nhttps://sunsetlogistics.io`}
                    className="min-h-[160px] resize-none font-mono text-xs leading-relaxed"
                    autoFocus
                  />
                </div>

                {/* Inline CSV -- collapsible */}
                <div className="rounded-xl border border-border/40 bg-card">
                  <button
                    type="button"
                    onClick={() => update("showCsv", !state.showCsv)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/30 rounded-xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Have a CSV with contacts?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Optional -- personalizes greetings and CTAs per person
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        state.showCsv && "rotate-180",
                      )}
                    />
                  </button>

                  {state.showCsv && (
                    <div className="border-t border-border/40 px-5 py-4 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-foreground">
                            Contacts CSV
                          </label>
                          <span className="text-xs text-muted-foreground">
                            Optional
                          </span>
                        </div>
                        <Textarea
                          value={state.contactsCsvText}
                          onChange={(e) =>
                            update("contactsCsvText", e.target.value)
                          }
                          placeholder={`websiteUrl,firstName,lastName,role,email\nhttps://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com\nhttps://northshoreclinic.com,Marcus,Reed,Director,marcus@northshoreclinic.com`}
                          className="min-h-[120px] resize-none font-mono text-xs leading-relaxed"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Columns:{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                          websiteUrl, firstName, lastName, role, email,
                          campaignGoal, notes
                        </code>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════ Step 5: Launch ═══════ */}
            {stepId === "launch" && !launched && (
              <div className="space-y-8 animate-fade-up">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    You&apos;re all set
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Here&apos;s a summary of your setup. Hit launch when
                    you&apos;re ready.
                  </p>
                </div>

                {/* Summary cards */}
                <div className="space-y-4">
                  {/* Business */}
                  <div className="rounded-xl border border-border/50 bg-card p-5 card-elevated">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                        <Globe className="size-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Your Business
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm">
                      {state.companyName && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground w-24 shrink-0">
                            Company
                          </span>
                          <span className="text-foreground">
                            {state.companyName}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">
                          Website
                        </span>
                        <span className="text-foreground truncate">
                          {state.websiteUrl}
                        </span>
                      </div>
                      {state.targetCustomer && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground w-24 shrink-0">
                            Audience
                          </span>
                          <span className="text-foreground">
                            {state.targetCustomer}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Goal */}
                  <div className="rounded-xl border border-border/50 bg-card p-5 card-elevated">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                        <Target className="size-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Your Goal
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-lg">
                        {intentOptions.find((o) => o.value === state.intent)
                          ?.emoji ?? ""}
                      </span>
                      <span className="text-foreground">
                        {intentOptions.find((o) => o.value === state.intent)
                          ?.label ?? state.intent}
                      </span>
                    </div>
                  </div>

                  {/* Targets */}
                  <div className="rounded-xl border border-border/50 bg-card p-5 card-elevated">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                        <Upload className="size-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        First Targets
                      </p>
                    </div>
                    <p className="text-sm text-foreground">
                      {websiteCount > 0
                        ? `${websiteCount} target${websiteCount > 1 ? "s" : ""} ready to go`
                        : "No targets yet -- you can add them later from the Targets page."}
                    </p>
                  </div>
                </div>

                {/* Launch CTA */}
                <Button
                  size="lg"
                  className="w-full h-12 text-base gap-2"
                  onClick={handleLaunch}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle className="size-5 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Rocket className="size-5" />
                      {websiteCount > 0
                        ? `Launch your first run with ${websiteCount} target${websiteCount > 1 ? "s" : ""}`
                        : "Finish setup"}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* ═══════ Celebration ═══════ */}
            {stepId === "launch" && launched && (
              <div className="flex min-h-[60vh] flex-col items-center justify-center text-center animate-scale-in">
                <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 mb-6">
                  <PartyPopper className="size-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  You&apos;re all set!
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {websiteCount > 0
                    ? "Your first run is underway. Redirecting you to the dashboard..."
                    : "Redirecting you to the dashboard..."}
                </p>
              </div>
            )}
          </div>

          {/* ── Bottom navigation ── */}
          {stepId !== "welcome" && stepId !== "launch" && (
            <div className="mt-12 flex items-center justify-between border-t border-border/40 pt-6">
              <Button
                variant="ghost"
                onClick={back}
                className="text-muted-foreground gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={next}
                >
                  Skip
                </Button>
                <Button
                  onClick={next}
                  disabled={!canAdvance}
                  className="gap-1.5"
                >
                  Continue
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Archetype preview modal — triggered from intent cards */}
      <ArchetypePreviewModal
        archetype={previewArchetype ?? ""}
        open={previewArchetype !== null}
        onClose={() => setPreviewArchetype(null)}
      />
    </div>
  );
}
