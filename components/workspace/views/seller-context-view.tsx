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
  Save,
  Sparkles,
  Upload,
  X,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const meta = viewMeta["seller-context"];

export function SellerContextView() {
  const { currentBusiness, updateBusiness } = useBusinessContext();
  const [form, setForm] = React.useState<SellerContextForm>(
    defaultSellerContext(),
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [crawling, setCrawling] = React.useState(false);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);

  // Brief viewer state
  const [briefMd, setBriefMd] = React.useState<string | null>(null);
  const [briefEdited, setBriefEdited] = React.useState("");
  const [showBrief, setShowBrief] = React.useState(false);
  const [briefSaving, setBriefSaving] = React.useState(false);
  const [briefDirty, setBriefDirty] = React.useState(false);

  // Social links expand
  const [showSocials, setShowSocials] = React.useState(false);

  const logoInputRef = React.useRef<HTMLInputElement>(null);

  // Load existing data on mount — skip if user just clicked "Add new business"
  React.useEffect(() => {
    const isNewBusiness = sessionStorage.getItem("bestdecks_new_business");
    if (isNewBusiness) {
      sessionStorage.removeItem("bestdecks_new_business");
      setLoading(false);
      return; // Start with blank form for new business
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
              offerSummary: data.offerSummary ?? prev.offerSummary,
              servicesText: Array.isArray(data.services) ? data.services.join("\n") : (data.servicesText ?? prev.servicesText),
              differentiatorsText: Array.isArray(data.differentiators) ? data.differentiators.join("\n") : (data.differentiatorsText ?? prev.differentiatorsText),
              targetCustomer: data.targetCustomer ?? prev.targetCustomer,
              desiredOutcome: data.desiredOutcome ?? prev.desiredOutcome,
              proofPointsText: Array.isArray(data.proofPoints) ? data.proofPoints.join("\n") : (data.proofPointsText ?? prev.proofPointsText),
              constraintsText: Array.isArray(data.constraints) ? data.constraints.join("\n") : (data.constraintsText ?? prev.constraintsText),
              facebookUrl: data.facebookUrl ?? prev.facebookUrl,
              twitterUrl: data.twitterUrl ?? prev.twitterUrl,
              instagramUrl: data.instagramUrl ?? prev.instagramUrl,
              tiktokUrl: data.tiktokUrl ?? prev.tiktokUrl,
            }));
            if (data.logoUrl) setLogoPreview(data.logoUrl);
            // Show socials if any are filled
            if (data.facebookUrl || data.twitterUrl || data.instagramUrl || data.tiktokUrl) {
              setShowSocials(true);
            }
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

  function update(field: keyof SellerContextForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, SVG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    setForm((prev) => ({ ...prev, logoFile: file, logoUrl: "" }));
  }

  function removeLogo() {
    setLogoPreview(null);
    setForm((prev) => ({ ...prev, logoFile: null, logoUrl: "" }));
    if (logoInputRef.current) logoInputRef.current.value = "";
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
            facebookUrl: data.sellerContext.facebookUrl ?? prev.facebookUrl,
            twitterUrl: data.sellerContext.twitterUrl ?? prev.twitterUrl,
            instagramUrl: data.sellerContext.instagramUrl ?? prev.instagramUrl,
            tiktokUrl: data.sellerContext.tiktokUrl ?? prev.tiktokUrl,
          }));
          if (data.sellerContext.logoUrl) {
            update("logoUrl", data.sellerContext.logoUrl);
            setLogoPreview(data.sellerContext.logoUrl);
          }
          toast.success("Business context auto-filled from your website.");
        }
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
        // Sync business name in the switcher
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

  // Compute completion hints
  const filledFields = [form.companyName, form.offerSummary, form.targetCustomer, form.desiredOutcome].filter(Boolean).length;
  const completionPct = Math.round((filledFields / 4) * 100);

  if (loading) {
    return (
      <ViewLayout
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
      >
        {/* Auto-fill hero skeleton */}
        <div className="rounded-2xl border border-border/30 bg-card px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start gap-4">
            <Skeleton className="hidden sm:block size-11 rounded-xl shrink-0" />
            <div className="flex-1 space-y-3">
              <div>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-1.5 h-3 w-72" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-11 flex-1 rounded-md" />
                <Skeleton className="h-11 w-28 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Identity section skeleton */}
        <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-border/50 bg-card p-5">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-3 w-56 mb-5" />
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div>
                <Skeleton className="h-3 w-28 mb-2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card px-6 py-5 lg:w-[180px]">
            <Skeleton className="size-20 rounded-xl" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>

        {/* Positioning section skeleton */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <Skeleton className="h-4 w-24 mb-1" />
          <Skeleton className="h-3 w-64 mb-5" />
          <div className="space-y-5">
            <div>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-[80px] w-full rounded-md" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-[100px] w-full rounded-md" />
              </div>
              <div>
                <Skeleton className="h-3 w-28 mb-2" />
                <Skeleton className="h-[100px] w-full rounded-md" />
              </div>
            </div>
            <div>
              <Skeleton className="h-3 w-28 mb-2" />
              <Skeleton className="h-[70px] w-full rounded-md" />
            </div>
          </div>
        </div>

        {/* Evidence section skeleton */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-72 mb-5" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-[100px] w-full rounded-md" />
            </div>
            <div>
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-[100px] w-full rounded-md" />
            </div>
          </div>
        </div>
      </ViewLayout>
    );
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
      {/* ═══ Hero: Auto-fill from website ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card">
        {/* Decorative corner glow */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 size-40 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.18 255 / 20%), transparent 70%)" }}
        />
        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">
                  Auto-fill from your website
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Paste your URL and we&apos;ll extract everything — company details, services, positioning, even your logo.
                </p>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    value={form.websiteUrl}
                    onChange={(e) => update("websiteUrl", e.target.value)}
                    placeholder="yourcompany.com"
                    className="h-11 pl-10 text-[14px] bg-background/80"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && form.websiteUrl && !crawling) handleCrawl();
                    }}
                  />
                </div>
                <Button
                  onClick={handleCrawl}
                  disabled={crawling || !form.websiteUrl}
                  className="h-11 px-5 gap-2"
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
              {crawling && (
                <div className="flex items-center gap-2 text-[12px] text-primary animate-fade-in">
                  <div className="h-1 flex-1 max-w-[200px] rounded-full bg-primary/10 overflow-hidden">
                    <div className="h-full w-2/3 rounded-full bg-primary/50 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent, oklch(0.55 0.18 255 / 40%), transparent)", backgroundSize: "200% 100%" }} />
                  </div>
                  <span className="text-muted-foreground">Crawling site & building your profile…</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Identity: Name + Logo side by side ═══ */}
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <SectionCard title="Identity" description="How your brand appears on generated decks.">
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
          </div>
        </SectionCard>

        {/* Logo card — compact standalone */}
        <div className="card-elevated flex flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card px-6 py-5 lg:w-[180px]">
          {logoPreview ? (
            <div className="relative group">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Company logo"
                  className="size-full object-contain p-2"
                />
              </div>
              <button
                type="button"
                onClick={removeLogo}
                aria-label="Remove logo"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex size-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <ImageIcon className="size-5" />
              <span className="text-[10px] font-medium">Logo</span>
            </button>
          )}
          {!logoPreview && (
            <Input
              value={form.logoUrl}
              onChange={(e) => {
                update("logoUrl", e.target.value);
                if (e.target.value) setLogoPreview(e.target.value);
              }}
              placeholder="or paste URL"
              className="h-8 text-[11px] w-full text-center"
            />
          )}
          {logoPreview && (
            <p className="text-[10px] text-muted-foreground text-center">Shown on decks</p>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
            aria-label="Upload company logo"
          />
        </div>
      </div>

      {/* ═══ Positioning: Two columns for desktop efficiency ═══ */}
      <SectionCard
        title="Positioning"
        description="What you offer and why prospects should care."
      >
        <div className="space-y-5">
          <FieldGroup label="Offer summary">
            <Textarea
              value={form.offerSummary}
              onChange={(e) => update("offerSummary", e.target.value)}
              placeholder="We build high-converting landing pages for SaaS companies that want to 2-3x their demo requests."
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>

          <div className="grid gap-5 sm:grid-cols-2">
            <FieldGroup label="Services" hint="One per line">
              <Textarea
                value={form.servicesText}
                onChange={(e) => update("servicesText", e.target.value)}
                placeholder={`Landing page design\nConversion rate optimization\nA/B testing`}
                className="min-h-[100px] resize-none"
              />
            </FieldGroup>
            <FieldGroup label="Differentiators" hint="One per line">
              <Textarea
                value={form.differentiatorsText}
                onChange={(e) => update("differentiatorsText", e.target.value)}
                placeholder={`12+ years in SaaS\n200+ pages launched\nAvg 2.4x lift in demo requests`}
                className="min-h-[100px] resize-none"
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Desired outcome">
            <Textarea
              value={form.desiredOutcome}
              onChange={(e) => update("desiredOutcome", e.target.value)}
              placeholder="The prospect should understand our value prop and book a discovery call."
              className="min-h-[70px] resize-none"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      {/* ═══ Evidence: Proof + Constraints side by side ═══ */}
      <SectionCard
        title="Evidence & guardrails"
        description="Proof points make decks persuasive. Constraints keep them safe."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldGroup
            label="Proof points"
            hint="Case studies, metrics, logos"
          >
            <Textarea
              value={form.proofPointsText}
              onChange={(e) => update("proofPointsText", e.target.value)}
              placeholder="Helped Stripe increase signups by 34%"
              className="min-h-[100px] resize-none"
            />
          </FieldGroup>
          <FieldGroup
            label="Constraints"
            hint="Things to avoid"
          >
            <Textarea
              value={form.constraintsText}
              onChange={(e) => update("constraintsText", e.target.value)}
              placeholder="Don't mention pricing, avoid competitor comparisons"
              className="min-h-[100px] resize-none"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      {/* ═══ Social links — inline collapsible ═══ */}
      <div className="rounded-xl border border-border/40 bg-card">
        <button
          type="button"
          onClick={() => setShowSocials(!showSocials)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/30 rounded-xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <div className="flex items-center gap-2.5">
            <Globe className="size-4 text-muted-foreground" />
            <span className="text-[13px] font-medium text-foreground">Social profiles</span>
            <span className="text-[11px] text-muted-foreground">Optional</span>
          </div>
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", showSocials && "rotate-180")} />
        </button>
        {showSocials && (
          <div className="border-t border-border/30 px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FieldGroup label="Facebook">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/40">fb.com/</span>
                  <Input value={form.facebookUrl} onChange={(e) => update("facebookUrl", e.target.value)} placeholder="page" className="h-8 pl-14 text-xs" />
                </div>
              </FieldGroup>
              <FieldGroup label="X (Twitter)">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/40">x.com/</span>
                  <Input value={form.twitterUrl} onChange={(e) => update("twitterUrl", e.target.value)} placeholder="handle" className="h-8 pl-12 text-xs" />
                </div>
              </FieldGroup>
              <FieldGroup label="Instagram">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/40">@</span>
                  <Input value={form.instagramUrl} onChange={(e) => update("instagramUrl", e.target.value)} placeholder="handle" className="h-8 pl-7 text-xs" />
                </div>
              </FieldGroup>
              <FieldGroup label="TikTok">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/40">@</span>
                  <Input value={form.tiktokUrl} onChange={(e) => update("tiktokUrl", e.target.value)} placeholder="handle" className="h-8 pl-7 text-xs" />
                </div>
              </FieldGroup>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Business intelligence brief ═══ */}
      <div className="rounded-xl border border-border/40 bg-card">
        <button
          type="button"
          onClick={() => setShowBrief(!showBrief)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30 rounded-xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                Business intelligence brief
              </p>
              <p className="text-[11px] text-muted-foreground">
                {briefMd
                  ? "AI-generated dossier — edit to refine personalization"
                  : "Run auto-fill above to generate a comprehensive analysis"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {briefMd && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
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
                <p className="text-[13px] font-medium text-foreground">
                  No brief yet
                </p>
                <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
                  Enter your website URL above and click Auto-fill. We&apos;ll
                  generate a comprehensive business intelligence brief.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">
                    This document feeds all deck personalization. Edit freely.
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
                  Generated by AI from your website and web research. Edits here won&apos;t affect form fields above.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Sticky bottom action bar ═══ */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Mini completion indicator */}
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="flex h-2 w-24 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {filledFields}/4 required
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground sm:hidden">
            {form.companyName
              ? `Editing ${form.companyName}`
              : "Fill in your business details"}
          </p>
        </div>
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
                Continue to Deck Style
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </ViewLayout>
  );
}
