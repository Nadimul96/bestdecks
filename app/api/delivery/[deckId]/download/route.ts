import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { getDb } from "@/src/server/db";

export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const EXTENSIONS: Record<string, string> = {
  pdf: "pdf",
  pptx: "pptx",
};

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

  // Look up the target and its presentation_delivery artifact
  const db = await getDb();

  const target = await db.execute(
    "SELECT id, company_name FROM run_targets WHERE id = ? LIMIT 1",
    [deckId],
  ) as { id: string; company_name: string | null } | undefined;

  if (!target) {
    return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  }

  const artifact = await db.execute(
    `SELECT artifact_json FROM run_artifacts
     WHERE target_id = ? AND artifact_type = 'presentation_delivery'
     ORDER BY created_at DESC LIMIT 1`,
    [deckId],
  ) as { artifact_json: string } | undefined;

  if (!artifact) {
    return NextResponse.json(
      { error: "No delivery artifact found for this deck." },
      { status: 404 },
    );
  }

  const delivery = typeof artifact.artifact_json === "string"
    ? JSON.parse(artifact.artifact_json)
    : artifact.artifact_json;

  // Resolve the upstream URL based on the requested format.
  // The artifact may store format-specific URLs (pdfExportUrl, pptxExportUrl)
  // or a generic exportUrl / download_url.
  let upstreamUrl: string | undefined;

  if (format === "pdf") {
    upstreamUrl = delivery.pdfExportUrl ?? delivery.download_url ?? delivery.exportUrl;
  } else if (format === "pptx") {
    upstreamUrl = delivery.pptxExportUrl ?? delivery.download_url ?? delivery.exportUrl;
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
  const companySlug = (target.company_name ?? "proposal")
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
