import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { getSellerBriefMd, saveSellerBriefMd } from "@/src/server/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const markdown = await getSellerBriefMd(userId);
  return NextResponse.json({ markdown });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();
    if (typeof body.markdown !== "string") {
      return NextResponse.json({ error: "markdown field is required." }, { status: 400 });
    }
    await saveSellerBriefMd(body.markdown, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save seller brief." },
      { status: 400 },
    );
  }
}
