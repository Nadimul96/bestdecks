"use client";

import * as React from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  FileText,
  Globe,
  ImageIcon,
  LoaderCircle,
  Plus,
  Save,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Upload,
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
  defaultSellerContext,
  defaultSellerKnowledge,
  pricingModelOptions,
  type SellerContextForm,
  type SellerKnowledgeForm,
  type CaseStudyForm,
  type ObjectionForm,
} from "@/lib/workspace-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";
import { computeOfferStrengthScore, type SellerKnowledge } from "@/src/domain/schemas";

const meta = viewMeta["seller-context"];

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
   Offer Strength Gauge
   ══════════════════════════════════════════════════════ */

function OfferStrengthGauge({ score, suggestions }: { score: number; suggestions: string[] }) {
  const pct = Math.round((score / 10) * 100);
  const color = score >= 8 ? "text-emerald-500" : score >= 5 ? "text-amber-500" : "text-red-400";
  const bgColor = score >= 8 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.03] p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 size-24 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${score >= 8 ? "oklch(0.7 0.18 155 / 30%)" : score >= 5 ? "oklch(0.7 0.15 85 / 30%)" : "oklch(0.65 0.2 25 / 30%)"}, transparent 70%)` }} />
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Offer Strength</p>
          <p className="text-[11px] text-muted-foreground">Better input = better decks</p>
        </div>
        <div className={cn("text-3xl font-black tabular-nums tracking-tight", color)}>
          {score}<span className="text-sm font-medium text-muted-foreground/70">/10</span>
        </div>
      </div>
      <div className="flex h-2.5 w-full rounded-full bg-muted/60 overflow-hidden mb-3">
        <div
          className={cn("h-full rounded-full transition-all duration-700", bgColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
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
          placeholder="Low conversion rates on landing pages — losing $50K/mo in pipeline"
          className="min-h-[60px] resize-none text-[13px]"
        />
      </FieldGroup>

      <FieldGroup label="Your result" hint="This becomes the 'money slide'">
        <Textarea
          value={study.results}
          onChange={(e) => upd("results", e.target.value)}
          placeholder="2.4x increase in demo requests, $180K recovered pipeline in 90 days"
          className="min-h-[60px] resize-none text-[13px]"
        />
      </FieldGroup>

      <FieldGroup label="Testimonial quote" hint="Optional — extremely powerful if you have one">
        <Textarea
          value={study.testimonialQuote}
          onChange={(e) => upd("testimonialQuote", e.target.value)}
          placeholder='"Best agency we ever worked with. They moved faster than our own team."'
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

function computeSuggestions(k: SellerKnowledge): string[] {
  const suggestions: string[] = [];
  if (!k.offerSummary?.trim()) suggestions.push("Add your elevator pitch — it opens every deck");
  if ((k.services?.length ?? 0) < 2) suggestions.push("List 2+ deliverables for richer solution slides");
  if ((k.differentiators?.length ?? 0) < 2) suggestions.push("Add differentiators — what makes you the obvious choice?");
  if (!k.targetCustomer?.trim()) suggestions.push("Describe your ideal customer for better targeting");
  if (!k.desiredOutcome?.trim()) suggestions.push("Set the desired outcome so CTAs land correctly");
  if ((k.proofPoints?.length ?? 0) < 3) suggestions.push("Add 3+ proof points for a credibility bar");
  if (!k.caseStudies?.some((cs) => cs.challenge?.trim() && cs.results?.trim())) suggestions.push("Add a case study with specific results — this is the money slide");
  if ((k.commonObjections?.length ?? 0) === 0) suggestions.push("Tell us your top objection so decks preempt it");
  if (!k.pricingModel) suggestions.push("Set your pricing model for better CTA framing");
  if (!k.competitorNotes?.trim()) suggestions.push("Share competitor context so decks position you correctly");
  return suggestions;
}

/* ══════════════════════════════════════════════════════
   Main View
   ══════════════════════════════════════════════════════ */

export function SellerContextView() {
  const { currentBusiness, updateBusiness } = useBusinessContext();
  const [form, setForm] = React.useState<SellerKnowledgeForm>(defaultSellerKnowledge());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [crawling, setCrawling] = React.useState(false);
  const [crawlStatus, setCrawlStatus] = React.useState<{ step: number; total: number; message: string; detail: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<ContextTab>("offer");
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);

  // Brief state
  const [briefMd, setBriefMd] = React.useState<string | null>(null);
  const [briefEdited, setBriefEdited] = React.useState("");
  const [showBrief, setShowBrief] = React.useState(false);
  const [briefSaving, setBriefSaving] = React.useState(false);
  const [briefDirty, setBriefDirty] = React.useState(false);

  const logoInputRef = React.useRef<HTMLInputElement>(null);

  // Load existing data on mount
  React.useEffect(() => {
    const isNewBusiness = sessionStorage.getItem("bestdecks_new_business");
    if (isNewBusiness) {
      sessionStorage.removeItem("bestdecks_new_business");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [ctxRes, briefRes] = await Promise.all([
          fetch("/api/onboarding/seller-context"),
          fetch("/api/onboarding/seller-brief"),
        ]);
        if (ctxRes.ok) {
          const data = await ctxRes.json();
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
              caseStudies: Array.isArray(data.caseStudies) ? data.caseStudies.map((cs: any) => ({
                id: cs.id || randomUUID(),
                clientName: cs.clientName ?? "",
                industry: cs.industry ?? "",
                challenge: cs.challenge ?? "",
                solution: cs.solution ?? "",
                results: cs.results ?? "",
                metricsText: Array.isArray(cs.metrics) ? cs.metrics.map((m: any) => `${m.label}: ${m.value}`).join("\n") : "",
                testimonialQuote: cs.testimonialQuote ?? "",
              })) : prev.caseStudies,
              clientLogosText: Array.isArray(data.clientLogos) ? data.clientLogos.join("\n") : prev.clientLogosText,
              awardsText: Array.isArray(data.awards) ? data.awards.join("\n") : prev.awardsText,
              commonObjections: Array.isArray(data.commonObjections) ? data.commonObjections.map((o: any) => ({
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
            if (data.logoUrl) setLogoPreview(data.logoUrl);
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
        setLoading(false);
      }
    })();
  }, []);

  function update(field: keyof SellerKnowledgeForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Upload an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Logo must be under 5MB."); return; }
    setLogoPreview(URL.createObjectURL(file));
    setForm((prev) => ({ ...prev, logoFile: file, logoUrl: "" }));
  }

  async function handleCrawl() {
    if (!form.websiteUrl) return;
    setCrawling(true);
    setCrawlStatus(null);

    try {
      const res = await fetch("/api/onboarding/crawl-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: form.websiteUrl }),
      });

      if (!res.ok || !res.body) {
        toast.error("Could not analyze website. Try entering details manually.");
        setCrawling(false);
        setCrawlStatus(null);
        return;
      }

      // Stream SSE events from the crawl pipeline
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "status") {
              setCrawlStatus({ step: event.step, total: event.total, message: event.message, detail: event.detail });
            } else if (event.type === "complete") {
              setCrawlStatus(null);
              const sc = event.sellerContext;
              if (sc) {
                setForm((prev) => ({
                  ...prev,
                  companyName: sc.companyName ?? prev.companyName,
                  offerSummary: sc.offerSummary ?? prev.offerSummary,
                  servicesText: sc.services?.join("\n") ?? prev.servicesText,
                  differentiatorsText: sc.differentiators?.join("\n") ?? prev.differentiatorsText,
                  targetCustomer: sc.targetCustomer ?? prev.targetCustomer,
                  desiredOutcome: sc.desiredOutcome ?? prev.desiredOutcome,
                  proofPointsText: sc.proofPoints?.join("\n") ?? prev.proofPointsText,
                }));
                if (sc.logoUrl) { update("logoUrl", sc.logoUrl); setLogoPreview(sc.logoUrl); }
              }
              if (event.sellerBriefMd) {
                setBriefMd(event.sellerBriefMd);
                setBriefEdited(event.sellerBriefMd);
                setBriefDirty(false);
              }
              toast.success("Business context auto-filled from your website.");
            } else if (event.type === "error") {
              setCrawlStatus(null);
              toast.error(event.message ?? "Analysis failed.");
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

  async function handleSave() {
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
        if (currentBusiness && form.companyName) {
          updateBusiness(currentBusiness.id, {
            name: form.companyName,
            websiteUrl: form.websiteUrl,
            setupComplete: !!(form.companyName && form.offerSummary),
          });
        }
      } else {
        toast.error("Failed to save. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    await handleSave();
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

  // Compute strength score
  const knowledge = formToKnowledge(form);
  const strengthScore = computeOfferStrengthScore(knowledge);
  const suggestions = computeSuggestions(knowledge);

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
      description="Every field here becomes a slide. Vague input = vague decks. Specific input = decks that close."
      headerGradient
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><LoaderCircle className="size-4 animate-spin" /> Saving…</> : <><Save className="size-4" /> Save context</>}
        </Button>
      }
    >
      {/* ═══ Hero: Auto-fill from website ═══ */}
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
                <h2 className="text-[15px] font-semibold text-foreground">Auto-fill from your website</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Paste your URL and we&apos;ll extract company details, services, positioning, even your logo.</p>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="yourcompany.com" className="h-11 pl-10 text-[14px] bg-background/80" onKeyDown={(e) => { if (e.key === "Enter" && form.websiteUrl && !crawling) handleCrawl(); }} />
                </div>
                <Button onClick={handleCrawl} disabled={crawling || !form.websiteUrl} className="h-11 px-5 gap-2">
                  {crawling ? <><LoaderCircle className="size-4 animate-spin" /> Analyzing…</> : <><Sparkles className="size-4" /> Auto-fill</>}
                </Button>
              </div>
              {crawling && (
                <div className="space-y-2 animate-fade-in">
                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 max-w-[280px] rounded-full bg-primary/10 overflow-hidden">
                      {crawlStatus ? (
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                          style={{ width: `${Math.round((crawlStatus.step / crawlStatus.total) * 100)}%` }}
                        />
                      ) : (
                        <div className="h-full w-1/4 rounded-full bg-primary/50 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent, oklch(0.55 0.18 255 / 40%), transparent)", backgroundSize: "200% 100%" }} />
                      )}
                    </div>
                    {crawlStatus && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {crawlStatus.step}/{crawlStatus.total}
                      </span>
                    )}
                  </div>
                  {/* Status message */}
                  <div className="flex items-center gap-2">
                    <LoaderCircle className="size-3.5 animate-spin text-primary" />
                    <span className="text-[13px] font-medium text-foreground">
                      {crawlStatus?.message ?? "Starting analysis…"}
                    </span>
                  </div>
                  {crawlStatus?.detail && (
                    <p className="text-[11px] text-muted-foreground pl-5.5">
                      {crawlStatus.detail}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Offer Strength Score + Identity row ═══ */}
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <OfferStrengthGauge score={strengthScore} suggestions={suggestions} />

        {/* Logo card */}
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card px-6 py-5 lg:w-[180px]">
          {logoPreview ? (
            <div className="relative group">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Company logo" className="size-full object-contain p-2" onError={() => { setLogoPreview(null); setForm((prev) => ({ ...prev, logoUrl: "" })); }} />
              </div>
              <button type="button" onClick={() => { setLogoPreview(null); setForm((prev) => ({ ...prev, logoFile: null, logoUrl: "" })); if (logoInputRef.current) logoInputRef.current.value = ""; }} aria-label="Remove logo" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => logoInputRef.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary">
              <ImageIcon className="size-5" />
              <span className="text-[10px] font-medium">Logo</span>
            </button>
          )}
          {logoPreview && (
            <p className="text-[10px] text-muted-foreground text-center">Company logo</p>
          )}
          {!logoPreview && (
            <Input value={form.logoUrl} onChange={(e) => { update("logoUrl", e.target.value); if (e.target.value) setLogoPreview(e.target.value); }} placeholder="or paste logo URL" className="h-8 text-[11px] w-full text-center" />
          )}
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" aria-label="Upload company logo" />
        </div>
      </div>

      {/* ═══ Tab Navigation ═══ */}
      <SlidingTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ═══ Tab Content ═══ */}

      {/* ── YOUR OFFER ── */}
      {activeTab === "offer" && (
        <div className="space-y-5 animate-fade-in">
          <SectionCard title="Identity" description="How your brand appears on generated decks.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Company name">
                <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="Acme Agency" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Tagline" hint="Optional">
                <Input value={form.tagline} onChange={(e) => update("tagline", e.target.value)} placeholder="We build things that sell" className="h-10" />
              </FieldGroup>
            </div>
          </SectionCard>

          <SectionCard title="Your Pitch" description="This becomes the opening line of every deck. Make it specific enough that the prospect thinks 'that's exactly what I need.'">
            <FieldGroup label="Elevator pitch" hint="One sentence — if a stranger asked what you do">
              <Textarea value={form.offerSummary} onChange={(e) => update("offerSummary", e.target.value)} placeholder="We build high-converting landing pages for SaaS companies that want to 2-3x their demo requests." className="min-h-[80px] resize-none" />
            </FieldGroup>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FieldGroup label="What you deliver" hint="One per line — not categories, specific deliverables">
                <Textarea value={form.servicesText} onChange={(e) => update("servicesText", e.target.value)} placeholder={`Custom landing page design (Figma + code)\nConversion rate audit with prioritized recs\nMonthly A/B testing program (3 tests/mo)`} className="min-h-[110px] resize-none" />
              </FieldGroup>
              <FieldGroup label="Why you win" hint="One per line — what makes you the obvious choice?">
                <Textarea value={form.differentiatorsText} onChange={(e) => update("differentiatorsText", e.target.value)} placeholder={`12+ years in SaaS\n200+ pages launched\nAvg 2.4x lift in demo requests`} className="min-h-[110px] resize-none" />
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
            description="Prospects don't believe claims. They believe evidence. The AI picks the case study most similar to each target company."
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
                {form.caseStudies.length === 0 ? "Add your first case study — this is the money slide" : "Add another case study"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Credibility Signals" description="These fill the 'why trust us' layer across every deck.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Proof points" hint="One per line — metrics, logos, numbers">
                <Textarea value={form.proofPointsText} onChange={(e) => update("proofPointsText", e.target.value)} placeholder={`50% average response rate\n100+ companies trust us\nNPS score: 72`} className="min-h-[100px] resize-none" />
              </FieldGroup>
              <FieldGroup label="Awards & press" hint="One per line">
                <Textarea value={form.awardsText} onChange={(e) => update("awardsText", e.target.value)} placeholder={`ProductHunt #1 Product of the Day\nFeatured in TechCrunch\nGoogle Premier Partner`} className="min-h-[100px] resize-none" />
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
            description="When we know what stops people from buying, the deck preemptively addresses it. This is what makes prospects think 'they get us.'"
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
                    <Input value={obj.response} onChange={(e) => updateObjection(i, "response", e.target.value)} placeholder="ROI within 30 days, guaranteed" className="h-9 text-[13px]" />
                  </FieldGroup>
                </div>
              ))}
              <Button variant="outline" onClick={addObjection} className="w-full h-10 gap-2 border-dashed text-[13px]">
                <Plus className="size-3.5" />
                Add objection
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Competitive Context" description="Who do you lose deals to? The AI uses this to position your unique angle.">
            <FieldGroup label="Competitor notes" hint="Who you compete with and why clients choose you">
              <Textarea value={form.competitorNotes} onChange={(e) => update("competitorNotes", e.target.value)} placeholder="Main competitors are Toptal (marketplace, less ownership) and traditional agencies (slower, cost-plus). We win because of fixed-price contracts and ex-FAANG talent." className="min-h-[100px] resize-none" />
            </FieldGroup>
          </SectionCard>

          <SectionCard title="Pricing & Process" description="Knowing your pricing model changes how the CTA is framed. A $5K deal gets a different ask than a $500K deal.">
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
                    {briefMd ? "AI-generated dossier — edit to refine" : "Run auto-fill to generate"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {briefMd && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">Generated</span>}
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showBrief && "rotate-180")} />
              </div>
            </button>
            {showBrief && (
              <div className="border-t border-border/40 px-5 py-4">
                {!briefMd ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileText className="size-8 text-muted-foreground mb-2" />
                    <p className="text-[13px] font-medium">No brief yet</p>
                    <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">Enter your website URL above and click Auto-fill.</p>
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
            <div className={cn("h-full rounded-full transition-all duration-500", strengthScore >= 8 ? "bg-emerald-500" : strengthScore >= 5 ? "bg-amber-500" : "bg-red-400")} style={{ width: `${Math.round((strengthScore / 10) * 100)}%` }} />
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">{strengthScore}/10 strength</span>
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
