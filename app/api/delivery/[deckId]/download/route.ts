import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { getOwnedDeliveryDeck } from "@/src/server/repository";

export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const EXTENSIONS: Record<string, string> = {
  pdf: "pdf",
  pptx: "pptx",
};

function getStringField(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return typeof value?.[key] === "string" ? (value[key] as string) : undefined;
}

/**
 * GET /api/delivery/[deckId]/download?format=pdf|pptx
 *
 * Proxies the upstream deck file (from Plus AI, Presenton, etc.) so users
 * download from bestdecks.co instead of a third-party URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deckId } = await params;
  const format = request.nextUrl.searchParams.get("format");

  if (!format || !MIME_TYPES[format]) {
    return NextResponse.json(
      { error: "Missing or invalid format query parameter. Use format=pdf or format=pptx." },
      { status: 400 },
    );
  }

  const deck = await getOwnedDeliveryDeck(deckId, session.user.id);

  if (!deck) {
    return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  }

  const delivery = deck.artifacts.presentationDelivery as Record<string, unknown> | undefined;

  if (!delivery) {
    return NextResponse.json(
      { error: "No delivery artifact found for this deck." },
      { status: 404 },
    );
  }

  // Resolve the upstream URL based on the requested format.
  // The artifact may store format-specific URLs (pdfExportUrl, pptxExportUrl)
  // or a generic exportUrl / download_url.
  let upstreamUrl: string | undefined;

  if (format === "pdf") {
    upstreamUrl = getStringField(delivery, "pdfExportUrl") ??
      getStringField(delivery, "download_url") ??
      getStringField(delivery, "exportUrl");
  } else if (format === "pptx") {
    upstreamUrl = getStringField(delivery, "pptxExportUrl") ??
      getStringField(delivery, "download_url") ??
      getStringField(delivery, "exportUrl");
  }

  if (!upstreamUrl) {
    return NextResponse.json(
      { error: `No ${format.toUpperCase()} download URL available for this deck.` },
      { status: 404 },
    );
  }

  // Fetch the file from the upstream provider
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return NextResponse.json(
      { error: `Failed to fetch file from upstream provider: ${message}` },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      { error: `Upstream provider returned HTTP ${upstreamResponse.status}.` },
      { status: 502 },
    );
  }

  if (!upstreamResponse.body) {
    return NextResponse.json(
      { error: "Upstream provider returned an empty response." },
      { status: 502 },
    );
  }

  // Build a clean filename from the company name
  const companySlug = (deck.companyName ?? "proposal")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = EXTENSIONS[format];
  const filename = `bestdecks-${companySlug}.${ext}`;

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": MIME_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
