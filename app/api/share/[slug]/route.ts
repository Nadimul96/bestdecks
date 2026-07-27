import { NextResponse } from "next/server";

import { getPublicShareableDeck } from "@/src/server/repository";

export const dynamic = "force-dynamic";

const PUBLIC_SHARE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const deck = await getPublicShareableDeck(slug);

  if (!deck) {
    return NextResponse.json(
      { error: "Share link not found." },
      { status: 404, headers: PUBLIC_SHARE_HEADERS },
    );
  }

  return NextResponse.json(deck, {
    headers: PUBLIC_SHARE_HEADERS,
  });
}
