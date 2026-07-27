import { NextResponse } from "next/server";

import { getSession } from "@/src/server/auth";
import { privateJson } from "@/src/server/private-json";
import {
  saveOnboarding,
  getOnboarding,
  saveSellerKnowledge,
  getSellerKnowledge,
} from "@/src/server/repository";
import { sellerContextDraftSchema } from "@/src/domain/onboarding";
import { sellerKnowledgeSchema } from "@/src/domain/schemas";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/seller-context
 * Returns the saved seller knowledge (rich shape) or falls back to old sellerContext.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const knowledge = await getSellerKnowledge(userId);
    if (knowledge) return privateJson(knowledge);

    const data = await getOnboarding(userId);
    return privateJson(data.sellerContext ?? {});
  } catch {
    return privateJson({});
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
    const body = await readBoundedJson(request) as Record<string, unknown>;

    const isRichPayload = body.caseStudies !== undefined ||
      body.commonObjections !== undefined ||
      body.pricingModel !== undefined ||
      body.competitorNotes !== undefined;

    if (isRichPayload) {
      const parsed = sellerKnowledgeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Seller context is invalid." },
          { status: 400 },
        );
      }
      await saveSellerKnowledge(parsed.data, userId);
    } else {
      const parsed = sellerContextDraftSchema.safeParse({
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
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Seller context is invalid." }, { status: 400 });
      }

      await saveOnboarding({
        profile: {
          companyName: typeof body.companyName === "string" ? body.companyName : undefined,
          websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl : undefined,
        },
        sellerContext: parsed.data,
      }, userId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Unable to save seller context." },
      { status: 400 },
    );
  }
}
