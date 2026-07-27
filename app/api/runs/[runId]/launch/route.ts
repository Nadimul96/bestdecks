import { NextResponse } from "next/server";

import { getOwnedRunState } from "@/src/server/repository";
import { getSession } from "@/src/server/auth";
import { enqueueRunJob } from "@/src/server/run-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Only ensures durable queue state; a worker owns execution.

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { runId } = await context.params;
  const run = await getOwnedRunState(runId, userId);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  if (run.deliveryFormat !== "pptx") {
    return NextResponse.json(
      { error: "Only PPTX runs can enter the reference worker queue." },
      { status: 400 },
    );
  }

  const job = await enqueueRunJob(runId);
  return NextResponse.json({ ok: true, runId, state: job.state }, { status: 202 });
}
