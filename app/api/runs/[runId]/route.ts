import { NextResponse } from "next/server";

import { getRun, updateRun, addRunEvent, getRunOwner, refundCredits } from "@/src/server/repository";
import { getSession, isAdmin } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const admin = isAdmin(session);

  const { runId } = await context.params;
  const run = await getRun(runId, userId, { isAdmin: admin });

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  // Auto-detect stuck runs: if status is "running" but last event is >6 min old, mark as failed.
  if (run.status === "running" && run.events.length > 0) {
    const lastEvent = run.events[run.events.length - 1];
    const lastEventTime = new Date(String(lastEvent.created_at)).getTime();
    const stuckThreshold = Date.now() - 6 * 60 * 1000;

    if (lastEventTime < stuckThreshold) {
      const [, ownerInfo] = await Promise.all([
        updateRun(runId, {
          status: "failed",
          lastError: "Run timed out — no progress for over 6 minutes.",
        }),
        getRunOwner(runId),
      ]);

      await addRunEvent(runId, {
        level: "error",
        stage: "timeout",
        message: "Run timed out — a pipeline step may have been terminated. Try again with fewer targets.",
      });

      try {
        if (ownerInfo.userId && ownerInfo.creditsCharged > 0) {
          await refundCredits(ownerInfo.userId, ownerInfo.creditsCharged);
          await addRunEvent(runId, {
            level: "info",
            stage: "credit_refund",
            message: `${ownerInfo.creditsCharged} credit${ownerInfo.creditsCharged !== 1 ? "s" : ""} refunded — run timed out.`,
          });
        }
      } catch (refundErr) {
        console.error(`[stuck-detector] Credit refund failed for run ${runId}:`, refundErr);
      }

      const updatedRun = await getRun(runId, userId, { isAdmin: admin });
      return NextResponse.json(updatedRun);
    }
  }

  return NextResponse.json(run);
}

/**
 * PATCH /api/runs/:runId
 * Admin-only: manually update a run's status (e.g. fix stuck runs)
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can PATCH runs
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { runId } = await context.params;
  const run = await getRun(runId, session.user.id, { isAdmin: true });

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const body = await request.json();
  const { status, lastError } = body as { status?: string; lastError?: string };

  if (status) {
    await updateRun(runId, {
      status,
      lastError: lastError || undefined,
    });

    if (lastError) {
      await addRunEvent(runId, {
        level: "error",
        stage: "manual",
        message: lastError,
      });
    }
  }

  const updated = await getRun(runId, session.user.id, { isAdmin: true });
  return NextResponse.json(updated);
}
