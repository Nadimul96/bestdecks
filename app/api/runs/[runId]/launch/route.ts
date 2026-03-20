import { NextResponse } from "next/server";

import { getRun } from "@/src/server/repository";
import { getAdminSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Only kicks off the pipeline — actual work runs in chained steps

export async function POST(
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

  // Fire-and-forget: kick off the step-based pipeline
  const origin = request.headers.get("origin")
    || (request.headers.get("x-forwarded-proto") && `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`)
    || `https://${request.headers.get("host") || "localhost:3000"}`;
  const INTERNAL_SECRET = process.env.INTERNAL_PIPELINE_SECRET || process.env.BETTER_AUTH_SECRET || "internal";

  fetch(`${origin}/api/runs/${runId}/step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({ step: "prepare" }),
  }).catch((err) => {
    console.error(`[launch] Failed to kick off pipeline for run ${runId}:`, err);
  });

  return NextResponse.json({ ok: true, launched: true });
}
