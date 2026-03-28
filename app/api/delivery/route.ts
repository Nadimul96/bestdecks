import { NextResponse } from "next/server";

import { listDeliveryDecks, countRuns } from "@/src/server/repository";
import { getAdminSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery
 *
 * Bulk endpoint optimized for the Delivery page.
 * Returns all deck cards in a single response using just 3 DB queries,
 * instead of the N+1 pattern of listRuns + getRun(id) per run.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use lightweight count instead of fetching all run data
  const [decks, totalRuns] = await Promise.all([
    listDeliveryDecks(),
    countRuns(),
  ]);

  return NextResponse.json({
    decks,
    totalRuns,
  });
}
