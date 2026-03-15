import { NextResponse } from "next/server";

import { loadEnv } from "@/src/config/env";
import { getDb } from "@/src/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = loadEnv();
  const db = await getDb();
  const result = await db.execute("SELECT 1 AS ok") as { ok: number } | undefined;

  return NextResponse.json({
    status: result?.ok === 1 ? "ok" : "degraded",
    services: {
      presenton: Boolean(env.PRESENTON_BASE_URL),
      cloudflare: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
      perplexity: Boolean(env.PERPLEXITY_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY),
      deepcrawl: Boolean(env.DEEPCRAWL_API_KEY),
    },
  });
}
