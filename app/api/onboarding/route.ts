import { NextResponse } from "next/server";

import { saveOnboarding, getOnboarding } from "@/src/server/repository";

export async function GET() {
  return NextResponse.json(getOnboarding());
}

export async function POST(request: Request) {
  const payload = await request.json();
  saveOnboarding(payload);
  return NextResponse.json({ ok: true, onboarding: getOnboarding() });
}
