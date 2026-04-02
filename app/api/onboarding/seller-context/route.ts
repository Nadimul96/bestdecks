import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import {
  saveOnboarding,
  getOnboarding,
  saveSellerKnowledge,
  getSellerKnowledge,
} from "@/src/server/repository";
import { sellerKnowledgeSchema } from "@/src/domain/schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/seller-context
 * Returns the saved seller knowledge (rich shape) or falls back to old sellerContext.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const knowledge = await getSellerKnowledge(userId);
    if (knowledge) return NextResponse.json(knowledge);

    const data = await getOnboarding(userId);
    return NextResponse.json(data.sellerContext ?? {});
  } catch {
    return NextResponse.json({});
  }
}

/**
 * POST /api/onboarding/seller-context
 * Accepts either the new SellerKnowledge shape or the old flat form shape.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();

    const isRichPayload = body.caseStudies !== undefined ||
      body.commonObjections !== undefined ||
      body.pricingModel !== undefined ||
      body.competitorNotes !== undefined;

    if (isRichPayload) {
      const parsed = sellerKnowledgeSchema.safeParse(body);
      if (parsed.success) {
        await saveSellerKnowledge(parsed.data, userId);
      } else {
        await saveSellerKnowledge(body, userId);
      }
    } else {
      const sellerContext = {
        websiteUrl: body.websiteUrl ?? "",
        companyName: body.companyName ?? "",
        offerSummary: body.offerSummary ?? "",
        services:
          typeof body.servicesText === "string"
            ? body.servicesText.split("\n").map((s: string) => s.trim()).filter(Boolean)
            : body.services ?? [],
        differentiators:
          typeof body.differentiatorsText === "string"
            ? body.differentiatorsText.split("\n").map((s: string) => s.trim()).filter(Boolean)
            : body.differentiators ?? [],
        targetCustomer: body.targetCustomer ?? "",
        desiredOutcome: body.desiredOutcome ?? "",
        proofPoints:
          typeof body.proofPointsText === "string"
            ? body.proofPointsText.split("\n").map((s: string) => s.trim()).filter(Boolean)
            : body.proofPoints ?? [],
        constraints:
          typeof body.constraintsText === "string"
            ? body.constraintsText.split("\n").map((s: string) => s.trim()).filter(Boolean)
            : body.constraints ?? [],
      };

      await saveOnboarding({
        profile: {
          companyName: body.companyName,
          websiteUrl: body.websiteUrl,
        },
        sellerContext,
      }, userId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save seller context." },
      { status: 400 },
    );
  }
}
