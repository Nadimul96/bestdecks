"use client";

import * as React from "react";
import {
  ChevronDown,
  FileText,
  Globe,
  LoaderCircle,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import {
  viewMeta,
  defaultSellerContext,
  type SellerContextForm,
} from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["seller-context"];

export function SellerContextView() {
  const [form, setForm] = React.useState<SellerContextForm>(
    defaultSellerContext(),
  );
  const [saving, setSaving] = React.useState(false);
  const [crawling, setCrawling] = React.useState(false);

  // Brief viewer state
  const [briefMd, setBriefMd] = React.useState<string | null>(null);
  const [briefEdited, setBriefEdited] = React.useState("");
  const [showBrief, setShowBrief] = React.useState(false);
  const [briefLoading, setBriefLoading] = React.useState(false);
  const [briefSaving, setBriefSaving] = React.useState(false);
  const [briefDirty, setBriefDirty] = React.useState(false);

  // Load existing brief on mount
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/seller-brief");
        if (res.ok) {
          const data = await res.json();
          if (data.markdown) {
            setBriefMd(data.markdown);
            setBriefEdited(data.markdown);
          }
        }
      } catch {
        // Non-blocking — brief is optional
      }
    })();
  }, []);

  function update(field: keyof SellerContextForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCrawl() {
    if (!form.websiteUrl) return;
    setCrawling(true);
    try {
      const res = await fetch("/api/onboarding/crawl-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: form.websiteUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sellerContext) {
          setForm((prev) => ({
            ...prev,
            companyName: data.sellerContext.companyName ?? prev.companyName,
            offerSummary: data.sellerContext.offerSummary ?? prev.offerSummary,
            servicesText:
              data.sellerContext.services?.join("\n") ?? prev.servicesText,
            differentiatorsText:
              data.sellerContext.differentiators?.join("\n") ??
              prev.differentiatorsText,
            targetCustomer:
              data.sellerContext.targetCustomer ?? prev.targetCustomer,
            desiredOutcome:
              data.sellerContext.desiredOutcome ?? prev.desiredOutcome,
            proofPointsText:
              data.sellerContext.proofPoints?.join("\n") ??
              prev.proofPointsText,
          }));
          toast.success("Business context auto-filled from your website.");
        }
        // Also update the brief if it was returned
        if (data.sellerBriefMd) {
          setBriefMd(data.sellerBriefMd);
          setBriefEdited(data.sellerBriefMd);
          setBriefDirty(false);
        }
      } else {
        const err = await res.json().catch(() => null);
        toast.error(
          err?.error ??
            "Could not analyze website. Try entering details manually.",
        );
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCrawling(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/seller-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Business context saved.");
      } else {
        toast.error("Failed to save. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBrief() {
    setBriefSaving(true);
    try {
      const res = await fetch("/api/onboarding/seller-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: briefEdited }),
      });
      if (res.ok) {
        setBriefMd(briefEdited);
        setBriefDirty(false);
        toast.success("Business brief saved.");
      } else {
        toast.error("Failed to save brief.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBriefSaving(false);
    }
  }

  return (
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
              Save context
            </>
          )}
        </Button>
      }
    >
      {/* Auto-fill from website */}
      <SectionCard
        title="Quick start"
        description="Paste your website and we'll extract your business context automatically."
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={form.websiteUrl}
              onChange={(e) => update("websiteUrl", e.target.value)}
              placeholder="https://yourcompany.com"
              className="h-10 pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleCrawl}
            disabled={crawling || !form.websiteUrl}
          >
            {crawling ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Auto-fill
              </>
            )}
          </Button>
        </div>
      </SectionCard>

      {/* Core business details */}
      <SectionCard
        title="Core details"
        description="The foundation for every personalized deck."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldGroup label="Company name">
            <Input
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Acme Agency"
              className="h-10"
            />
          </FieldGroup>
          <FieldGroup label="Target customer">
            <Input
              value={form.targetCustomer}
              onChange={(e) => update("targetCustomer", e.target.value)}
              placeholder="B2B SaaS founders, $1M-$10M ARR"
              className="h-10"
            />
          </FieldGroup>
          <FieldGroup label="Offer summary" className="sm:col-span-2">
            <Textarea
              value={form.offerSummary}
              onChange={(e) => update("offerSummary", e.target.value)}
              placeholder="We build high-converting landing pages for SaaS companies that want to 2-3x their demo requests."
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>
          <FieldGroup label="Desired outcome" className="sm:col-span-2">
            <Textarea
              value={form.desiredOutcome}
              onChange={(e) => update("desiredOutcome", e.target.value)}
              placeholder="The prospect should understand our value prop and book a discovery call."
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      {/* Detailed fields */}
      <SectionCard
        title="Supporting details"
        description="Optional but makes decks significantly more persuasive."
      >
        <div className="space-y-5">
          <FieldGroup label="Services" hint="One per line">
            <Textarea
              value={form.servicesText}
              onChange={(e) => update("servicesText", e.target.value)}
              placeholder={`Landing page design\nConversion rate optimization\nA/B testing`}
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>
          <FieldGroup label="Differentiators" hint="One per line">
            <Textarea
              value={form.differentiatorsText}
              onChange={(e) => update("differentiatorsText", e.target.value)}
              placeholder={`12+ years in SaaS\n200+ pages launched\nAvg 2.4x lift in demo requests`}
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <FieldGroup
              label="Proof points"
              hint="Case studies, metrics, logos"
            >
              <Textarea
                value={form.proofPointsText}
                onChange={(e) => update("proofPointsText", e.target.value)}
                placeholder="Helped Stripe increase signups by 34%"
                className="min-h-[80px] resize-none"
              />
            </FieldGroup>
            <FieldGroup
              label="Constraints"
              hint="Things to avoid or be careful about"
            >
              <Textarea
                value={form.constraintsText}
                onChange={(e) => update("constraintsText", e.target.value)}
                placeholder="Don't mention pricing, avoid competitor comparisons"
                className="min-h-[80px] resize-none"
              />
            </FieldGroup>
          </div>
        </div>
      </SectionCard>

      {/* Business intelligence brief — collapsible .md editor */}
      <div className="rounded-xl border border-border/40 bg-card">
        <button
          type="button"
          onClick={() => setShowBrief(!showBrief)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Business intelligence brief
              </p>
              <p className="text-xs text-muted-foreground">
                {briefMd
                  ? "AI-generated dossier — edit to refine how decks are personalized"
                  : "Run auto-fill above to generate a comprehensive business analysis"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {briefMd && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Generated
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                showBrief && "rotate-180",
              )}
            />
          </div>
        </button>

        {showBrief && (
          <div className="border-t border-border/40 px-5 py-4">
            {!briefMd ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No brief yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Enter your website URL above and click Auto-fill. We'll
                  generate a comprehensive business intelligence brief using AI
                  web research.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    This markdown document feeds all deck personalization. Edit
                    freely — your changes are saved separately.
                  </p>
                  <Button
                    size="sm"
                    variant={briefDirty ? "default" : "outline"}
                    onClick={handleSaveBrief}
                    disabled={briefSaving || !briefDirty}
                  >
                    {briefSaving ? (
                      <>
                        <LoaderCircle className="size-3.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="size-3.5" />
                        {briefDirty ? "Save brief" : "Saved"}
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={briefEdited}
                  onChange={(e) => {
                    setBriefEdited(e.target.value);
                    setBriefDirty(e.target.value !== briefMd);
                  }}
                  className="min-h-[400px] resize-y font-mono text-xs leading-relaxed"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Tip: This brief is generated by Perplexity AI using your
                  website content and web research. Edits here won't affect the
                  form fields above.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </ViewLayout>
  );
}
