import { NextResponse } from "next/server";

import { getRun } from "@/src/server/repository";
import { launchRunProcessing } from "@/src/server/run-executor";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const run = getRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const launched = launchRunProcessing(runId);
  return NextResponse.json({ ok: true, launched });
}
