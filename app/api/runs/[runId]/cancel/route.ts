import { NextResponse } from "next/server";

import { getOwnedRunState } from "@/src/server/repository";
import { getSession } from "@/src/server/auth";
import { requestRunCancellation } from "@/src/server/run-queue";

export const dynamic = "force-dynamic";

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

  const job = await requestRunCancellation(runId);
  if (!job) {
    return NextResponse.json(
      { error: "Run is not cancellable in its current state." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, cancellationRequested: true, state: job.state }, { status: 202 });
}
