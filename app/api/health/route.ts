import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public liveness deliberately proves only that the HTTP process can answer.
 * Dependency details belong to the admin-only readiness endpoint.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
