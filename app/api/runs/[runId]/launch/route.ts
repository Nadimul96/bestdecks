import { NextResponse, after } from "next/server";

import { getRun } from "@/src/server/repository";
import { launchRunProcessing } from "@/src/server/run-executor";
import { getAdminSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — runs need time for full pipeline

export async function POST(
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

  // Use after() to keep the serverless function alive while processing
  after(() => {
    launchRunProcessing(runId);
  });

  return NextResponse.json({ ok: true, launched: true });
}
