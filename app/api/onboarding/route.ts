import { NextResponse } from "next/server";

import { saveOnboarding, getOnboarding } from "@/src/server/repository";
import { getSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  return NextResponse.json(await getOnboarding(userId));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const payload = await request.json();
    await saveOnboarding(payload, userId);
    return NextResponse.json({ ok: true, onboarding: await getOnboarding(userId) });
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
