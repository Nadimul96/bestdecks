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
   Price IDs — Set these after creating products
   in Stripe Dashboard or via the setup script.
   ───────────────────────────────────────────── */

export const STRIPE_PRICE_IDS = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
  starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "",
  growth_monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "",
  growth_annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "",
  scale_monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY ?? "",
  scale_annual: process.env.STRIPE_PRICE_SCALE_ANNUAL ?? "",
} as const;

/* ─────────────────────────────────────────────
   Plan metadata for Stripe ↔ app mapping
   ───────────────────────────────────────────── */

export const PLAN_CREDITS: Record<string, number> = {
  starter: 25,
  growth: 100,
  scale: 500,
};
