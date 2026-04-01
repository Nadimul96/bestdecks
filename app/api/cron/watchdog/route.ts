import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { getRunOwner, refundCredits, addRunEvent, updateRun } from "@/src/server/repository";

export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_MINUTES = 15;

/**
 * GET /api/cron/watchdog
 *
 * Called by Vercel Cron every 5 minutes to detect and recover stuck runs.
 * A run is "stuck" if it has status='running' and hasn't been updated in 15+ minutes.
 *
 * For each stuck run:
 * 1. Marks run as failed
 * 2. Refunds all charged credits
 * 3. Logs an event explaining what happened
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();

  const stuckRuns = (await db.executeAll(
    `SELECT id FROM runs
     WHERE status = 'running'
       AND updated_at < datetime('now', '-${STUCK_THRESHOLD_MINUTES} minutes')`,
  )) as unknown as Array<{ id: string }>;

  if (stuckRuns.length === 0) {
    return NextResponse.json({ ok: true, recovered: 0 });
  }

  let recovered = 0;

  for (const { id: runId } of stuckRuns) {
    try {
      await updateRun(runId, {
        status: "failed",
        lastError: `Run timed out — no progress for ${STUCK_THRESHOLD_MINUTES}+ minutes.`,
      });

      await addRunEvent(runId, {
        level: "error",
        stage: "watchdog_recovery",
        message: `Watchdog detected stuck run. Marked as failed after ${STUCK_THRESHOLD_MINUTES} minutes of inactivity.`,
      });

      // Refund credits
      try {
        const { userId, creditsCharged } = await getRunOwner(runId);
        if (userId && creditsCharged > 0) {
          await refundCredits(userId, creditsCharged);
          await addRunEvent(runId, {
            level: "info",
            stage: "credit_refund",
            message: `${creditsCharged} deck${creditsCharged !== 1 ? "s" : ""} refunded — run recovered by watchdog.`,
          });
        }
      } catch (refundErr) {
        console.error(`[watchdog] Credit refund failed for run ${runId}:`, refundErr);
      }

      recovered++;
      console.log(`[watchdog] Recovered stuck run ${runId}`);
    } catch (err) {
      console.error(`[watchdog] Failed to recover run ${runId}:`, err);
    }
  }

  return NextResponse.json({ ok: true, recovered, total: stuckRuns.length });
}
