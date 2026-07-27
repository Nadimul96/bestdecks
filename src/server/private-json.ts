import { NextResponse } from "next/server";

/** Return sensitive API JSON with an explicit no-store cache policy. */
export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}
