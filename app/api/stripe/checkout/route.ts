import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/server/auth";
import { stripe, STRIPE_PRICE_IDS, PLAN_CREDITS, VOLUME_PRICE_IDS, VOLUME_DECKS } from "@/lib/stripe";
import type { PlanTier } from "@/lib/workspace-types";

/* ─────────────────────────────────────────────
   POST /api/stripe/checkout
   Body (new):    { volume: 50|100|250|…, annual: boolean }
   Body (legacy): { tier: "starter"|"growth"|"scale", annual: boolean }

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
    const { tier, annual, volume } = body;

    let priceId: string;
    let deckAllowance: number;

    if (volume && VOLUME_PRICE_IDS[String(volume)]) {
      const ids = VOLUME_PRICE_IDS[String(volume)];
      priceId = annual ? ids.annual : ids.monthly;
      deckAllowance = VOLUME_DECKS[String(volume)] ?? volume;
    } else if (tier) {
      // Legacy tier-based lookup
      const key = `${tier}_${annual ? "annual" : "monthly"}` as keyof typeof STRIPE_PRICE_IDS;
      priceId = STRIPE_PRICE_IDS[key];
      deckAllowance = PLAN_CREDITS[tier] ?? 0;
    } else {
      return NextResponse.json({ error: "volume or tier required" }, { status: 400 });
    }

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
        tier: tier ?? `volume_${volume}`,
        annual: String(annual),
        deckAllowance: String(deckAllowance),
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
