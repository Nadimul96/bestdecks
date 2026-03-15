"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  Coins,
  CreditCard,
  MessageSquare,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ViewLayout, SectionCard } from "../view-layout";
import {
  viewMeta,
  pricingPlans,
  aiModelOptions,
  type PlanTier,
  type PricingPlan,
  type AIModel,
} from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const meta = viewMeta.pricing;

export function PricingView() {
  const { credits } = useBusinessContext();
  const [selectedTier, setSelectedTier] = React.useState<PlanTier>(
    credits?.planTier ?? "growth",
  );
  const [addonCredits, setAddonCredits] = React.useState(0);
  const [selectedModel, setSelectedModel] = React.useState<AIModel>("claude");
  const [annual, setAnnual] = React.useState(false);

  const plan = pricingPlans.find((p) => p.tier === selectedTier)!;
  const addonCost = addonCredits * plan.addonPricePerCredit;
  const basePrice = annual ? Math.round(plan.priceMonthly * 0.8) : plan.priceMonthly;
  const totalMonthly = basePrice + addonCost;
  const totalCredits = plan.credits + addonCredits;
  const effectivePerCredit =
    totalCredits > 0 ? (totalMonthly / totalCredits).toFixed(2) : "0.00";

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
    >
      {/* Tagline */}
      <div className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <Coins className="size-4" />
          1 credit = 1 deck, end to end
        </div>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-all",
            !annual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setAnnual(true)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-all",
            annual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Annual
          <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            Save 20%
          </span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {pricingPlans.map((p) => (
          <PlanCard
            key={p.tier}
            plan={p}
            isSelected={selectedTier === p.tier}
            isPopular={p.tier === "growth"}
            annual={annual}
            currentTier={credits?.planTier}
            onSelect={() => {
              setSelectedTier(p.tier);
              setAddonCredits(0);
            }}
          />
        ))}
      </div>

      {/* Add-on credits slider */}
      {plan.tier !== "enterprise" && (
        <SectionCard
          title="Need more credits?"
          description={`Slide to add extra credits to your ${plan.name} plan at $${plan.addonPricePerCredit.toFixed(2)}/credit`}
        >
          <div className="space-y-6">
            {/* Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">
                  Add-on credits
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-primary">
                  +{addonCredits} credits
                </span>
              </div>
              <Slider
                value={[addonCredits]}
                onValueChange={(v: number[]) => setAddonCredits(v[0])}
                min={0}
                max={plan.maxAddonCredits}
                step={plan.tier === "starter" ? 5 : plan.tier === "growth" ? 10 : 25}
                className="w-full"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>0</span>
                <span>{plan.maxAddonCredits} credits</span>
              </div>
            </div>

            {/* Cost summary */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">
                    {plan.name} plan ({plan.credits} credits)
                  </span>
                  <span className="font-medium">${basePrice}/mo</span>
                </div>
                {addonCredits > 0 && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">
                      Add-on ({addonCredits} credits × ${plan.addonPricePerCredit.toFixed(2)})
                    </span>
                    <span className="font-medium">
                      +${addonCost.toFixed(2)}/mo
                    </span>
                  </div>
                )}
                <div className="border-t border-border/40 pt-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-foreground">
                        ${totalMonthly.toFixed(2)}/mo
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {totalCredits} credits total · ${effectivePerCredit}/deck
                      </p>
                    </div>
                    <Button className="gap-1.5 shadow-sm">
                      <CreditCard className="size-3.5" />
                      {credits?.planTier === selectedTier
                        ? addonCredits > 0
                          ? "Add credits"
                          : "Current plan"
                        : "Upgrade now"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* AI model preference */}
      <SectionCard
        title="AI model preference"
        description="Choose which AI model generates your decks. This affects quality and speed."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {aiModelOptions.map((model) => (
            <button
              key={model.value}
              type="button"
              onClick={() => setSelectedModel(model.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                selectedModel === model.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border/60 bg-card hover:border-border",
              )}
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="size-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {model.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {model.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Current usage — show if user has credits */}
      {credits && (
        <SectionCard
          title="Current usage"
          description={`Your ${pricingPlans.find((p) => p.tier === credits.planTier)?.name ?? ""} plan resets ${new Date(credits.resetDate).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
        >
          <div className="flex items-center gap-6">
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Credits used</span>
                <span className="font-semibold tabular-nums">
                  {credits.monthlyAllowance + credits.bonusCredits - credits.balance}
                  {" / "}
                  {credits.monthlyAllowance + credits.bonusCredits}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    credits.balance / (credits.monthlyAllowance + credits.bonusCredits) > 0.2
                      ? "bg-primary"
                      : "bg-amber-500",
                  )}
                  style={{
                    width: `${Math.round(((credits.monthlyAllowance + credits.bonusCredits - credits.balance) / (credits.monthlyAllowance + credits.bonusCredits)) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {credits.balance} credit{credits.balance !== 1 ? "s" : ""} remaining
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* FAQ or final CTA */}
      <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
        <h3 className="text-[16px] font-semibold text-foreground">
          Need a custom volume?
        </h3>
        <p className="mt-2 text-[13px] text-muted-foreground">
          For teams generating 500+ decks per month, we offer custom pricing, SLA
          guarantees, and dedicated support.
        </p>
        <Button variant="outline" className="mt-4 gap-1.5">
          <MessageSquare className="size-3.5" />
          Talk to sales
        </Button>
      </div>
    </ViewLayout>
  );
}

/* ─────────────────────────────────────────────
   Plan Card
   ───────────────────────────────────────────── */

function PlanCard({
  plan,
  isSelected,
  isPopular,
  annual,
  currentTier,
  onSelect,
}: {
  plan: PricingPlan;
  isSelected: boolean;
  isPopular: boolean;
  annual: boolean;
  currentTier?: PlanTier;
  onSelect: () => void;
}) {
  const isEnterprise = plan.tier === "enterprise";
  const isCurrent = currentTier === plan.tier;
  const price = annual ? Math.round(plan.priceMonthly * 0.8) : plan.priceMonthly;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-5 transition-all",
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-lg"
          : "border-border/50 bg-card hover:border-border hover:shadow-md",
        isPopular && "ring-1 ring-primary/10",
      )}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">
            <Star className="size-3 fill-current" />
            Most Popular
          </span>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-3 right-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white">
            <Check className="size-3" />
            Current
          </span>
        </div>
      )}

      <div className="space-y-4 flex-1">
        {/* Plan name */}
        <div>
          <h3 className="text-[16px] font-bold text-foreground">{plan.name}</h3>
          {!isEnterprise && (
            <p className="text-[12px] text-muted-foreground">
              {plan.credits} deck{plan.credits !== 1 ? "s" : ""}/month
            </p>
          )}
        </div>

        {/* Price */}
        <div>
          {isEnterprise ? (
            <p className="text-2xl font-bold text-foreground">Custom</p>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                ${price}
              </span>
              <span className="text-[13px] text-muted-foreground">/mo</span>
            </div>
          )}
          {!isEnterprise && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ${(price / plan.credits).toFixed(2)} per deck
            </p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-[12px] text-foreground"
            >
              <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <Button
        variant={isSelected ? "default" : "outline"}
        className="mt-5 w-full gap-1.5"
        onClick={onSelect}
      >
        {isEnterprise ? (
          <>
            <MessageSquare className="size-3.5" />
            Contact sales
          </>
        ) : isCurrent ? (
          "Current plan"
        ) : (
          <>
            <Zap className="size-3.5" />
            {isSelected ? "Selected" : "Select plan"}
          </>
        )}
      </Button>
    </div>
  );
}
