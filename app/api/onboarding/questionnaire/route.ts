import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { saveOnboarding } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/questionnaire
 * Saves questionnaire / run-settings fields (archetype, tone, format, etc.)
 * Used by the onboarding wizard and the run-settings view.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Build questionnaire object with sane defaults for unset fields
    const questionnaire = {
      archetype: body.archetype ?? "cold_outreach",
      audience: body.audience ?? "",
      objective: body.objective ?? "",
      callToAction: body.callToAction ?? "",
      outputFormat: body.outputFormat ?? "presenton_editor",
      desiredCardCount: Number(body.desiredCardCount) || 8,
      tone: body.tone ?? "consultative",
      visualStyle: body.visualStyle ?? "premium_modern",
      imagePolicy: body.imagePolicy ?? "auto",
      mustInclude: body.mustInclude ?? [],
      mustAvoid: body.mustAvoid ?? [],
      extraInstructions: body.extraInstructions ?? "",
      optionalReview: body.optionalReview ?? false,
      allowUserApprovedCrawlException:
        body.allowUserApprovedCrawlException ?? false,
    };

    saveOnboarding({
      profile: {},
      questionnaire,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save questionnaire.",
      },
      { status: 400 },
    );
  }
}
