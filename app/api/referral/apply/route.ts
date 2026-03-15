import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/server/auth";
import { getDb } from "@/src/server/db";

const SIGNUP_CREDITS = 3;
const REFERRAL_BONUS_NEW_USER = 20;
const REFERRAL_BONUS_REFERRER = 20;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
    }

    const db = await getDb();

    // Initialize current user's credits if not exists
    const currentUserId = session.user.id;
    const existingCredits = await db.execute(
      'SELECT * FROM "user_credits" WHERE "user_id" = ?',
      [currentUserId],
    ) as { balance: number; referred_by: string | null } | undefined;

    if (!existingCredits) {
      const userRefCode = generateReferralCode();
      await db.run(
        `INSERT INTO "user_credits" ("user_id", "balance", "total_earned", "referral_code", "created_at", "updated_at")
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [currentUserId, SIGNUP_CREDITS, SIGNUP_CREDITS, userRefCode],
      );
    }

    // Check if already referred
    if (existingCredits?.referred_by) {
      return NextResponse.json({ error: "Referral already applied" }, { status: 400 });
    }

    // Find referrer by their referral code
    const referrer = await db.execute(
      'SELECT "user_id" FROM "user_credits" WHERE "referral_code" = ?',
      [code],
    ) as { user_id: string } | undefined;

    if (!referrer) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
    }

    if (referrer.user_id === currentUserId) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    // Award bonus to new user
    await db.run(
      `UPDATE "user_credits"
       SET "balance" = "balance" + ?,
           "total_earned" = "total_earned" + ?,
           "referred_by" = ?,
           "updated_at" = datetime('now')
       WHERE "user_id" = ?`,
      [REFERRAL_BONUS_NEW_USER, REFERRAL_BONUS_NEW_USER, referrer.user_id, currentUserId],
    );

    // Award bonus to referrer
    await db.run(
      `UPDATE "user_credits"
       SET "balance" = "balance" + ?,
           "total_earned" = "total_earned" + ?,
           "updated_at" = datetime('now')
       WHERE "user_id" = ?`,
      [REFERRAL_BONUS_REFERRER, REFERRAL_BONUS_REFERRER, referrer.user_id],
    );

    return NextResponse.json({
      success: true,
      creditsAwarded: REFERRAL_BONUS_NEW_USER,
      totalCredits: (existingCredits?.balance ?? SIGNUP_CREDITS) + REFERRAL_BONUS_NEW_USER,
    });
  } catch (err) {
    console.error("Referral apply error:", err);
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
