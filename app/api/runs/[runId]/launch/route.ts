import { NextResponse } from "next/server";

import { getRun } from "@/src/server/repository";
import { getSession } from "@/src/server/auth";
import { launchRunProcessing } from "@/src/server/run-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Only kicks off the pipeline — actual work continues in-process

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

  const launched = launchRunProcessing(runId);
  return NextResponse.json({ ok: true, launched });
}
