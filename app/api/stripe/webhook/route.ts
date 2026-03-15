import { NextRequest, NextResponse } from "next/server";
import { stripe, PLAN_CREDITS } from "@/lib/stripe";
import { getDb } from "@/src/server/db";

/* ─────────────────────────────────────────────
   POST /api/stripe/webhook
   Handles Stripe webhook events:
   - checkout.session.completed → activate subscription, award credits
   - customer.subscription.deleted → remove credits
   - invoice.paid → refill monthly credits
   ───────────────────────────────────────────── */

function resolveId(val: string | { id: string } | null | undefined): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  return val.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = await getDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const tier = session.metadata?.tier;

      if (!userId || !tier) break;

      const credits = PLAN_CREDITS[tier] ?? 0;
      const customerId = resolveId(session.customer as string | { id: string } | null);
      const subId = resolveId(session.subscription as string | { id: string } | null);

      // Update or insert user credits
      await db.run(`
        INSERT INTO "user_credits" ("user_id", "balance", "total_earned", "plan_tier", "stripe_customer_id", "stripe_subscription_id", "updated_at")
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT("user_id") DO UPDATE SET
          "balance" = "balance" + ?,
          "total_earned" = "total_earned" + ?,
          "plan_tier" = ?,
          "stripe_customer_id" = ?,
          "stripe_subscription_id" = ?,
          "updated_at" = datetime('now')
      `, [
        userId, credits, credits, tier, customerId, subId,
        credits, credits, tier, customerId, subId,
      ]);

      // If user was referred, award referral bonus to referrer
      const userCredits = await db.execute(
        'SELECT "referred_by" FROM "user_credits" WHERE "user_id" = ?',
        [userId],
      ) as { referred_by: string | null } | undefined;

      if (userCredits?.referred_by) {
        await db.run(`
          UPDATE "user_credits"
          SET "balance" = "balance" + 20,
              "total_earned" = "total_earned" + 20,
              "updated_at" = datetime('now')
          WHERE "user_id" = ?
        `, [userCredits.referred_by]);
      }

      console.log(`[Stripe] Checkout complete: user=${userId} tier=${tier} credits=${credits}`);
      break;
    }

    case "invoice.paid": {
      // Monthly credit refill for active subscriptions
      const invoice = event.data.object;
      // Skip the first invoice (handled by checkout.session.completed)
      if (invoice.billing_reason === "subscription_create") break;

      const subId = resolveId((invoice as unknown as { subscription: string | null }).subscription);
      if (!subId) break;

      const userRow = await db.execute(
        'SELECT "user_id", "plan_tier" FROM "user_credits" WHERE "stripe_subscription_id" = ?',
        [subId],
      ) as { user_id: string; plan_tier: string } | undefined;

      if (userRow) {
        const credits = PLAN_CREDITS[userRow.plan_tier] ?? 0;
        await db.run(`
          UPDATE "user_credits"
          SET "balance" = "balance" + ?,
              "total_earned" = "total_earned" + ?,
              "updated_at" = datetime('now')
          WHERE "user_id" = ?
        `, [credits, credits, userRow.user_id]);

        console.log(`[Stripe] Invoice paid: refill ${credits} credits for user=${userRow.user_id}`);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await db.run(`
        UPDATE "user_credits"
        SET "plan_tier" = 'free',
            "stripe_subscription_id" = NULL,
            "updated_at" = datetime('now')
        WHERE "stripe_subscription_id" = ?
      `, [subscription.id]);

      console.log(`[Stripe] Subscription cancelled: ${subscription.id}`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
