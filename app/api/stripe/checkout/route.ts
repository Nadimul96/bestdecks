import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/server/auth";
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import type { PlanTier } from "@/lib/workspace-types";

/* ─────────────────────────────────────────────
   POST /api/stripe/checkout
   Body: { tier: "starter"|"growth"|"scale", annual: boolean }

   Creates a Stripe Checkout Session and returns
   the URL for the client to redirect to.
   ───────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { tier, annual } = body as { tier: PlanTier; annual: boolean };

    if (!tier || !["starter", "growth", "scale"].includes(tier)) {
      return NextResponse.json({ error: "Invalid plan tier" }, { status: 400 });
    }

    // Resolve price ID
    const priceKey = `${tier}_${annual ? "annual" : "monthly"}` as keyof typeof STRIPE_PRICE_IDS;
    const priceId = STRIPE_PRICE_IDS[priceKey];

    if (!priceId) {
      return NextResponse.json({ error: "Price not configured" }, { status: 503 });
    }

    // Determine base URL for redirects
    const origin = request.headers.get("origin") || "https://console.bestdecks.co";

    // Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        tier,
        annual: String(annual),
      },
      success_url: `${origin}/console#pricing?checkout=success`,
      cancel_url: `${origin}/console#pricing?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
