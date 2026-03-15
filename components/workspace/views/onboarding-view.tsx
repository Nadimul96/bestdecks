"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Globe,
  Info,
  LoaderCircle,
  Rocket,
  Sparkles,
  Target,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import {
  viewMeta,
  intentOptions,
  type CurrentUser,
  type DeckIntent,
  type Business,
} from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const meta = viewMeta.onboarding;

const steps = [
  {
    id: "business",
    label: "Your Business",
    icon: Globe,
  },
  {
    id: "intent",
    label: "Your Goal",
    icon: Target,
  },
  {
    id: "targets",
    label: "First Targets",
    icon: Upload,
  },
] as const;

type StepId = (typeof steps)[number]["id"];

interface OnboardingState {
  websiteUrl: string;
  companyName: string;
  offerSummary: string;
  targetCustomer: string;
  intent: DeckIntent;
  websitesText: string;
  contactsCsvText: string;
  showCsv: boolean;
}

export function OnboardingView({ currentUser }: { currentUser: CurrentUser }) {
  const { currentBusiness, addBusiness, updateBusiness } = useBusinessContext();

  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [crawling, setCrawling] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<OnboardingState>({
    websiteUrl: currentBusiness?.websiteUrl ?? "",
    companyName: currentBusiness?.name ?? "",
    offerSummary: currentBusiness?.sellerContext?.offerSummary ?? "",
    targetCustomer: currentBusiness?.sellerContext?.targetCustomer ?? "",
    intent: "cold_pitch",
    websitesText: "",
    contactsCsvText: "",
    showCsv: false,
  });

  const step = steps[currentStep];
  const progress = Math.round(((currentStep + 1) / steps.length) * 100);

  function update<K extends keyof OnboardingState>(
    field: K,
    value: OnboardingState[K],
  ) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAutofill() {
    if (!state.websiteUrl) return;
    setCrawling(true);
    try {
      const res = await fetch("/api/onboarding/crawl-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: state.websiteUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sellerContext) {
          setState((prev) => ({
            ...prev,
            companyName: data.sellerContext.companyName ?? prev.companyName,
            offerSummary: data.sellerContext.offerSummary ?? prev.offerSummary,
            targetCustomer:
              data.sellerContext.targetCustomer ?? prev.targetCustomer,
          }));
          toast.success("We analyzed your website and filled in the details.");
        }
      } else {
        toast.error("Couldn\u2019t analyze that website. Fill in the fields manually.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCrawling(false);
    }
  }

  function handleNext() {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      // Save seller context
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

      // Save questionnaire with archetype derived from intent
      const archetypeMap: Record<DeckIntent, string> = {
        cold_pitch: "cold_outreach",
        post_call: "warm_intro",
        agency_rfp: "agency_proposal",
        investor: "cold_outreach",
        partnership: "warm_intro",
        event_sponsor: "agency_proposal",
        product_demo: "warm_intro",
        upsell: "warm_intro",
        board_update: "agency_proposal",
        custom: "cold_outreach",
      };
      await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetype: archetypeMap[state.intent] }),
      });

      // If targets were provided, create a run
      const urls = state.websitesText
        .split("\n")
        .filter((l) => l.trim().length > 0);
      if (urls.length > 0) {
        await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websitesText: state.websitesText,
            contactsCsvText: state.contactsCsvText || undefined,
          }),
        });
      }

      // Create or update the business entity in context
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

        // Persist to API (may not exist yet)
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

      if (urls.length > 0) {
        toast.success(
          `Setup complete! Launched a run with ${urls.length} target${urls.length > 1 ? "s" : ""}.`,
        );
      } else {
        toast.success("Setup complete! Add targets whenever you\u2019re ready.");
      }

      window.location.hash = "overview";
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const websiteCount = state.websitesText
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  const canAdvance =
    step.id === "business"
      ? state.websiteUrl.length > 0
      : step.id === "intent"
        ? !!state.intent
        : true;

  return (
    <ViewLayout eyebrow={meta.eyebrow} title={meta.title} description={meta.description}>
      {/* Step indicators — clean pill bar */}
      <div className="flex items-center gap-2">
        {steps.map((s, index) => (
          <React.Fragment key={s.id}>
            <button
              type="button"
              onClick={() => index <= currentStep && setCurrentStep(index)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                index === currentStep
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : index < currentStep
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {index < currentStep ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <s.icon className="size-3.5" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{index + 1}</span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  index < currentStep ? "bg-emerald-500/30" : "bg-border",
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {currentStep + 1} of {steps.length}
          </span>
          <span>{progress}% complete</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      {/* ───────── Step 1: Business ───────── */}
      {step.id === "business" && (
        <div className="space-y-6">
          {/* Hero card — website input + auto-fill */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
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
                  onKeyDown={(e) => e.key === "Enter" && handleAutofill()}
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
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    Auto-fill
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Auto-filled fields */}
          <SectionCard
            title="Confirm your details"
            description="Edit anything that doesn\u2019t look right."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Company name">
                <Input
                  value={state.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="Acme Agency"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="Who do you sell to?">
                <Input
                  value={state.targetCustomer}
                  onChange={(e) => update("targetCustomer", e.target.value)}
                  placeholder="B2B SaaS founders, $1M-$10M ARR"
                  className="h-10"
                />
              </FieldGroup>
              <FieldGroup label="What do you offer?" className="sm:col-span-2">
                <Textarea
                  value={state.offerSummary}
                  onChange={(e) => update("offerSummary", e.target.value)}
                  placeholder="We build high-converting landing pages for SaaS companies that want to 2-3x their demo requests."
                  className="min-h-[80px] resize-none"
                />
              </FieldGroup>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ───────── Step 2: Intent ───────── */}
      {step.id === "intent" && (
        <div className="space-y-6">
          <SectionCard
            title="What are you building decks for?"
            description="This shapes how we research targets and frame your pitch."
          >
            <TooltipProvider delayDuration={200}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {intentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update("intent", opt.value)}
                    className={cn(
                      "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                      state.intent === opt.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/60 bg-card hover:border-border",
                    )}
                  >
                    <span className="mt-0.5 text-lg shrink-0">{opt.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {opt.description}
                      </p>
                    </div>
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
            </TooltipProvider>
          </SectionCard>
        </div>
      )}

      {/* ───────── Step 3: Targets ───────── */}
      {step.id === "targets" && (
        <div className="space-y-6">
          <SectionCard
            title="Add your first targets"
            description="Paste the websites of companies you want decks for. You can always add more later."
          >
            <FieldGroup
              label="Website URLs"
              hint={
                websiteCount > 0
                  ? `${websiteCount} target${websiteCount > 1 ? "s" : ""}`
                  : "One URL per line"
              }
            >
              <Textarea
                value={state.websitesText}
                onChange={(e) => update("websitesText", e.target.value)}
                placeholder={`https://acmeplumbing.com\nhttps://northshoreclinic.com\nhttps://sunsetlogistics.io`}
                className="min-h-[160px] resize-none font-mono text-xs leading-relaxed"
              />
            </FieldGroup>
          </SectionCard>

          {/* Inline CSV — collapsible */}
          <div className="rounded-xl border border-border/40 bg-card">
            <button
              type="button"
              onClick={() => update("showCsv", !state.showCsv)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Have a CSV with contacts?
                </p>
                <p className="text-xs text-muted-foreground">
                  Optional — personalizes greetings and CTAs per person
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
                <FieldGroup label="Contacts CSV" hint="Optional">
                  <Textarea
                    value={state.contactsCsvText}
                    onChange={(e) => update("contactsCsvText", e.target.value)}
                    placeholder={`websiteUrl,firstName,lastName,role,email\nhttps://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com\nhttps://northshoreclinic.com,Marcus,Reed,Director,marcus@northshoreclinic.com`}
                    className="min-h-[120px] resize-none font-mono text-xs leading-relaxed"
                  />
                </FieldGroup>
                <p className="text-xs text-muted-foreground">
                  Columns:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    websiteUrl, firstName, lastName, role, email, campaignGoal,
                    notes
                  </code>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentStep === 0}
          className="text-muted-foreground"
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step.id === "targets" && (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                update("websitesText", "");
                handleFinish();
              }}
            >
              Skip for now
            </Button>
          )}
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!canAdvance}>
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Rocket className="size-4" />
                  {websiteCount > 0
                    ? `Finish & launch ${websiteCount} target${websiteCount > 1 ? "s" : ""}`
                    : "Finish setup"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </ViewLayout>
  );
}
