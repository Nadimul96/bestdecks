import Stripe from "stripe";

/* ─────────────────────────────────────────────
   Stripe Client — Server-side only
   ───────────────────────────────────────────── */

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY not set — Stripe features disabled");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-02-25.clover",
});

/* ─────────────────────────────────────────────
   Volume-Based Price IDs
   Set these after creating products in Stripe Dashboard.
   Each volume tier has monthly + annual prices.
   ───────────────────────────────────────────── */

export const VOLUME_PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  "50": {
    monthly: process.env.STRIPE_PRICE_50_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_50_ANNUAL ?? "",
  },
  "100": {
    monthly: process.env.STRIPE_PRICE_100_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_100_ANNUAL ?? "",
  },
  "250": {
    monthly: process.env.STRIPE_PRICE_250_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_250_ANNUAL ?? "",
  },
  "500": {
    monthly: process.env.STRIPE_PRICE_500_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_500_ANNUAL ?? "",
  },
  "1000": {
    monthly: process.env.STRIPE_PRICE_1000_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_1000_ANNUAL ?? "",
  },
  "2500": {
    monthly: process.env.STRIPE_PRICE_2500_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_2500_ANNUAL ?? "",
  },
  "5000": {
    monthly: process.env.STRIPE_PRICE_5000_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_5000_ANNUAL ?? "",
  },
};

/** Map volume to deck allowance (same number — 1 deck per unit) */
export const VOLUME_DECKS: Record<string, number> = {
  "50": 50,
  "100": 100,
  "250": 250,
  "500": 500,
  "1000": 1000,
  "2500": 2500,
  "5000": 5000,
};

/** @deprecated Use VOLUME_PRICE_IDS instead */
export const STRIPE_PRICE_IDS = {
  starter_monthly: process.env.STRIPE_PRICE_50_MONTHLY ?? "",
  starter_annual: process.env.STRIPE_PRICE_50_ANNUAL ?? "",
  growth_monthly: process.env.STRIPE_PRICE_100_MONTHLY ?? "",
  growth_annual: process.env.STRIPE_PRICE_100_ANNUAL ?? "",
  scale_monthly: process.env.STRIPE_PRICE_500_MONTHLY ?? "",
  scale_annual: process.env.STRIPE_PRICE_500_ANNUAL ?? "",
} as const;

/** @deprecated Use VOLUME_DECKS instead */
export const PLAN_CREDITS: Record<string, number> = {
  starter: 50,
  growth: 100,
  scale: 500,
};
