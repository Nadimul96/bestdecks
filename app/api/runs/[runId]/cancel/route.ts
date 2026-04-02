import { NextResponse } from "next/server";

import { getRun } from "@/src/server/repository";
import { cancelRunProcessing } from "@/src/server/run-executor";
import { getSession } from "@/src/server/auth";

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
  const run = await getRun(runId, userId);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (run.status !== "running" && run.status !== "queued") {
    return NextResponse.json(
      { error: "Only running or queued runs can be cancelled." },
      { status: 400 },
    );
  }

  const cancelled = await cancelRunProcessing(runId);
  return NextResponse.json({ ok: true, cancelled });
}
