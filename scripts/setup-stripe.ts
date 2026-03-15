#!/usr/bin/env tsx
/* ─────────────────────────────────────────────
   Stripe Product & Price Setup Script

   Creates all bestdecks products and prices:
   - Starter: $49/mo, $470/yr (20% off)
   - Growth:  $129/mo, $1238/yr (20% off)
   - Scale:   $399/mo, $3830/yr (20% off)

   Usage:
     STRIPE_SECRET_KEY=sk_test_xxx pnpm tsx scripts/setup-stripe.ts

   After running, add the printed price IDs
   to your .env.local file.
   ───────────────────────────────────────────── */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

const plans = [
  {
    name: "Starter",
    tier: "starter",
    monthlyPrice: 4900, // cents
    annualPrice: 47040, // $49 * 12 * 0.8 = $470.40 → round to $470
    credits: 25,
    features: [
      "25 decks/month",
      "All deck archetypes",
      "PDF & PPTX export",
      "AI quality scoring",
      "Email support",
    ],
  },
  {
    name: "Growth",
    tier: "growth",
    monthlyPrice: 12900,
    annualPrice: 123840, // $129 * 12 * 0.8 = $1238.40
    credits: 100,
    features: [
      "100 decks/month",
      "Everything in Starter",
      "Multiple businesses",
      "Priority generation",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    name: "Scale",
    tier: "scale",
    monthlyPrice: 39900,
    annualPrice: 383040, // $399 * 12 * 0.8 = $3830.40
    credits: 500,
    features: [
      "500 decks/month",
      "Everything in Growth",
      "Unlimited businesses",
      "Custom branding",
      "API access",
      "Dedicated support",
      "Team collaboration",
    ],
  },
];

async function setup() {
  console.log("🚀 Setting up Stripe products and prices for bestdecks...\n");

  const envLines: string[] = [];

  for (const plan of plans) {
    // Create product
    const product = await stripe.products.create({
      name: `bestdecks ${plan.name}`,
      description: `${plan.credits} personalized decks per month`,
      metadata: {
        tier: plan.tier,
        credits: String(plan.credits),
      },
    });

    console.log(`✓ Created product: ${product.name} (${product.id})`);

    // Create monthly price
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPrice,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: {
        tier: plan.tier,
        billing: "monthly",
        credits: String(plan.credits),
      },
    });

    console.log(`  Monthly: $${plan.monthlyPrice / 100}/mo (${monthlyPrice.id})`);
    envLines.push(
      `STRIPE_PRICE_${plan.tier.toUpperCase()}_MONTHLY=${monthlyPrice.id}`,
    );

    // Create annual price
    const annualPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annualPrice,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: {
        tier: plan.tier,
        billing: "annual",
        credits: String(plan.credits),
      },
    });

    console.log(`  Annual:  $${plan.annualPrice / 100}/yr (${annualPrice.id})`);
    envLines.push(
      `STRIPE_PRICE_${plan.tier.toUpperCase()}_ANNUAL=${annualPrice.id}`,
    );

    console.log();
  }

  console.log("─────────────────────────────────────────");
  console.log("Add these to your .env.local:\n");
  console.log(envLines.join("\n"));
  console.log("\n─────────────────────────────────────────");
  console.log("\n✅ Done! Don't forget to also set:");
  console.log("   STRIPE_SECRET_KEY=sk_...");
  console.log("   STRIPE_WEBHOOK_SECRET=whsec_...");
  console.log("   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...");
}

setup().catch(console.error);
