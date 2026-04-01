"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  MessageSquare,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ViewLayout, SectionCard } from "../view-layout";
import {
  viewMeta,
  getAllVolumeTiers,
  getVolumeTier,
  VOLUME_SNAP_POINTS,
  SIGNUP_FREE_DECKS,
  type VolumeTier,
} from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const meta = viewMeta.pricing;

const TOPUP_PACKS = [
  { decks: 10, price: 18, perDeck: 1.80 },
  { decks: 25, price: 40, perDeck: 1.60 },
  { decks: 50, price: 65, perDeck: 1.30 },
  { decks: 100, price: 100, perDeck: 1.00 },
];

const ALL_FEATURES = [
  "All 9 deck archetypes",
  "AI company research & enrichment",
  "Narrative-driven slide architecture",
  "PDF & PPTX export",
  "AI quality scoring per deck",
  "Tone & voice consistency",
  "Follow-up email sequences",
  "CSV target upload",
  "Priority generation queue",
];

export function PricingView() {
  const { credits } = useBusinessContext();
  const allTiers = getAllVolumeTiers();

  const currentVolume = credits?.planVolume as number | undefined;

  const [volume, setVolume] = React.useState(currentVolume ?? 100);
  const [annual, setAnnual] = React.useState(false);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);

  const selectedTier = getVolumeTier(volume);
  const displayPrice = annual ? selectedTier.annualMonthlyPrice : selectedTier.monthlyPrice;
  const displayPerDeck = annual
    ? Math.round(selectedTier.perDeckPrice * 0.8 * 100) / 100
    : selectedTier.perDeckPrice;

  const hasActivePlan = credits && credits.planTier !== "free";

  async function handleCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume, annual }),
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

  function handleTopup(pack: (typeof TOPUP_PACKS)[number]) {
    toast.info(
      `Top-up of ${pack.decks} decks for $${pack.price} — Stripe integration coming soon!`,
    );
  }

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
    >
      {/* ── Current plan + balance banner ── */}
      {credits && (
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-stretch divide-y sm:divide-y-0 sm:divide-x divide-border/40">
            <div className="flex-1 p-5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Current plan
              </p>
              <p className="text-[16px] font-bold text-foreground">
                {hasActivePlan
                  ? `${currentVolume ?? "—"} decks/month`
                  : "Free trial"}
              </p>
              {!hasActivePlan && (
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {credits.balance} free deck{credits.balance !== 1 ? "s" : ""} remaining
                </p>
              )}
            </div>

            <div className="flex-1 p-5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Decks remaining
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  {credits.balance}
                </span>
                {hasActivePlan && (
                  <span className="text-[13px] text-muted-foreground">
                    / {credits.monthlyAllowance}
                  </span>
                )}
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    credits.balance /
                      Math.max(credits.monthlyAllowance || credits.balance, 1) >
                      0.2
                      ? "bg-primary"
                      : credits.balance > 0
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((credits.balance / Math.max(credits.monthlyAllowance || credits.balance, 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Billing toggle ── */}
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

      {/* ── Volume slider card ── */}
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-lg">
          {/* Price display */}
          <div className="text-center mb-8">
            {selectedTier.popular && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary mb-3">
                <Sparkles className="size-3" />
                Most popular
              </span>
            )}
            <div className="flex items-center justify-center gap-3">
              <span className="text-5xl font-bold tabular-nums text-foreground tracking-tight">
                ${displayPrice}
              </span>
              <span className="text-[14px] text-muted-foreground">/mo</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <TrendingDown className="size-3.5 text-emerald-500" />
              <span className="text-[15px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${displayPerDeck.toFixed(2)}
              </span>
              <span className="text-[13px] text-muted-foreground">per deck</span>
            </div>
            {annual && (
              <p className="mt-1 text-[12px] text-muted-foreground">
                ${Math.round(displayPrice * 12)} billed annually
              </p>
            )}
          </div>

          {/* Volume selector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">
                Decks per month
              </span>
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-[15px] font-bold text-primary tabular-nums">
                {volume.toLocaleString()}
              </span>
            </div>

            <Slider
              value={[volume]}
              onValueChange={(values) => setVolume(values[0])}
              min={50}
              max={5000}
              step={10}
              className="py-2"
            />

            {/* Snap point labels */}
            <div className="flex justify-between px-1">
              {allTiers.map((tier) => (
                <button
                  key={tier.volume}
                  type="button"
                  onClick={() => setVolume(tier.volume)}
                  className={cn(
                    "text-[10px] tabular-nums transition-all",
                    volume === tier.volume
                      ? "font-bold text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tier.volume >= 1000
                    ? `${tier.volume / 1000}k`
                    : tier.volume}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Button
            className="mt-8 w-full gap-2 h-12 text-[14px] font-semibold"
            disabled={checkoutLoading}
            onClick={handleCheckout}
          >
            <Zap className="size-4" />
            {hasActivePlan ? "Update plan" : "Get started"}
            <ArrowRight className="size-4" />
          </Button>

          {!hasActivePlan && (
            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              Start with {SIGNUP_FREE_DECKS} free decks — no card required
            </p>
          )}
        </div>
      </div>

      {/* ── What's included (all plans) ── */}
      <SectionCard
        title="Everything included"
        description="No feature gates. Every plan gets the full BestDecks engine."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_FEATURES.map((feature) => (
            <div key={feature} className="flex items-start gap-2.5 py-1">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <span className="text-[13px] text-foreground">{feature}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Top-up packs ── */}
      <SectionCard
        title="Need extra decks?"
        description="Buy a one-time deck pack — no plan change needed."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOPUP_PACKS.map((pack) => (
            <button
              key={pack.decks}
              type="button"
              onClick={() => handleTopup(pack)}
              className="flex flex-col items-center rounded-xl border border-border/60 bg-card p-5 text-center transition-all hover:border-primary/40 hover:shadow-md hover:bg-primary/[0.02]"
            >
              <span className="text-2xl font-bold text-foreground">
                {pack.decks}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground mb-3">
                decks
              </span>
              <span className="text-[18px] font-bold text-foreground">
                ${pack.price}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                ${pack.perDeck.toFixed(2)}/deck
              </span>
              <span className="mt-3 text-[12px] font-medium text-primary">
                Buy now
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ── Enterprise CTA ── */}
      <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
        <h3 className="text-[16px] font-semibold text-foreground">
          Need 5,000+ decks per month?
        </h3>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Custom volume, SLA guarantees, SSO, and dedicated support for
          high-volume teams.
        </p>
        <Button variant="outline" className="mt-4 gap-1.5">
          <MessageSquare className="size-3.5" />
          Talk to sales
        </Button>
      </div>
    </ViewLayout>
  );
}
