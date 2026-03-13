import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { getSellerBriefMd, saveSellerBriefMd } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/seller-brief
 * Returns the stored seller brief .md (the comprehensive Perplexity-generated dossier).
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const markdown = getSellerBriefMd();
  return NextResponse.json({ markdown });
}

/**
 * POST /api/onboarding/seller-brief
 * Saves an edited version of the seller brief .md.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (typeof body.markdown !== "string") {
      return NextResponse.json(
        { error: "markdown field is required." },
        { status: 400 },
      );
    }

    saveSellerBriefMd(body.markdown);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save seller brief.",
      },
      { status: 400 },
    );
  }
}
