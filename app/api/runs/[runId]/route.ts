import { NextResponse } from "next/server";

import {
  decodeRunEventCursor,
  getRunPipelineDetail,
  RunDetailCursorError,
  RunDetailLimitError,
} from "@/src/server/repository";
import type { RunEventCursor } from "@/src/server/repository";
import { getSession, isAdmin } from "@/src/server/auth";

export const dynamic = "force-dynamic";

const MAX_RUN_DETAIL_BYTES = 1024 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let eventLimit = 200;
  let eventCursor: RunEventCursor | undefined;
  try {
    const requestUrl = new URL(request.url);
    const limitValue = requestUrl.searchParams.get("eventsLimit");
    if (limitValue !== null) {
      if (!/^\d{1,3}$/u.test(limitValue)) throw new RunDetailLimitError();
      eventLimit = Number(limitValue);
      if (eventLimit < 1 || eventLimit > 200) throw new RunDetailLimitError();
    }
    const cursorValue = requestUrl.searchParams.get("eventsCursor");
    eventCursor = cursorValue ? decodeRunEventCursor(cursorValue) : undefined;
  } catch (error) {
    if (error instanceof RunDetailCursorError || error instanceof RunDetailLimitError) {
      return NextResponse.json({ error: "Invalid run event page." }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request URL." }, { status: 400 });
  }

  const { runId } = await context.params;
  if (!runId || runId.length > 512) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  let run;
  try {
    run = await getRunPipelineDetail(runId, userId, { eventCursor, eventLimit });
  } catch {
    return NextResponse.json(
      { error: "Run detail is unavailable." },
      { status: 500 },
    );
  }

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const payload = JSON.stringify(run);
  if (Buffer.byteLength(payload, "utf8") > MAX_RUN_DETAIL_BYTES) {
    return NextResponse.json(
      { error: "Run detail is unavailable." },
      { status: 500 },
    );
  }

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Manual status mutation was retired because it can violate queue/lease invariants.
 */
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  await context.params;
  return NextResponse.json(
    {
      error: "Manual run-state mutation is disabled; use durable launch and cancellation controls.",
    },
    { status: 410 },
  );
}
