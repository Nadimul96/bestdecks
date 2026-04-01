import { NextResponse } from "next/server";
import { getSession } from "@/src/server/auth";
import { getDb } from "@/src/server/db";

const SIGNUP_DECKS = 10;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "nadimul96@gmail.com";

/* ─────────────────────────────────────────────
   GET /api/credits
   Returns the current user's credit balance.
   Auto-initializes with 3 free signup credits.
   Admin accounts get unlimited credits.
   ───────────────────────────────────────────── */

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin =
      session.user.email === ADMIN_EMAIL ||
      (session.user as Record<string, unknown>).role === "admin";

    // Admin gets unlimited decks — no DB lookup needed
    if (isAdmin) {
      return NextResponse.json({
        userId: session.user.id,
        balance: 999999,
        monthlyAllowance: 999999,
        bonusDecks: 0,
        bonusCredits: 0, // deprecated compat
        planTier: "enterprise" as const,
        planVolume: 5000,
        resetDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        referralCode: "BD-ADMIN",
        referredBy: null,
      });
    }

    const db = await getDb();

    const userId = session.user.id;
    let credits = await db.execute(
      'SELECT * FROM "user_credits" WHERE "user_id" = ?',
      [userId],
    ) as {
      user_id: string;
      balance: number;
      total_earned: number;
      plan_tier: string;
      monthly_allowance: number;
      bonus_credits: number;
      reset_date: string | null;
      referral_code: string;
      referred_by: string | null;
    } | undefined;

    if (!credits) {
      const refCode = generateReferralCode();
      await db.run(
        `INSERT INTO "user_credits" ("user_id", "balance", "total_earned", "referral_code")
         VALUES (?, ?, ?, ?)`,
        [userId, SIGNUP_DECKS, SIGNUP_DECKS, refCode],
      );

      credits = await db.execute(
        'SELECT * FROM "user_credits" WHERE "user_id" = ?',
        [userId],
      ) as typeof credits;
    }

    return NextResponse.json({
      userId: credits!.user_id,
      balance: credits!.balance,
      monthlyAllowance: credits!.monthly_allowance || credits!.balance,
      bonusDecks: credits!.bonus_credits || 0,
      bonusCredits: credits!.bonus_credits || 0, // deprecated compat
      planTier: credits!.plan_tier || "starter",
      planVolume: credits!.monthly_allowance || 0,
      resetDate: credits!.reset_date || new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      referralCode: credits!.referral_code,
      referredBy: credits!.referred_by,
    });
  } catch (err) {
    console.error("Credits GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BD-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
