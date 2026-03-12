import { NextResponse } from "next/server";

import { createRun, listRuns } from "@/src/server/repository";
import { launchRunProcessing } from "@/src/server/run-executor";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    run: unknown;
    autoLaunch?: boolean;
  };

  const runId = createRun(body.run as never);
  if (body.autoLaunch) {
    launchRunProcessing(runId);
  }

  return NextResponse.json({
    ok: true,
    runId,
    launched: Boolean(body.autoLaunch),
  });
}
