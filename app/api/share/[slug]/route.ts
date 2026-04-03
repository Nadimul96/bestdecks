import { NextResponse } from "next/server";

import { getPublicShareableDeck } from "@/src/server/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const deck = await getPublicShareableDeck(slug, { incrementViews: true });

  if (!deck) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }

  return NextResponse.json(deck);
}
