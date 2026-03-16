import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { getAudienceContext } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/audience-context
 * Returns saved audience context (industry, size, pain points, must-include/avoid)
 * extracted during the website crawl. Used by run-settings autofill.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getAudienceContext();
    return NextResponse.json(data ?? {});
  } catch {
    return NextResponse.json({});
  }
}
