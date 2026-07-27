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
  type DeckIntent,
} from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { submitSetup } from "@/lib/setup-submission";
import { cn } from "@/lib/utils";
import { TARGET_CSV_COLUMNS } from "@/src/domain/intake-fields";

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

interface OnboardingState {
  websiteUrl: string;
  companyName: string;
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  intent: DeckIntent;
  audience: string;
  objective: string;
  callToAction: string;
  websitesText: string;
  contactsCsvText: string;
  showCsv: boolean;
}

export function OnboardingView() {
  const { currentBusiness, refreshBusinesses } = useBusinessContext();

  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<OnboardingState>({
    websiteUrl: currentBusiness?.websiteUrl ?? "",
    companyName: currentBusiness?.name ?? "",
    offerSummary: currentBusiness?.sellerContext?.offerSummary ?? "",
    servicesText: currentBusiness?.sellerContext?.servicesText ?? "",
    differentiatorsText: currentBusiness?.sellerContext?.differentiatorsText ?? "",
    targetCustomer: currentBusiness?.sellerContext?.targetCustomer ?? "",
    desiredOutcome: currentBusiness?.sellerContext?.desiredOutcome ?? "",
    intent: "cold_pitch",
    audience: currentBusiness?.questionnaire?.audience ?? "",
    objective: currentBusiness?.questionnaire?.objective ?? "",
    callToAction: currentBusiness?.questionnaire?.callToAction ?? "",
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
      const result = await submitSetup(state);
      await refreshBusinesses();

      if (result.targetCount > 0) {
        toast.success(
          `Setup complete! Queued a run with ${result.targetCount} target${result.targetCount > 1 ? "s" : ""}.`,
        );
      } else {
        toast.success("Setup complete! Add targets whenever you\u2019re ready.");
      }

      window.location.hash = "overview";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save setup.");
    } finally {
      setSaving(false);
    }
  }

  const websiteCount = state.websitesText
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  const canAdvance =
    step.id === "business"
      ? [
          state.websiteUrl,
          state.offerSummary,
          state.servicesText,
          state.differentiatorsText,
          state.targetCustomer,
          state.desiredOutcome,
        ].every((value) => value.trim().length > 0)
      : step.id === "intent"
        ? [state.audience, state.objective, state.callToAction]
          .every((value) => value.trim().length > 0)
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
                "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                index === currentStep
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : index < currentStep
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-emerald-500/15"
                    : "bg-muted text-muted-foreground cursor-default",
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
                  "h-px flex-1 transition-colors",
                  index < currentStep ? "bg-emerald-500/40" : "bg-border/60",
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
          {/* Seller website anchor. Automatic analysis is intentionally unavailable. */}
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
                  Automatic analysis is paused; enter the details below.
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
                />
              </div>
              <Button
                disabled
                title="Automatic analysis requires a future durable worker job."
                className="h-11 px-5"
              >
                <Zap className="size-4" />
                Manual entry
              </Button>
            </div>
          </div>

          {/* Seller-entered fields */}
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
                  placeholder="We design and implement landing pages for B2B software teams."
                  className="min-h-[80px] resize-none"
                />
              </FieldGroup>
              <FieldGroup label="Services" hint="One per line">
                <Textarea
                  value={state.servicesText}
                  onChange={(e) => update("servicesText", e.target.value)}
                  placeholder={"Landing-page strategy\nDesign and implementation"}
                  className="min-h-[96px] resize-none"
                />
              </FieldGroup>
              <FieldGroup label="Differentiators" hint="One per line">
                <Textarea
                  value={state.differentiatorsText}
                  onChange={(e) => update("differentiatorsText", e.target.value)}
                  placeholder={"Operator-led delivery\nEvidence-backed recommendations"}
                  className="min-h-[96px] resize-none"
                />
              </FieldGroup>
              <FieldGroup label="Desired customer outcome" className="sm:col-span-2">
                <Textarea
                  value={state.desiredOutcome}
                  onChange={(e) => update("desiredOutcome", e.target.value)}
                  placeholder="The concrete outcome your buyer should achieve."
                  className="min-h-[72px] resize-none"
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
                      "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                      state.intent === opt.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/60 bg-card hover:border-border hover:shadow-sm",
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

          <SectionCard
            title="Define the campaign"
            description="These operator-supplied facts are required; Bestdecks will not invent them."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Audience">
                <Input
                  value={state.audience}
                  onChange={(e) => update("audience", e.target.value)}
                  placeholder="VP Sales at mid-market B2B SaaS companies"
                />
              </FieldGroup>
              <FieldGroup label="Call to action">
                <Input
                  value={state.callToAction}
                  onChange={(e) => update("callToAction", e.target.value)}
                  placeholder="Review the evidence together in a 20-minute call"
                />
              </FieldGroup>
              <FieldGroup label="Objective" className="sm:col-span-2">
                <Textarea
                  value={state.objective}
                  onChange={(e) => update("objective", e.target.value)}
                  placeholder="What this deck should help the recipient understand or decide."
                  className="min-h-[72px] resize-none"
                />
              </FieldGroup>
            </div>
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
                placeholder={`https://target-one.example\nhttps://target-two.example\nhttps://target-three.example`}
                className="min-h-[160px] resize-none font-mono text-xs leading-relaxed"
              />
            </FieldGroup>
          </SectionCard>

          {/* Inline CSV — collapsible */}
          <div className="rounded-xl border border-border/40 bg-card">
            <button
              type="button"
              onClick={() => update("showCsv", !state.showCsv)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/30 rounded-xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Have a CSV with target metadata?
                </p>
                <p className="text-xs text-muted-foreground">
                  Optional — adds names, roles, goals, and notes. No recipient-email columns.
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
                <FieldGroup label="Target CSV" hint="Optional">
                  <Textarea
                    value={state.contactsCsvText}
                    onChange={(e) => update("contactsCsvText", e.target.value)}
                    placeholder={`websiteUrl,firstName,lastName,role,campaignGoal,notes\nhttps://target-one.example,Casey,Lee,Founder,Review operations,"Regional expansion, 2026"\nhttps://target-two.example,Morgan,Reed,Director,Assess workflow,New service line`}
                    className="min-h-[120px] resize-none font-mono text-xs leading-relaxed"
                  />
                </FieldGroup>
                <p className="text-xs text-muted-foreground">
                  Columns:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {TARGET_CSV_COLUMNS.join(", ")}
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
