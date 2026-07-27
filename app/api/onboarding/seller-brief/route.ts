import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { privateJson } from "@/src/server/private-json";
import { getSellerBriefMd, saveSellerBriefMd } from "@/src/server/repository";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const markdown = await getSellerBriefMd(userId);
  return privateJson({ markdown });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await readBoundedJson(request) as Record<string, unknown>;
    if (typeof body.markdown !== "string") {
      return NextResponse.json({ error: "markdown field is required." }, { status: 400 });
    }
    if (body.markdown.length > 250_000) {
      return NextResponse.json({ error: "markdown field is too large." }, { status: 413 });
    }
    await saveSellerBriefMd(body.markdown, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Unable to save seller brief." },
      { status: 400 },
    );
  }
}
