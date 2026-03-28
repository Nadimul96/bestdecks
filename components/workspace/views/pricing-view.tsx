"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  Coins,
  CreditCard,
  MessageSquare,
  Plus,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

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

const TOPUP_PACKS = [
  { credits: 5, price: 12, perCredit: 2.40 },
  { credits: 15, price: 30, perCredit: 2.00 },
  { credits: 50, price: 75, perCredit: 1.50 },
  { credits: 100, price: 120, perCredit: 1.20 },
];

export function PricingView() {
  const { credits } = useBusinessContext();
  const [selectedTier, setSelectedTier] = React.useState<PlanTier>(
    credits?.planTier ?? "growth",
  );
  const [selectedModel, setSelectedModel] = React.useState<AIModel>("claude");
  const [annual, setAnnual] = React.useState(false);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);

  const plan = pricingPlans.find((p) => p.tier === selectedTier)!;
  const basePrice = annual ? Math.round(plan.priceMonthly * 0.8) : plan.priceMonthly;

  const currentPlan = pricingPlans.find((p) => p.tier === credits?.planTier);
  const hasActivePlan = credits?.planTier && credits.planTier !== "enterprise";

  async function handleCheckout(tier: PlanTier, isAnnual: boolean) {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, annual: isAnnual }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Could not start checkout. Please try again.");
      }
    } catch {
      toast.error("Could not start checkout. Please try again or contact support.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleTopup(pack: typeof TOPUP_PACKS[number]) {
    toast.info(`Top-up of ${pack.credits} credits for $${pack.price} — Stripe integration coming soon!`);
  }

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
    >
      {/* ── Current plan + credits banner ── */}
      {credits && (
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-stretch divide-y sm:divide-y-0 sm:divide-x divide-border/40">
            {/* Plan info */}
            <div className="flex-1 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <CreditCard className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Current plan</p>
                  <p className="text-[16px] font-bold text-foreground">
                    {currentPlan?.name ?? "Free"}
                  </p>
                </div>
              </div>
              {currentPlan && (
                <p className="text-[12px] text-muted-foreground">
                  {currentPlan.credits} decks/month &middot; Resets {new Date(credits.resetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              )}
              {!currentPlan && (
                <p className="text-[12px] text-muted-foreground">
                  You&apos;re on the free trial with {credits.balance} credit{credits.balance !== 1 ? "s" : ""} remaining
                </p>
              )}
            </div>

            {/* Credits remaining */}
            <div className="flex-1 p-5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Credits remaining</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-foreground">{credits.balance}</span>
                <span className="text-[13px] text-muted-foreground">
                  / {credits.monthlyAllowance + credits.bonusCredits}
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    credits.balance / Math.max(credits.monthlyAllowance + credits.bonusCredits, 1) > 0.2
                      ? "bg-primary"
                      : credits.balance > 0
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((credits.balance / Math.max(credits.monthlyAllowance + credits.bonusCredits, 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Quick top-up CTA */}
            <div className="flex items-center justify-center p-5 sm:px-8">
              <Button
                variant="outline"
                className="gap-2 h-10"
                onClick={() => {
                  document.getElementById("topup-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Plus className="size-4" />
                Top up credits
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tagline */}
      <div className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <Coins className="size-4" />
          1 credit = 1 personalized deck
        </div>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
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
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
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
            loading={checkoutLoading}
            onSelect={() => {
              if (p.tier !== "enterprise" && p.tier !== credits?.planTier) {
                handleCheckout(p.tier, annual);
              } else {
                setSelectedTier(p.tier);
              }
            }}
          />
        ))}
      </div>

      {/* ── Top-up credit packs ── */}
      <div id="topup-section">
        <SectionCard
          title="Top up credits"
          description="Need more decks this month? Buy a one-time credit pack — no subscription change needed."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOPUP_PACKS.map((pack) => (
              <button
                key={pack.credits}
                type="button"
                onClick={() => handleTopup(pack)}
                className="flex flex-col items-center rounded-xl border border-border/60 bg-card p-5 text-center transition-all hover:border-primary/40 hover:shadow-md hover:bg-primary/[0.02] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <span className="text-2xl font-bold text-foreground">{pack.credits}</span>
                <span className="text-[11px] font-medium text-muted-foreground mb-3">credits</span>
                <span className="text-[18px] font-bold text-foreground">${pack.price}</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">${pack.perCredit.toFixed(2)}/deck</span>
                <span className="mt-3 text-[12px] font-medium text-primary">
                  Buy now
                </span>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* AI model preference */}
      <SectionCard
        title="AI model preference"
        description="Choose which AI model generates your decks. All models use the same credits."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {aiModelOptions.map((model) => (
            <button
              key={model.value}
              type="button"
              onClick={() => setSelectedModel(model.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                selectedModel === model.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border/60 bg-card hover:border-border hover:shadow-sm",
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
  loading,
  onSelect,
}: {
  plan: PricingPlan;
  isSelected: boolean;
  isPopular: boolean;
  annual: boolean;
  currentTier?: PlanTier;
  loading?: boolean;
  onSelect: () => void;
}) {
  const isEnterprise = plan.tier === "enterprise";
  const isCurrent = currentTier === plan.tier;
  const price = annual ? Math.round(plan.priceMonthly * 0.8) : plan.priceMonthly;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-5 transition-all",
        isCurrent
          ? "border-emerald-500/40 ring-2 ring-emerald-500/20 shadow-lg bg-emerald-500/[0.02]"
          : isSelected
            ? "border-primary ring-2 ring-primary/20 shadow-lg"
            : "border-border/50 bg-card hover:border-border hover:shadow-md",
        isPopular && !isCurrent && "ring-1 ring-primary/10",
      )}
    >
      {/* Popular badge */}
      {isPopular && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">
            <Star className="size-3 fill-current" />
            Most Popular
          </span>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white">
            <Check className="size-3" />
            Your Plan
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
            <p className="mt-1 text-[12px] text-muted-foreground">
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
        variant={isCurrent ? "outline" : isSelected ? "default" : "outline"}
        className={cn("mt-5 w-full gap-1.5", isCurrent && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400")}
        disabled={isCurrent || loading}
        onClick={onSelect}
      >
        {isEnterprise ? (
          <>
            <MessageSquare className="size-3.5" />
            Contact sales
          </>
        ) : isCurrent ? (
          <>
            <Check className="size-3.5" />
            Current plan
          </>
        ) : (
          <>
            <Zap className="size-3.5" />
            {currentTier ? "Switch plan" : "Get started"}
          </>
        )}
      </Button>
    </div>
  );
}
