import { NextResponse } from "next/server";

import { loadEnv } from "@/src/config/env";
import { getDb } from "@/src/server/db";

export const dynamic = "force-dynamic";

async function checkPresenton(baseUrl: string | undefined): Promise<{ reachable: boolean; url: string | null; error?: string }> {
  if (!baseUrl) {
    return { reachable: false, url: null, error: "PRESENTON_BASE_URL not configured" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const response = await fetch(baseUrl, { signal: controller.signal });
    clearTimeout(timeout);
    return { reachable: response.ok || response.status < 500, url: baseUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { reachable: false, url: baseUrl, error: message };
  }
}

export async function GET() {
  const env = loadEnv();
  const db = await getDb();
  const result = await db.execute("SELECT 1 AS ok") as { ok: number } | undefined;
  const presenton = await checkPresenton(env.PRESENTON_BASE_URL);

  return NextResponse.json({
    status: result?.ok === 1 && presenton.reachable ? "ok" : "degraded",
    services: {
      database: result?.ok === 1,
      presenton: {
        configured: Boolean(env.PRESENTON_BASE_URL),
        reachable: presenton.reachable,
        url: presenton.url,
        error: presenton.error,
      },
      cloudflare: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
      perplexity: Boolean(env.PERPLEXITY_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY),
      deepcrawl: Boolean(env.DEEPCRAWL_API_KEY),
    },
  });
}
