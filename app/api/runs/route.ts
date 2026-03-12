import { NextResponse } from "next/server";

import { createRun, listRuns } from "@/src/server/repository";
import { launchRunProcessing } from "@/src/server/run-executor";
import { getAdminSession } from "@/src/server/auth";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ runs: listRuns() });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
