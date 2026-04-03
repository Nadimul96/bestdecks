import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
} from "@/src/server/repository";
import { buildPublicShareUrl } from "@/src/server/share-url";

export const dynamic = "force-dynamic";

function toExpiresAt(expiresInDays: unknown) {
  if (expiresInDays === undefined || expiresInDays === null) {
    return undefined;
  }

  if (
    typeof expiresInDays !== "number" ||
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0 ||
    expiresInDays > 365
  ) {
    throw new Error("expiresInDays must be a number between 1 and 365.");
  }

  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deckId } = await context.params;
  const deck = await getOwnedDeliveryDeck(deckId, session.user.id);

  if (!deck) {
    return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  }

  let expiresAt: string | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    expiresAt = toExpiresAt((body as { expiresInDays?: unknown }).expiresInDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { slug } = await createShareableLink(
      deck.targetId,
      deck.runId,
      session.user.id,
      expiresAt,
    );

    return NextResponse.json({
      slug,
      url: buildPublicShareUrl(request, slug),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create share link.";
    const status = message === "Deck is not ready to share." ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deckId } = await context.params;

  try {
    await deactivateShareableLink(deckId, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to deactivate share link.";
    const status = message === "Deck not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
