"use client";

import * as React from "react";
import { ArrowRight, Check, Eye, Info, LoaderCircle, Save, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import { ArchetypePreviewModal, archetypeExamples } from "@/components/archetype-preview-modal";
import {
  viewMeta,
  defaultQuestionnaire,
  archetypeOptions,
  outputFormatOptions,
  toneOptions,
  visualStyleOptions,
  imagePolicyOptions,
  visualContentTypeOptions,
  visualDensityOptions,
  type QuestionnaireForm,
} from "@/lib/workspace-types";
import type { DeliveryFormat, VisualContentType } from "@/src/domain/schemas";
import { cn } from "@/lib/utils";

const meta = viewMeta["run-settings"];

/* ─── Sub-tab types ─── */
type SettingsTab = "strategy" | "design" | "advanced";

const settingsTabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "strategy", label: "Strategy" },
  { key: "design", label: "Design" },
  { key: "advanced", label: "Advanced" },
];

/* ─── Sliding pill tab bar (Dribbble-inspired micro-interaction) ─── */
function SlidingTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: Array<{ key: T; label: string }>;
  activeTab: T;
  onTabChange: (key: T) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
    if (!activeEl) return;
    setPillStyle({
      width: activeEl.offsetWidth,
      transform: `translateX(${activeEl.offsetLeft - container.offsetLeft - 4}px)`,
    });
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-0.5 rounded-xl border border-border/30 bg-muted/20 p-1 backdrop-blur-sm"
    >
      {/* Sliding pill indicator */}
      <div
        className="absolute left-1 top-1 bottom-1 rounded-lg bg-background shadow-sm ring-1 ring-border/10 transition-all duration-300"
        style={{
          ...pillStyle,
          transitionTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          data-tab={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "relative z-10 flex-1 rounded-lg px-5 py-2.5 text-[13px] font-medium transition-colors duration-200",
            activeTab === tab.key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground/70",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Archetype accent colors for ChromaGrid-inspired cards ─── */
const archetypeAccents: Record<string, { gradient: string; border: string; glow: string }> = {
  cold_outreach: { gradient: "from-blue-600/20 to-transparent", border: "hover:border-blue-500/40", glow: "group-hover:shadow-blue-500/10" },
  warm_intro: { gradient: "from-amber-500/20 to-transparent", border: "hover:border-amber-500/40", glow: "group-hover:shadow-amber-500/10" },
  agency_proposal: { gradient: "from-violet-600/20 to-transparent", border: "hover:border-violet-500/40", glow: "group-hover:shadow-violet-500/10" },
  investor_pitch: { gradient: "from-emerald-600/20 to-transparent", border: "hover:border-emerald-500/40", glow: "group-hover:shadow-emerald-500/10" },
  case_study: { gradient: "from-cyan-600/20 to-transparent", border: "hover:border-cyan-500/40", glow: "group-hover:shadow-cyan-500/10" },
  competitive_displacement: { gradient: "from-rose-600/20 to-transparent", border: "hover:border-rose-500/40", glow: "group-hover:shadow-rose-500/10" },
  thought_leadership: { gradient: "from-indigo-600/20 to-transparent", border: "hover:border-indigo-500/40", glow: "group-hover:shadow-indigo-500/10" },
  product_launch: { gradient: "from-orange-500/20 to-transparent", border: "hover:border-orange-500/40", glow: "group-hover:shadow-orange-500/10" },
  custom: { gradient: "from-fuchsia-600/20 to-transparent", border: "hover:border-fuchsia-500/40", glow: "group-hover:shadow-fuchsia-500/10" },
};

/* ─── Visual style color swatches ─── */
const styleSwatches: Record<string, string> = {
  auto: "bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400",
  minimal: "bg-gray-200 dark:bg-gray-600",
  editorial: "bg-stone-700 dark:bg-stone-300",
  sales_polished: "bg-blue-600 dark:bg-blue-400",
  premium_modern: "bg-indigo-900 dark:bg-indigo-300",
  playful: "bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400",
  dark_executive: "bg-slate-900 dark:bg-slate-200",
  dark_minimal: "bg-neutral-900 dark:bg-neutral-200",
  custom: "bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/40",
  mixed: "bg-gradient-to-r from-rose-500 via-violet-500 to-cyan-500",
};

/* ─── Reusable option grid ─── */
function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  disabledValues = [],
}: {
  options: Array<{ value: T; label: string; description?: string; badge?: string }>;
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  disabledValues?: T[];
}) {
  return (
    <div
      className={cn("grid gap-3", {
        "sm:grid-cols-2": columns === 2,
        "sm:grid-cols-3": columns === 3,
        "sm:grid-cols-5": columns === 5,
      })}
    >
      {options.map((opt) => {
        const isDisabled = disabledValues.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !isDisabled && onChange(opt.value)}
            disabled={isDisabled}
            className={cn(
              "rounded-xl border p-4 text-left transition-all relative focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              isDisabled
                ? "border-border/30 bg-muted/30 opacity-60 cursor-not-allowed"
                : value === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border/50 bg-card hover:border-border hover:shadow-sm",
            )}
          >
            {opt.badge && (
              <span className={cn(
                "absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                opt.badge === "Coming soon"
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary",
              )}>
                {opt.badge}
              </span>
            )}
            <p className="text-[13px] font-medium text-foreground">{opt.label}</p>
            {opt.description && (
              <p className="mt-0.5 text-[12px] text-muted-foreground pr-16">
                {opt.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Chip grid with descriptions and custom input ─── */
function ChipGridWithCustom<T extends string>({
  options,
  value,
  onChange,
  customValue,
  onCustomChange,
  customPlaceholder,
}: {
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (v: T) => void;
  customValue?: string;
  onCustomChange?: (v: string) => void;
  customPlaceholder?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Tooltip key={opt.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(opt.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                  value === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            </TooltipTrigger>
            {opt.description && (
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {opt.description}
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </div>
      {value === ("custom" as T) && onCustomChange && (
        <Input
          value={customValue ?? ""}
          onChange={(e) => onCustomChange(e.target.value.slice(0, 500))}
          maxLength={500}
          placeholder={customPlaceholder ?? "Describe your preference..."}
          className="h-9 animate-fade-in text-sm"
        />
      )}
    </div>
  );
}

/* ─── Multi-select visual content type grid ─── */
function VisualContentGrid({
  selected,
  onChange,
}: {
  selected: VisualContentType[];
  onChange: (v: VisualContentType[]) => void;
}) {
  function toggle(val: VisualContentType) {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visualContentTypeOptions.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
            selected.includes(opt.value)
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "border-border/50 bg-card hover:border-border hover:shadow-sm",
          )}
        >
          <span className="mt-0.5 text-base shrink-0">{opt.icon}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">{opt.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
              {opt.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function RunSettingsView() {
  const [form, setForm] = React.useState<QuestionnaireForm>(
    defaultQuestionnaire(),
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [autofilling, setAutofilling] = React.useState(false);
  const [hasSellerContext, setHasSellerContext] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("strategy");
  const [previewArchetype, setPreviewArchetype] = React.useState<string | null>(null);

  /* Load saved questionnaire on mount */
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/questionnaire");
        if (res.ok) {
          const data = await res.json();
          if (data && (data.audience || data.objective || data.archetype)) {
            setForm((prev) => ({
              ...prev,
              archetype: data.archetype ?? prev.archetype,
              customArchetypePrompt: data.customArchetypePrompt ?? prev.customArchetypePrompt,
              audience: data.audience ?? prev.audience,
              audienceSize: data.audienceSize ?? prev.audienceSize,
              audienceIndustry: data.audienceIndustry ?? prev.audienceIndustry,
              audiencePainPoints: data.audiencePainPoints ?? prev.audiencePainPoints,
              objective: data.objective ?? prev.objective,
              successMetric: data.successMetric ?? prev.successMetric,
              callToAction: data.callToAction ?? prev.callToAction,
              ctaUrgency: data.ctaUrgency ?? prev.ctaUrgency,
              outputFormat: data.outputFormat === "presenton_editor" ? "bestdecks_editor" : (data.outputFormat ?? prev.outputFormat),
              desiredCardCount:
                data.desiredCardCount?.toString() ?? prev.desiredCardCount,
              tone: data.tone ?? prev.tone,
              customTone: data.customTone ?? prev.customTone,
              visualStyle: data.visualStyle ?? prev.visualStyle,
              customVisualStyle: data.customVisualStyle ?? prev.customVisualStyle,
              imagePolicy: data.imagePolicy ?? prev.imagePolicy,
              visualContentTypes: data.visualContentTypes ?? prev.visualContentTypes,
              visualDensity: data.visualDensity ?? prev.visualDensity,
              mustIncludeText: Array.isArray(data.mustInclude)
                ? data.mustInclude.join("\n")
                : data.mustIncludeText ?? prev.mustIncludeText,
              mustAvoidText: Array.isArray(data.mustAvoid)
                ? data.mustAvoid.join("\n")
                : data.mustAvoidText ?? prev.mustAvoidText,
              extraInstructions:
                data.extraInstructions ?? prev.extraInstructions,
              optionalReview: data.optionalReview ?? prev.optionalReview,
              allowUserApprovedCrawlException:
                data.allowUserApprovedCrawlException ??
                prev.allowUserApprovedCrawlException,
            }));
          }
        }
      } catch {
        // Non-blocking — start from defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Check if seller context exists (for autofill button visibility) */
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/seller-context");
        if (res.ok) {
          const data = await res.json();
          if (data?.targetCustomer || data?.desiredOutcome || data?.companyName) {
            setHasSellerContext(true);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  function update<K extends keyof QuestionnaireForm>(
    field: K,
    value: QuestionnaireForm[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const [sellerRes, audienceRes] = await Promise.all([
        fetch("/api/onboarding/seller-context"),
        fetch("/api/onboarding/audience-context"),
      ]);

      const seller = sellerRes.ok ? await sellerRes.json() : null;
      const audience = audienceRes.ok ? await audienceRes.json() : null;
      let filled = false;

      if (seller?.targetCustomer && !form.audience) {
        update("audience", seller.targetCustomer);
        filled = true;
      }
      if (seller?.desiredOutcome && !form.objective) {
        update("objective", seller.desiredOutcome);
        filled = true;
      }
      if (seller?.desiredOutcome && !form.callToAction) {
        update("callToAction", "Book a 20-minute call to discuss how we can help");
        filled = true;
      }

      if (audience?.audienceIndustry && !form.audienceIndustry) {
        update("audienceIndustry", audience.audienceIndustry);
        filled = true;
      }
      if (audience?.audienceSize && !form.audienceSize) {
        update("audienceSize", audience.audienceSize);
        filled = true;
      }
      if (audience?.audiencePainPoints && !form.audiencePainPoints) {
        update("audiencePainPoints", audience.audiencePainPoints);
        filled = true;
      }

      if (audience?.mustInclude?.length && !form.mustIncludeText) {
        update("mustIncludeText", audience.mustInclude.join("\n"));
        filled = true;
      }
      if (audience?.mustAvoid?.length && !form.mustAvoidText) {
        update("mustAvoidText", audience.mustAvoid.join("\n"));
        filled = true;
      }

      if (filled) {
        toast.success("Fields auto-filled from your business context.");
      } else if (seller || audience) {
        toast.info(
          "Fields already have values. Clear them first to auto-fill.",
        );
      } else {
        toast.error("No business context found. Complete the seller context step first.");
      }
    } catch {
      toast.error("Could not load business context.");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Deck style saved.");
      } else {
        toast.error("Failed to save settings. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    await handleSave();
    window.location.hash = "target-intake";
  }

  if (loading) {
    return (
      <ViewLayout eyebrow={meta.eyebrow} title={meta.title} description={meta.description}>
        {/* Sub-tab skeleton */}
        <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/30 p-1">
          {settingsTabs.map((t) => (
            <Skeleton key={t.key} className="h-9 flex-1 rounded-md" />
          ))}
        </div>
        {/* Archetype grid skeleton */}
        <div className="rounded-xl border border-border/50 bg-card">
          <div className="border-b border-border/40 px-5 py-4 sm:px-6">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
        {/* Form fields skeleton */}
        <div className="rounded-xl border border-border/50 bg-card">
          <div className="border-b border-border/40 px-5 py-4 sm:px-6">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </ViewLayout>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ViewLayout
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save settings
              </>
            )}
          </Button>
        }
      >
        {/* ─── Sliding pill tab bar ─── */}
        <SlidingTabs
          tabs={settingsTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* ═══════════════════════════════════════════
            STRATEGY TAB
            ═══════════════════════════════════════════ */}
        {activeTab === "strategy" && (
          <>
            {/* Archetype — ChromaGrid-inspired */}
            <SectionCard title="Deck archetype" description="Choose the primary framing for your outreach decks.">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {archetypeOptions.map((opt) => {
                  const isSelected = form.archetype === opt.value;
                  const accent = archetypeAccents[opt.value] ?? archetypeAccents.cold_outreach;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("archetype", opt.value)}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                        isSelected
                          ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/20 shadow-lg"
                          : cn("border-border/30 bg-card/80", accent.border),
                        !isSelected && accent.glow,
                        !isSelected && "hover:shadow-md",
                      )}
                    >
                      {/* Gradient accent overlay */}
                      <div className={cn(
                        "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                        accent.gradient,
                      )} />

                      {/* Content */}
                      <div className="relative z-10 flex items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-base transition-transform duration-300 group-hover:scale-110">
                          {opt.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground pr-6">
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground line-clamp-2">
                            {opt.description}
                          </p>
                          {archetypeExamples[opt.value] && (
                            <span
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewArchetype(opt.value);
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors cursor-pointer"
                            >
                              <Eye className="size-3" />
                              See example
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Selected check */}
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                          <Check className="size-3" strokeWidth={2.5} />
                        </span>
                      )}
                      {!isSelected && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="absolute right-3 top-3 shrink-0 rounded-full p-0.5 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Info className="size-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[280px] text-xs leading-relaxed"
                          >
                            {opt.detail}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </button>
                  );
                })}
              </div>
              {form.archetype === "custom" && (
                <Textarea
                  value={form.customArchetypePrompt}
                  onChange={(e) => update("customArchetypePrompt", e.target.value.slice(0, 2000))}
                  maxLength={2000}
                  placeholder="e.g., Lead with a case study, then show 3 ROI scenarios tailored to their industry. End with a competitive comparison..."
                  className="mt-4 min-h-[80px] resize-none animate-fade-in"
                />
              )}
            </SectionCard>

            {/* Audience & objective */}
            <SectionCard title="Audience & objective" description="Define who receives these decks and what they should achieve.">
              <div className="space-y-6">
                {hasSellerContext && (
                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-foreground">
                        Auto-fill from business context
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Pre-populate from your business profile.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutofill}
                      disabled={autofilling}
                    >
                      {autofilling ? (
                        <>
                          <LoaderCircle className="size-3.5 animate-spin" />
                          Filling...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          Auto-fill
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* ── Who are you targeting? ── */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Audience</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FieldGroup label="Target role">
                      <Input
                        value={form.audience}
                        onChange={(e) => update("audience", e.target.value)}
                        placeholder="VP of Marketing at mid-market SaaS"
                        className="h-10"
                      />
                    </FieldGroup>
                    <FieldGroup label="Industry">
                      <Input
                        value={form.audienceIndustry}
                        onChange={(e) => update("audienceIndustry", e.target.value)}
                        placeholder="Healthcare, FinTech, Real Estate..."
                        className="h-10"
                      />
                    </FieldGroup>
                    <FieldGroup label="Company size">
                      <Input
                        value={form.audienceSize}
                        onChange={(e) => update("audienceSize", e.target.value)}
                        placeholder="50-500 employees"
                        className="h-10"
                      />
                    </FieldGroup>
                  </div>
                  <FieldGroup label="Key pain points" hint="What keeps them up at night?">
                    <Input
                      value={form.audiencePainPoints}
                      onChange={(e) => update("audiencePainPoints", e.target.value)}
                      placeholder="Manual processes, scaling bottlenecks, tool fragmentation..."
                      className="h-10"
                    />
                  </FieldGroup>
                </div>

                <div className="border-t border-border/30" />

                {/* ── What should this deck achieve? ── */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Objective</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldGroup label="Goal">
                      <Input
                        value={form.objective}
                        onChange={(e) => update("objective", e.target.value)}
                        placeholder="Get a discovery call booked"
                        className="h-10"
                      />
                    </FieldGroup>
                    <FieldGroup label="Success metric">
                      <Input
                        value={form.successMetric}
                        onChange={(e) => update("successMetric", e.target.value)}
                        placeholder="Reply rate > 15%, meetings booked..."
                        className="h-10"
                      />
                    </FieldGroup>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldGroup label="Call to action">
                      <Input
                        value={form.callToAction}
                        onChange={(e) => update("callToAction", e.target.value)}
                        placeholder="Book a 20-minute call this week"
                        className="h-10"
                      />
                    </FieldGroup>
                    <FieldGroup label="Urgency / timing">
                      <Input
                        value={form.ctaUrgency}
                      onChange={(e) => update("ctaUrgency", e.target.value)}
                      placeholder="Q1 budget cycle, limited spots..."
                      className="h-10"
                    />
                  </FieldGroup>
                </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ═══════════════════════════════════════════
            DESIGN TAB
            ═══════════════════════════════════════════ */}
        {activeTab === "design" && (
          <>
            {/* Tone */}
            <SectionCard title="Tone" description="How your deck sounds to the reader.">
              <ChipGridWithCustom
                options={toneOptions}
                value={form.tone}
                onChange={(v) => update("tone", v)}
                customValue={form.customTone}
                onCustomChange={(v) => update("customTone", v)}
                customPlaceholder="e.g., Warm but data-driven, like a smart friend who did the research..."
              />
            </SectionCard>

            {/* Visual style */}
            <SectionCard title="Visual style" description="Set the look and feel of your slides.">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visualStyleOptions.map((opt) => {
                    const isSelected = form.visualStyle === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update("visualStyle", opt.value)}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all relative focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/50 bg-card hover:border-border hover:shadow-sm",
                        )}
                      >
                        <span
                          className={cn(
                            "size-8 shrink-0 rounded-lg",
                            styleSwatches[opt.value] ?? "bg-muted",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground">
                            {opt.label}
                          </p>
                          {opt.description && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                              {opt.description}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" strokeWidth={2.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {form.visualStyle === "custom" && (
                  <Input
                    value={form.customVisualStyle}
                    onChange={(e) => update("customVisualStyle", e.target.value)}
                    placeholder="e.g., Dark mode with neon accents, tech-forward, geometric patterns..."
                    className="h-10 animate-fade-in"
                  />
                )}
              </div>
            </SectionCard>

            {/* Visual content types, density, image policy */}
            <SectionCard title="Visual content" description="Control what types of visuals appear and how dense they are.">
              <div className="space-y-6">
                <FieldGroup label="Content types">
                  <VisualContentGrid
                    selected={form.visualContentTypes}
                    onChange={(v) => update("visualContentTypes", v)}
                  />
                </FieldGroup>

                <FieldGroup label="Visual density">
                  <div className="flex flex-wrap gap-2">
                    {visualDensityOptions.map((opt) => (
                      <Tooltip key={opt.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => update("visualDensity", opt.value)}
                            className={cn(
                              "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                              form.visualDensity === opt.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {opt.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {opt.description}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup label="Image generation">
                  <div className="flex flex-wrap gap-2">
                    {imagePolicyOptions.map((opt) => (
                      <Tooltip key={opt.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => update("imagePolicy", opt.value)}
                            className={cn(
                              "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                              form.imagePolicy === opt.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {opt.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          {opt.description}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </FieldGroup>
              </div>
            </SectionCard>

            {/* Output format & card count */}
            <SectionCard title="Output" description="Choose file format and slide count.">
              <div className="space-y-6">
                <FieldGroup label="Export format">
                  <OptionGrid
                    options={outputFormatOptions}
                    value={form.outputFormat}
                    onChange={(v) => update("outputFormat", v)}
                    columns={3}
                    disabledValues={["bestdecks_editor", "bestdecks_link", "google_slides"] as DeliveryFormat[]}
                  />
                </FieldGroup>

                <FieldGroup label="Slide count">
                  <Input
                    type="number"
                    value={form.desiredCardCount}
                    onChange={(e) => update("desiredCardCount", e.target.value)}
                    placeholder="8"
                    className="h-10 w-24"
                  />
                </FieldGroup>
              </div>
            </SectionCard>
          </>
        )}

        {/* ═══════════════════════════════════════════
            ADVANCED TAB
            ═══════════════════════════════════════════ */}
        {activeTab === "advanced" && (
          <>
            <SectionCard title="Content rules">
              <div className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldGroup label="Must include" hint="Topics or phrases to always cover">
                    <Textarea
                      value={form.mustIncludeText}
                      onChange={(e) => update("mustIncludeText", e.target.value)}
                      placeholder="ROI metrics, customer success story"
                      className="min-h-[80px] resize-none"
                    />
                  </FieldGroup>
                  <FieldGroup label="Must avoid" hint="Topics or phrases to never use">
                    <Textarea
                      value={form.mustAvoidText}
                      onChange={(e) => update("mustAvoidText", e.target.value)}
                      placeholder="Competitor names, aggressive pricing claims"
                      className="min-h-[80px] resize-none"
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="Extra instructions">
                  <Textarea
                    value={form.extraInstructions}
                    onChange={(e) => update("extraInstructions", e.target.value)}
                    placeholder="Any additional guidance for the AI..."
                    className="min-h-[80px] resize-none"
                  />
                </FieldGroup>
              </div>
            </SectionCard>

            <SectionCard title="Review & safety">
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-4">
                  <Switch
                    id="review-gate"
                    checked={form.optionalReview}
                    onCheckedChange={(c) =>
                      update("optionalReview", c as boolean)
                    }
                  />
                  <Label htmlFor="review-gate" className="cursor-pointer">
                    <p className="text-[13px] font-medium">Review gate</p>
                    <p className="text-[11px] text-muted-foreground">
                      Pause before delivery for manual review
                    </p>
                  </Label>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-4">
                  <Switch
                    id="crawl-exception"
                    checked={form.allowUserApprovedCrawlException}
                    onCheckedChange={(c) =>
                      update("allowUserApprovedCrawlException", c as boolean)
                    }
                  />
                  <Label htmlFor="crawl-exception" className="cursor-pointer">
                    <p className="text-[13px] font-medium">Crawl exceptions</p>
                    <p className="text-[11px] text-muted-foreground">
                      Allow generation even when website crawl fails
                    </p>
                  </Label>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ─── Bottom action bar ─── */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
          <p className="text-[13px] text-muted-foreground">
            {form.archetype
              ? `Blueprint: ${archetypeOptions.find((a) => a.value === form.archetype)?.label ?? form.archetype}`
              : "Configure your deck blueprint"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save
                </>
              )}
            </Button>
            <Button onClick={handleSaveAndContinue} disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Continue to Targets
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </ViewLayout>

      {/* Archetype example preview modal */}
      <ArchetypePreviewModal
        archetype={previewArchetype ?? ""}
        open={previewArchetype !== null}
        onClose={() => setPreviewArchetype(null)}
      />
    </TooltipProvider>
  );
}
