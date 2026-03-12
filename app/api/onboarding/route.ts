import { NextResponse } from "next/server";

import { saveOnboarding, getOnboarding } from "@/src/server/repository";
import { getAdminSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getOnboarding());
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    saveOnboarding(payload);
    return NextResponse.json({ ok: true, onboarding: getOnboarding() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save onboarding state.",
      },
      { status: 400 },
    );
  }
}
