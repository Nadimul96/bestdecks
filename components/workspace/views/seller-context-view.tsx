"use client";

import * as React from "react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Globe,
  LoaderCircle,
  Plus,
  Save,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { randomUUID } from "@/lib/utils-crypto";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import {
  viewMeta,
  defaultSellerKnowledge,
  pricingModelOptions,
  type SellerKnowledgeForm,
  type CaseStudyForm,
  type ObjectionForm,
} from "@/lib/workspace-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";
import {
  computeSellerContextCompletion,
  type SellerContextCompletion,
  type SellerKnowledge,
} from "@/src/domain/schemas";

const meta = viewMeta["seller-context"];

type SellerKnowledgeResponse = Partial<SellerKnowledge> & {
  facebookUrl?: string;
  twitterUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
};

/* ══════════════════════════════════════════════════════
   Tab types
   ══════════════════════════════════════════════════════ */

type ContextTab = "offer" | "proof" | "edge" | "guardrails";

const contextTabs: Array<{ key: ContextTab; label: string; icon: React.ElementType }> = [
  { key: "offer", label: "Your Offer", icon: Target },
  { key: "proof", label: "Your Proof", icon: Trophy },
  { key: "edge", label: "Sales Edge", icon: Swords },
  { key: "guardrails", label: "Guardrails", icon: Shield },
];

/* ══════════════════════════════════════════════════════
   Sliding Tab Bar (reuses pattern from run-settings)
   ══════════════════════════════════════════════════════ */

function SlidingTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ContextTab;
  onTabChange: (key: ContextTab) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setPillStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
      transition: "left 0.3s cubic-bezier(0.4,0,0.2,1), width 0.3s cubic-bezier(0.4,0,0.2,1)",
    });
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      className="relative flex rounded-xl bg-muted/50 p-1"
    >
      <div
        className="absolute top-1 h-[calc(100%-8px)] rounded-lg bg-background shadow-md"
        style={pillStyle}
      />
      {contextTabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          data-tab={key}
          onClick={() => onTabChange(key)}
          className={cn(
            "relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
            activeTab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Seller-context completion
   ══════════════════════════════════════════════════════ */

function SellerContextCompletionSummary({
  completion,
  suggestions,
}: {
  completion: SellerContextCompletion;
  suggestions: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.03] p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 size-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Seller context coverage</p>
          <p className="text-[11px] text-muted-foreground">Tracks input presence only; it does not predict results.</p>
        </div>
        <div className="text-3xl font-black tabular-nums tracking-tight text-primary">
          {completion.percentage}<span className="text-sm font-medium text-muted-foreground/70">%</span>
        </div>
      </div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60 mb-2"
        role="progressbar"
        aria-label="Seller context checks completed"
        aria-valuemin={0}
        aria-valuemax={completion.total}
        aria-valuenow={completion.completed}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-700"
          style={{ width: `${completion.percentage}%` }}
        />
      </div>
      <p className="mb-3 text-[11px] tabular-nums text-muted-foreground">
        {completion.completed} of {completion.total} planning-input checks complete
      </p>
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          {suggestions.slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-emerald-500 font-bold mt-px">+</span>
              <span className="text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Case Study Card
   ══════════════════════════════════════════════════════ */

function CaseStudyCard({
  study,
  onChange,
  onRemove,
}: {
  study: CaseStudyForm;
  onChange: (updated: CaseStudyForm) => void;
  onRemove: () => void;
}) {
  function upd(field: keyof CaseStudyForm, value: string) {
    onChange({ ...study, [field]: value });
  }

  return (
    <div className="relative rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        aria-label="Remove case study"
      >
        <X className="size-3.5" />
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldGroup label="Client name">
          <Input
            value={study.clientName}
            onChange={(e) => upd("clientName", e.target.value)}
            placeholder="Acme Corp (or 'Series B fintech')"
            className="h-9 text-[13px]"
          />
        </FieldGroup>
        <FieldGroup label="Industry">
          <Input
            value={study.industry}
            onChange={(e) => upd("industry", e.target.value)}
            placeholder="SaaS, FinTech, Healthcare…"
            className="h-9 text-[13px]"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Their challenge" hint="What problem did they have?">
        <Textarea
          value={study.challenge}
          onChange={(e) => upd("challenge", e.target.value)}
          placeholder="Qualified visitors left before requesting a demo"
          className="min-h-[60px] resize-none text-[13px]"
        />
      </FieldGroup>

      <FieldGroup label="Your result" hint="Use only an outcome you can substantiate">
        <Textarea
          value={study.results}
          onChange={(e) => upd("results", e.target.value)}
          placeholder="Describe the documented outcome and where it was measured"
          className="min-h-[60px] resize-none text-[13px]"
        />
      </FieldGroup>

      <FieldGroup label="Testimonial quote" hint="Optional — extremely powerful if you have one">
        <Textarea
          value={study.testimonialQuote}
          onChange={(e) => upd("testimonialQuote", e.target.value)}
          placeholder="Paste an approved customer quote with attribution"
          className="min-h-[50px] resize-none text-[13px]"
        />
      </FieldGroup>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════ */

function formToKnowledge(form: SellerKnowledgeForm): SellerKnowledge {
  return {
    websiteUrl: form.websiteUrl || undefined,
    companyName: form.companyName || undefined,
    logoUrl: form.logoUrl || undefined,
    tagline: form.tagline || undefined,
    foundedYear: form.foundedYear ? parseInt(form.foundedYear) : undefined,
    teamSize: form.teamSize || undefined,
    headquarters: form.headquarters || undefined,
    offerSummary: form.offerSummary || "",
    services: form.servicesText.split("\n").map((s) => s.trim()).filter(Boolean),
    differentiators: form.differentiatorsText.split("\n").map((s) => s.trim()).filter(Boolean),
    targetCustomer: form.targetCustomer || "",
    desiredOutcome: form.desiredOutcome || "",
    pricingModel: (form.pricingModel || undefined) as SellerKnowledge["pricingModel"],
    pricingContext: form.pricingContext || undefined,
    proofPoints: form.proofPointsText.split("\n").map((s) => s.trim()).filter(Boolean),
    caseStudies: form.caseStudies.filter((cs) => cs.clientName.trim()).map((cs) => ({
      id: cs.id,
      clientName: cs.clientName.trim(),
      industry: cs.industry.trim() || "General",
      challenge: cs.challenge.trim(),
      solution: cs.solution.trim(),
      results: cs.results.trim(),
      metrics: cs.metricsText
        .split("\n")
        .map((line) => {
          const [label, value] = line.split(":").map((s) => s.trim());
          return label && value ? { label, value } : null;
        })
        .filter(Boolean) as Array<{ label: string; value: string }>,
      testimonialQuote: cs.testimonialQuote.trim() || undefined,
    })),
    clientLogos: form.clientLogosText.split("\n").map((s) => s.trim()).filter(Boolean),
    awards: form.awardsText.split("\n").map((s) => s.trim()).filter(Boolean),
    commonObjections: form.commonObjections
      .filter((o) => o.objection.trim())
      .map((o) => ({ objection: o.objection.trim(), response: o.response.trim() })),
    competitorNotes: form.competitorNotes || undefined,
    salesPlaybook: form.salesPlaybook || undefined,
    constraints: form.constraintsText.split("\n").map((s) => s.trim()).filter(Boolean),
  };
}

function computeSuggestions(completion: SellerContextCompletion): string[] {
  const { checks } = completion;
  const suggestions: string[] = [];
  if (!checks.hasOfferSummary) suggestions.push("Add an elevator pitch to complete the offer-summary check");
  if (!checks.hasAtLeastTwoServices) suggestions.push("List at least two deliverables");
  if (!checks.hasAtLeastTwoDifferentiators) suggestions.push("List at least two differentiators");
  if (!checks.hasTargetCustomer) suggestions.push("Describe your target customer");
  if (!checks.hasDesiredOutcome) suggestions.push("State the desired next step or outcome");
  if (!checks.hasAtLeastThreeProofPoints) suggestions.push("Add at least three proof points");
  if (!checks.hasCaseStudyWithChallengeAndResult) suggestions.push("Add a named case study with its challenge and result");
  if (!checks.hasObjectionWithResponse) suggestions.push("Add an objection and your response");
  if (!checks.hasPricingModel) suggestions.push("Select a pricing model");
  if (!checks.hasCompetitorNotes) suggestions.push("Add competitor context");
  return suggestions;
}

/* ══════════════════════════════════════════════════════
   Main View
   ══════════════════════════════════════════════════════ */

export function SellerContextView() {
  const { refreshBusinesses } = useBusinessContext();
  const [form, setForm] = React.useState<SellerKnowledgeForm>(defaultSellerKnowledge());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<ContextTab>("offer");

  // Brief state
  const [briefMd, setBriefMd] = React.useState<string | null>(null);
  const [briefEdited, setBriefEdited] = React.useState("");
  const [showBrief, setShowBrief] = React.useState(false);
  const [briefSaving, setBriefSaving] = React.useState(false);
  const [briefDirty, setBriefDirty] = React.useState(false);

  const newBusinessMarkerRef = React.useRef<string | null | undefined>(undefined);

  // Load existing data on mount
  React.useEffect(() => {
    if (newBusinessMarkerRef.current === undefined) {
      newBusinessMarkerRef.current = sessionStorage.getItem("bestdecks_new_business");
    }
    if (newBusinessMarkerRef.current) {
      sessionStorage.removeItem("bestdecks_new_business");
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const [ctxRes, briefRes] = await Promise.all([
          fetch("/api/onboarding/seller-context", { signal: controller.signal }),
          fetch("/api/onboarding/seller-brief", { signal: controller.signal }),
        ]);
        if (ctxRes.ok) {
          const data = (await ctxRes.json()) as SellerKnowledgeResponse;
          if (data) {
            setForm((prev) => ({
              ...prev,
              websiteUrl: data.websiteUrl ?? prev.websiteUrl,
              companyName: data.companyName ?? prev.companyName,
              logoUrl: data.logoUrl ?? prev.logoUrl,
              tagline: data.tagline ?? prev.tagline,
              foundedYear: data.foundedYear ? String(data.foundedYear) : prev.foundedYear,
              teamSize: data.teamSize ?? prev.teamSize,
              headquarters: data.headquarters ?? prev.headquarters,
              offerSummary: data.offerSummary ?? prev.offerSummary,
              servicesText: Array.isArray(data.services) ? data.services.join("\n") : prev.servicesText,
              differentiatorsText: Array.isArray(data.differentiators) ? data.differentiators.join("\n") : prev.differentiatorsText,
              targetCustomer: data.targetCustomer ?? prev.targetCustomer,
              desiredOutcome: data.desiredOutcome ?? prev.desiredOutcome,
              pricingModel: data.pricingModel ?? prev.pricingModel,
              pricingContext: data.pricingContext ?? prev.pricingContext,
              proofPointsText: Array.isArray(data.proofPoints) ? data.proofPoints.join("\n") : prev.proofPointsText,
              caseStudies: Array.isArray(data.caseStudies) ? data.caseStudies.map((cs) => ({
                id: cs.id || randomUUID(),
                clientName: cs.clientName ?? "",
                industry: cs.industry ?? "",
                challenge: cs.challenge ?? "",
                solution: cs.solution ?? "",
                results: cs.results ?? "",
                metricsText: Array.isArray(cs.metrics) ? cs.metrics.map((m) => `${m.label}: ${m.value}`).join("\n") : "",
                testimonialQuote: cs.testimonialQuote ?? "",
              })) : prev.caseStudies,
              clientLogosText: Array.isArray(data.clientLogos) ? data.clientLogos.join("\n") : prev.clientLogosText,
              awardsText: Array.isArray(data.awards) ? data.awards.join("\n") : prev.awardsText,
              commonObjections: Array.isArray(data.commonObjections) ? data.commonObjections.map((o) => ({
                objection: o.objection ?? "",
                response: o.response ?? "",
              })) : prev.commonObjections,
              competitorNotes: data.competitorNotes ?? prev.competitorNotes,
              salesPlaybook: data.salesPlaybook ?? prev.salesPlaybook,
              constraintsText: Array.isArray(data.constraints) ? data.constraints.join("\n") : prev.constraintsText,
              facebookUrl: data.facebookUrl ?? prev.facebookUrl,
              twitterUrl: data.twitterUrl ?? prev.twitterUrl,
              instagramUrl: data.instagramUrl ?? prev.instagramUrl,
              tiktokUrl: data.tiktokUrl ?? prev.tiktokUrl,
            }));
          }
        }
        if (briefRes.ok) {
          const data = await briefRes.json();
          if (data.markdown) {
            setBriefMd(data.markdown);
            setBriefEdited(data.markdown);
          }
        }
      } catch {
        // Non-blocking
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  function update(field: keyof SellerKnowledgeForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    try {
      const knowledge = formToKnowledge(form);
      const res = await fetch("/api/onboarding/seller-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(knowledge),
      });
      if (res.ok) {
        toast.success("Business context saved.");
        await refreshBusinesses();
        return true;
      } else {
        toast.error("Failed to save. Please try again.");
        return false;
      }
    } catch {
      toast.error("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    if (!await handleSave()) return;
    window.location.hash = "run-settings";
    // Scroll to top after hash navigation
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function handleSaveBrief() {
    setBriefSaving(true);
    try {
      const res = await fetch("/api/onboarding/seller-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: briefEdited }),
      });
      if (res.ok) { setBriefMd(briefEdited); setBriefDirty(false); toast.success("Brief saved."); }
      else { toast.error("Failed to save brief."); }
    } catch { toast.error("Network error."); }
    finally { setBriefSaving(false); }
  }

  // Case study CRUD
  function addCaseStudy() {
    setForm((prev) => ({
      ...prev,
      caseStudies: [...prev.caseStudies, {
        id: randomUUID(),
        clientName: "", industry: "", challenge: "", solution: "", results: "",
        metricsText: "", testimonialQuote: "",
      }],
    }));
  }

  function updateCaseStudy(index: number, updated: CaseStudyForm) {
    setForm((prev) => ({
      ...prev,
      caseStudies: prev.caseStudies.map((cs, i) => (i === index ? updated : cs)),
    }));
  }

  function removeCaseStudy(index: number) {
    setForm((prev) => ({
      ...prev,
      caseStudies: prev.caseStudies.filter((_, i) => i !== index),
    }));
  }

  // Objection CRUD
  function addObjection() {
    setForm((prev) => ({
      ...prev,
      commonObjections: [...prev.commonObjections, { objection: "", response: "" }],
    }));
  }

  function updateObjection(index: number, field: keyof ObjectionForm, value: string) {
    setForm((prev) => ({
      ...prev,
      commonObjections: prev.commonObjections.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    }));
  }

  function removeObjection(index: number) {
    setForm((prev) => ({
      ...prev,
      commonObjections: prev.commonObjections.filter((_, i) => i !== index),
    }));
  }

  // Completion reports literal field-presence checks, not a proposal rating.
  const knowledge = formToKnowledge(form);
  const completion = computeSellerContextCompletion(knowledge);
  const suggestions = computeSuggestions(completion);

  if (loading) {
    return (
      <ViewLayout eyebrow={meta.eyebrow} title={meta.title} description={meta.description}>
        <div className="space-y-5">
          <Skeleton className="h-[120px] w-full rounded-2xl" />
          <Skeleton className="h-[44px] w-full rounded-xl" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout
      eyebrow="YOUR BUSINESS"
      title="Your Offer"
      description="Seller context becomes planning input. Specific, verifiable details produce more grounded drafts."
      headerGradient
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><LoaderCircle className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save context</>}
        </Button>
      }
    >
      {/* Seller website anchor. Automatic analysis is intentionally unavailable. */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-blue-500/[0.03] to-violet-500/[0.04]">
        <div className="pointer-events-none absolute -right-20 -top-20 size-40 rounded-full opacity-40" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 255 / 20%), transparent 70%)" }} />
        <div className="pointer-events-none absolute -left-16 -bottom-16 size-32 rounded-full opacity-25" style={{ background: "radial-gradient(circle, oklch(0.6 0.15 290 / 25%), transparent 70%)" }} />
        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Seller website</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Automatic analysis is paused until it runs as a durable, resumable worker job. Enter the details below.</p>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="yourcompany.com" className="h-11 pl-10 text-[14px] bg-background/80" />
                </div>
                <Button disabled title="Automatic analysis requires a future durable worker job." className="h-11 px-5 gap-2">
                  <Sparkles className="size-4" /> Manual entry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seller-context completion */}
      <div>
        <SellerContextCompletionSummary completion={completion} suggestions={suggestions} />
      </div>

      {/* ═══ Tab Navigation ═══ */}
      <SlidingTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ═══ Tab Content ═══ */}

      {/* ── YOUR OFFER ── */}
      {activeTab === "offer" && (
        <div className="space-y-5 animate-fade-in">
          <SectionCard title="Identity" description="Seller identity supplied to the planner.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Company name">
                <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="Acme Agency" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Tagline" hint="Optional">
                <Input value={form.tagline} onChange={(e) => update("tagline", e.target.value)} placeholder="We build things that sell" className="h-10" />
              </FieldGroup>
            </div>
          </SectionCard>

          <SectionCard title="Your Pitch" description="Seller-supplied positioning available to the planner. Keep it specific and supportable.">
            <FieldGroup label="Elevator pitch" hint="One sentence — if a stranger asked what you do">
              <Textarea value={form.offerSummary} onChange={(e) => update("offerSummary", e.target.value)} placeholder="We design and implement landing pages for B2B software teams." className="min-h-[80px] resize-none" />
            </FieldGroup>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FieldGroup label="What you deliver" hint="One per line — not categories, specific deliverables">
                <Textarea value={form.servicesText} onChange={(e) => update("servicesText", e.target.value)} placeholder={`Landing-page strategy\nDesign and implementation\nMeasurement plan`} className="min-h-[110px] resize-none" />
              </FieldGroup>
              <FieldGroup label="Why you win" hint="One per line — what makes you the obvious choice?">
                <Textarea value={form.differentiatorsText} onChange={(e) => update("differentiatorsText", e.target.value)} placeholder={`B2B software specialization\nDocumented launch portfolio\nMeasured results available on request`} className="min-h-[110px] resize-none" />
              </FieldGroup>
            </div>
          </SectionCard>

          <SectionCard title="Your Customer" description="The more specific your ICP, the better the AI can match pitch angles to each target.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Ideal customer" hint="Role, company type, size">
                <Input value={form.targetCustomer} onChange={(e) => update("targetCustomer", e.target.value)} placeholder="VP of Marketing at B2B SaaS, $5M-$50M ARR" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Desired outcome" hint="What should happen after they read the deck?">
                <Input value={form.desiredOutcome} onChange={(e) => update("desiredOutcome", e.target.value)} placeholder="Book a 30-minute discovery call" className="h-10" />
              </FieldGroup>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── YOUR PROOF ── */}
      {activeTab === "proof" && (
        <div className="space-y-5 animate-fade-in">
          <SectionCard
            title="Case Studies"
            description="Approved seller evidence the planner may use when it is relevant to the target."
          >
            <div className="space-y-4">
              {form.caseStudies.map((cs, i) => (
                <CaseStudyCard
                  key={cs.id}
                  study={cs}
                  onChange={(updated) => updateCaseStudy(i, updated)}
                  onRemove={() => removeCaseStudy(i)}
                />
              ))}
              <Button variant="outline" onClick={addCaseStudy} className="w-full h-11 gap-2 border-dashed">
                <Plus className="size-4" />
                {form.caseStudies.length === 0 ? "Add your first case study" : "Add another case study"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Credibility Signals" description="Seller-supplied proof available to the evidence-aware planner.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Proof points" hint="One per line — retain evidence for every claim">
                <Textarea value={form.proofPointsText} onChange={(e) => update("proofPointsText", e.target.value)} placeholder={`Paste a sourced customer result\nList an approved customer reference\nAdd a documented third-party rating`} className="min-h-[100px] resize-none" />
              </FieldGroup>
              <FieldGroup label="Awards & press" hint="One per line">
                <Textarea value={form.awardsText} onChange={(e) => update("awardsText", e.target.value)} placeholder={`List a verified award\nAdd a publication and source\nRecord an approved partner designation`} className="min-h-[100px] resize-none" />
              </FieldGroup>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── SALES EDGE ── */}
      {activeTab === "edge" && (
        <div className="space-y-5 animate-fade-in">
          <SectionCard
            title="Objections"
            description="Approved objection handling the planner may use when it fits the target and evidence."
          >
            <div className="space-y-3">
              {form.commonObjections.map((obj, i) => (
                <div key={i} className="relative grid gap-3 sm:grid-cols-2 rounded-lg border border-border/40 bg-card p-3">
                  <button type="button" onClick={() => removeObjection(i)} className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label="Remove">
                    <X className="size-3" />
                  </button>
                  <FieldGroup label="They say…">
                    <Input value={obj.objection} onChange={(e) => updateObjection(i, "objection", e.target.value)} placeholder="Too expensive compared to freelancers" className="h-9 text-[13px]" />
                  </FieldGroup>
                  <FieldGroup label="You respond…">
                    <Input value={obj.response} onChange={(e) => updateObjection(i, "response", e.target.value)} placeholder="Propose a reversible pilot with clear success criteria" className="h-9 text-[13px]" />
                  </FieldGroup>
                </div>
              ))}
              <Button variant="outline" onClick={addObjection} className="w-full h-10 gap-2 border-dashed text-[13px]">
                <Plus className="size-3.5" />
                Add objection
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Competitive Context" description="Seller-supplied context only; comparative claims still require support.">
            <FieldGroup label="Competitor notes" hint="Who you compete with and why clients choose you">
              <Textarea value={form.competitorNotes} onChange={(e) => update("competitorNotes", e.target.value)} placeholder="Describe competitors and differentiation using supportable, current facts." className="min-h-[100px] resize-none" />
            </FieldGroup>
          </SectionCard>

          <SectionCard title="Pricing & Process" description="Optional seller context the planner may use to frame an appropriate call to action.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Pricing model">
                <select
                  value={form.pricingModel}
                  onChange={(e) => update("pricingModel", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {pricingModelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Typical range" hint="Helps frame the CTA appropriately">
                <Input value={form.pricingContext} onChange={(e) => update("pricingContext", e.target.value)} placeholder="$5K–$25K per project" className="h-10" />
              </FieldGroup>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── GUARDRAILS ── */}
      {activeTab === "guardrails" && (
        <div className="space-y-5 animate-fade-in">
          <SectionCard title="Content Rules" description="Things every deck must include or must never mention.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Constraints" hint="One per line — things to avoid">
                <Textarea value={form.constraintsText} onChange={(e) => update("constraintsText", e.target.value)} placeholder={`Don't mention pricing in decks\nAvoid competitor names\nNo claims without data`} className="min-h-[100px] resize-none" />
              </FieldGroup>
              <FieldGroup label="Sales playbook notes" hint="How your team sells">
                <Textarea value={form.salesPlaybook} onChange={(e) => update("salesPlaybook", e.target.value)} placeholder="Lead with the prospect's pain point. Always reference case studies. Never cold-pitch pricing." className="min-h-[100px] resize-none" />
              </FieldGroup>
            </div>
          </SectionCard>

          {/* Business intelligence brief */}
          <div className="rounded-xl border border-border/40 bg-card">
            <button type="button" onClick={() => setShowBrief(!showBrief)} className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">Business intelligence brief</p>
                  <p className="text-[11px] text-muted-foreground">
                    {briefMd ? "Saved operator brief — edit to refine" : "Optional operator-authored context"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {briefMd && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">Saved</span>}
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showBrief && "rotate-180")} />
              </div>
            </button>
            {showBrief && (
              <div className="border-t border-border/40 px-5 py-4">
                {!briefMd ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileText className="size-8 text-muted-foreground mb-2" />
                    <p className="text-[13px] font-medium">No brief yet</p>
                    <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">No separate brief is saved. The seller context above remains the source of truth.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-muted-foreground">This document feeds all deck personalization. Edit freely.</p>
                      <Button size="sm" variant={briefDirty ? "default" : "outline"} onClick={handleSaveBrief} disabled={briefSaving || !briefDirty}>
                        {briefSaving ? <><LoaderCircle className="size-3.5 animate-spin" /> Saving…</> : <><Save className="size-3.5" /> {briefDirty ? "Save brief" : "Saved"}</>}
                      </Button>
                    </div>
                    <Textarea value={briefEdited} onChange={(e) => { setBriefEdited(e.target.value); setBriefDirty(e.target.value !== briefMd); }} className="min-h-[400px] resize-y font-mono text-xs leading-relaxed" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Sticky bottom action bar ═══ */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
        <div className="hidden sm:flex items-center gap-2.5">
          <div className="flex h-2 w-24 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${completion.percentage}%` }} />
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">{completion.completed}/{completion.total} context checks</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <><LoaderCircle className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save</>}
          </Button>
          <Button onClick={handleSaveAndContinue} disabled={saving}>
            {saving ? <><LoaderCircle className="size-4 animate-spin" /> Saving…</> : <>Continue to Deck Style <ArrowRight className="size-4" /></>}
          </Button>
        </div>
      </div>
    </ViewLayout>
  );
}
