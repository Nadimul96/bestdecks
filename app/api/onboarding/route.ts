import { NextResponse } from "next/server";

import { saveOnboarding, getOnboarding } from "@/src/server/repository";
import { getAdminSession } from "@/src/server/auth";

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

  const payload = await request.json();
  saveOnboarding(payload);
  return NextResponse.json({ ok: true, onboarding: getOnboarding() });
}
