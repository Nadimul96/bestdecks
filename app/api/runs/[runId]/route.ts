import { NextResponse } from "next/server";

import { getRun, updateRun, addRunEvent } from "@/src/server/repository";
import { getAdminSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await context.params;
  const run = await getRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  // Auto-detect stuck runs: if status is "running" but last event is >10 min old, mark as failed
  if (run.status === "running" && run.events.length > 0) {
    const lastEvent = run.events[run.events.length - 1];
    const lastEventTime = new Date(String(lastEvent.created_at)).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    if (lastEventTime < tenMinutesAgo) {
      await updateRun(runId, {
        status: "failed",
        lastError: "Run timed out — no progress for over 10 minutes.",
      });
      await addRunEvent(runId, {
        level: "error",
        stage: "timeout",
        message: "Run timed out — no progress for over 10 minutes. The serverless function may have been terminated.",
      });

      // Re-fetch to return updated data
      const updatedRun = await getRun(runId);
      return NextResponse.json(updatedRun);
    }
  }

  return NextResponse.json(run);
}

/**
 * PATCH /api/runs/:runId
 * Admin endpoint to manually update a run's status (e.g. fix stuck runs)
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await context.params;
  const run = await getRun(runId);

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

  const updated = await getRun(runId);
  return NextResponse.json(updated);
}
