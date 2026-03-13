import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { saveOnboarding, getOnboarding } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/seller-context
 * Saves seller context fields (company info, offer, services, etc.)
 * Used by both the onboarding wizard and the seller-context settings view.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Map the flat form fields to the structured sellerContext shape
    const sellerContext = {
      websiteUrl: body.websiteUrl ?? "",
      companyName: body.companyName ?? "",
      offerSummary: body.offerSummary ?? "",
      services:
        typeof body.servicesText === "string"
          ? body.servicesText
              .split("\n")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : body.services ?? [],
      differentiators:
        typeof body.differentiatorsText === "string"
          ? body.differentiatorsText
              .split("\n")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : body.differentiators ?? [],
      targetCustomer: body.targetCustomer ?? "",
      desiredOutcome: body.desiredOutcome ?? "",
      proofPoints:
        typeof body.proofPointsText === "string"
          ? body.proofPointsText
              .split("\n")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : body.proofPoints ?? [],
      constraints:
        typeof body.constraintsText === "string"
          ? body.constraintsText
              .split("\n")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : body.constraints ?? [],
    };

    // Use existing saveOnboarding with just sellerContext + profile fields
    saveOnboarding({
      profile: {
        companyName: body.companyName,
        websiteUrl: body.websiteUrl,
      },
      sellerContext,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save seller context.",
      },
      { status: 400 },
    );
  }
}
