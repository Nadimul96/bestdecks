import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
} from "@/src/server/repository";
import { buildPublicShareUrl } from "@/src/server/share-url";
import { ShareLinkQuotaExceededError } from "@/src/server/shareable-decks";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";

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
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new SyntaxError("Share request body must be a JSON object.");
    }
    expiresAt = toExpiresAt((body as { expiresInDays?: unknown }).expiresInDays);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "expiresInDays must be a number between 1 and 365." },
      { status: 400 },
    );
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
    if (error instanceof ShareLinkQuotaExceededError) {
      return NextResponse.json(
        {
          error: "Share link quota exceeded.",
          code: error.code,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds),
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    if (error instanceof Error && error.message === "Deck is not ready to share.") {
      return NextResponse.json({ error: "Deck is not ready to share." }, { status: 409 });
    }

    console.error("[shareable-decks] create failed", {
      operation: "create",
      code: "internal_error",
    });
    return NextResponse.json({ error: "Failed to create share link." }, { status: 500 });
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
    if (error instanceof Error && error.message === "Deck not found.") {
      return NextResponse.json({ error: "Deck not found." }, { status: 404 });
    }

    console.error("[shareable-decks] deactivate failed", {
      operation: "deactivate",
      code: "internal_error",
    });
    return NextResponse.json(
      { error: "Failed to deactivate share link." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
