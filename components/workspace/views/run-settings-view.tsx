"use client";

import * as React from "react";
import { ArrowRight, Info, LoaderCircle, Save, Sparkles } from "lucide-react";
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
              "rounded-xl border p-4 text-left transition-all relative",
              isDisabled
                ? "border-border/30 bg-muted/30 opacity-60 cursor-not-allowed"
                : value === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border/50 bg-card hover:border-border",
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
                  "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all",
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
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={customPlaceholder ?? "Describe your preference…"}
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
            "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
            selected.includes(opt.value)
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "border-border/50 bg-card hover:border-border",
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
  const [saving, setSaving] = React.useState(false);
  const [autofilling, setAutofilling] = React.useState(false);
  const [hasSellerContext, setHasSellerContext] = React.useState(false);

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
      // Fetch both seller context and audience context from crawl
      const [sellerRes, audienceRes] = await Promise.all([
        fetch("/api/onboarding/seller-context"),
        fetch("/api/onboarding/audience-context"),
      ]);

      const seller = sellerRes.ok ? await sellerRes.json() : null;
      const audience = audienceRes.ok ? await audienceRes.json() : null;
      let filled = false;

      // Audience fields from seller context
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

      // Extra audience details from crawl analysis
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

      // Advanced: must include / must avoid
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
                Saving…
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
        {/* Archetype */}
        <SectionCard
          title="Deck archetype"
          description="Choose the primary framing for your outreach decks."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {archetypeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("archetype", opt.value)}
                className={cn(
                  "group relative flex flex-col rounded-xl border p-4 text-left transition-all",
                  form.archetype === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/50 bg-card hover:border-border",
                )}
              >
                <p className="text-[13px] font-medium text-foreground pr-5">
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">
                  {opt.description}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="absolute right-2.5 top-2.5 shrink-0 rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
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
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Audience & objective — expanded */}
        <SectionCard
          title="Audience & objective"
          description="The more detail you provide, the more precisely the AI tailors each deck to resonate with your prospects."
        >
          <div className="space-y-5">
            {/* Autofill banner */}
            {hasSellerContext && (
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Auto-fill from business context
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pre-populate from your business profile to save time.
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
                      Filling…
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

            {/* Row 1: Target audience + Industry */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Target audience" hint="Who receives these decks?">
                <Input
                  value={form.audience}
                  onChange={(e) => update("audience", e.target.value)}
                  placeholder="VP of Marketing at mid-market SaaS"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="Industry / vertical" hint="What industry are they in?">
                <Input
                  value={form.audienceIndustry}
                  onChange={(e) => update("audienceIndustry", e.target.value)}
                  placeholder="Healthcare, FinTech, Real Estate…"
                  className="h-10"
                />
              </FieldGroup>
            </div>

            {/* Row 2: Company size + Pain points */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Company size" hint="Employee count, revenue range, etc.">
                <Input
                  value={form.audienceSize}
                  onChange={(e) => update("audienceSize", e.target.value)}
                  placeholder="50-500 employees, $5M-$50M revenue"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="Key pain points" hint="What problems keep them up at night?">
                <Input
                  value={form.audiencePainPoints}
                  onChange={(e) => update("audiencePainPoints", e.target.value)}
                  placeholder="Manual processes, scaling bottlenecks, compliance…"
                  className="h-10"
                />
              </FieldGroup>
            </div>

            {/* Row 3: Objective + Success metric */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Objective" hint="What should this deck accomplish?">
                <Input
                  value={form.objective}
                  onChange={(e) => update("objective", e.target.value)}
                  placeholder="Get a discovery call booked"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="Success metric" hint="How will you know if the deck worked?">
                <Input
                  value={form.successMetric}
                  onChange={(e) => update("successMetric", e.target.value)}
                  placeholder="Reply rate > 15%, meetings booked, deal value…"
                  className="h-10"
                />
              </FieldGroup>
            </div>

            {/* Row 4: CTA + Urgency */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Call to action" hint="What's the one thing you want them to do?">
                <Input
                  value={form.callToAction}
                  onChange={(e) => update("callToAction", e.target.value)}
                  placeholder="Book a 20-minute call this week"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="Urgency / timing" hint="Why should they act now?">
                <Input
                  value={form.ctaUrgency}
                  onChange={(e) => update("ctaUrgency", e.target.value)}
                  placeholder="Q1 budget cycle, limited spots, seasonal demand…"
                  className="h-10"
                />
              </FieldGroup>
            </div>
          </div>
        </SectionCard>

        {/* Output & delivery */}
        <SectionCard
          title="Output & delivery"
          description="Choose how your decks are delivered to prospects."
        >
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

            <FieldGroup label="Desired slide count" hint="Typical: 6-12">
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

        {/* Tone */}
        <SectionCard
          title="Tone of voice"
          description="Set the writing style that matches your brand and resonates with your audience."
        >
          <ChipGridWithCustom
            options={toneOptions}
            value={form.tone}
            onChange={(v) => update("tone", v)}
            customValue={form.customTone}
            onCustomChange={(v) => update("customTone", v)}
            customPlaceholder="e.g., Warm but data-driven, like a smart friend who did the research…"
          />
        </SectionCard>

        {/* Visual style */}
        <SectionCard
          title="Visual style"
          description="Define the look and feel of your slide designs."
        >
          <div className="space-y-4">
            {/* Style cards with mini previews */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visualStyleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("visualStyle", opt.value)}
                  className={cn(
                    "group flex flex-col rounded-xl border overflow-hidden transition-all",
                    form.visualStyle === opt.value
                      ? "border-primary ring-1 ring-primary/20"
                      : "border-border/50 hover:border-border",
                  )}
                >
                  {/* Mini visual preview placeholder */}
                  <div
                    className={cn(
                      "h-20 w-full transition-colors",
                      opt.value === "minimal" && "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800",
                      opt.value === "editorial" && "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950 dark:via-orange-950 dark:to-rose-950",
                      opt.value === "sales_polished" && "bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900",
                      opt.value === "premium_modern" && "bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 dark:from-slate-50 dark:via-purple-50 dark:to-slate-50",
                      opt.value === "playful" && "bg-gradient-to-br from-pink-100 via-yellow-100 to-cyan-100 dark:from-pink-950 dark:via-yellow-950 dark:to-cyan-950",
                      opt.value === "custom" && "bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center",
                    )}
                  >
                    {opt.value === "custom" && (
                      <span className="text-2xl">🎨</span>
                    )}
                  </div>
                  <div className="p-3 text-left">
                    <p className="text-[13px] font-medium text-foreground">
                      {opt.label}
                    </p>
                    {opt.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {opt.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {form.visualStyle === "custom" && (
              <Input
                value={form.customVisualStyle}
                onChange={(e) => update("customVisualStyle", e.target.value)}
                placeholder="e.g., Dark mode with neon accents, tech-forward, geometric patterns…"
                className="h-10 animate-fade-in"
              />
            )}
          </div>
        </SectionCard>

        {/* Visual content */}
        <SectionCard
          title="Visual content"
          description="What kind of visuals should appear in your decks? Select all that apply."
        >
          <div className="space-y-6">
            {/* Visual content types — multi-select */}
            <FieldGroup label="Types of visuals">
              <VisualContentGrid
                selected={form.visualContentTypes}
                onChange={(v) => update("visualContentTypes", v)}
              />
            </FieldGroup>

            {/* Visual density */}
            <FieldGroup label="Visual density" hint="How image-heavy should decks be?">
              <div className="flex flex-wrap gap-2">
                {visualDensityOptions.map((opt) => (
                  <Tooltip key={opt.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => update("visualDensity", opt.value)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all",
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

            {/* Image generation policy */}
            <FieldGroup label="Image generation" hint="When should AI generate images?">
              <div className="flex flex-wrap gap-2">
                {imagePolicyOptions.map((opt) => (
                  <Tooltip key={opt.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => update("imagePolicy", opt.value)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all",
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

        {/* Advanced */}
        <SectionCard
          title="Advanced"
          description="Fine-tune content rules and review gates."
        >
          <div className="space-y-5">
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
                placeholder="Any additional guidance for the AI when generating decks…"
                className="min-h-[80px] resize-none"
              />
            </FieldGroup>

            <div className="flex items-center gap-8 rounded-lg border border-border/40 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
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
            </div>
          </div>
        </SectionCard>

        {/* ─── Bottom action bar ─── */}
        <div className="sticky bottom-0 -mx-1 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
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
                  Saving…
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
                  Saving…
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
    </TooltipProvider>
  );
}
