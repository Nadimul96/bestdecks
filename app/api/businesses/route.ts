import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { getOnboarding } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/businesses
 * Returns the list of businesses for the current user.
 * Currently supports a single "default" business derived from onboarding data.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const data = await getOnboarding(userId);
    const seller = data.sellerContext;
    const quest = data.questionnaire;

    // If no onboarding data exists yet, return empty array (fresh user)
    if (!seller && !quest && !data.profile.companyName) {
      return NextResponse.json([]);
    }

    // Transform raw DB sellerContext → SellerContextForm shape for the client
    const sellerContextForm = seller
      ? {
          websiteUrl: seller.websiteUrl ?? "",
          companyName: seller.companyName ?? "",
          logoUrl: "",
          offerSummary: seller.offerSummary ?? "",
          servicesText: (seller.services ?? []).join("\n"),
          differentiatorsText: (seller.differentiators ?? []).join("\n"),
          targetCustomer: seller.targetCustomer ?? "",
          desiredOutcome: seller.desiredOutcome ?? "",
          proofPointsText: (seller.proofPoints ?? []).join("\n"),
          constraintsText: (seller.constraints ?? []).join("\n"),
          facebookUrl: "",
          twitterUrl: "",
          instagramUrl: "",
          tiktokUrl: "",
        }
      : undefined;

    const business = {
      id: "default",
      name: seller?.companyName || data.profile.companyName || "My Business",
      websiteUrl: seller?.websiteUrl || data.profile.websiteUrl || "",
      setupComplete: !!(seller?.companyName && seller?.offerSummary),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sellerContext: sellerContextForm,
    };

    return NextResponse.json([business]);
  } catch {
    return NextResponse.json([]);
  }
}
