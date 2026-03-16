import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { saveOnboarding, getOnboarding } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/questionnaire
 * Returns saved questionnaire/run-settings so the UI can hydrate on page load.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getOnboarding();
    return NextResponse.json(data.questionnaire ?? {});
  } catch {
    return NextResponse.json({});
  }
}

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
    // Migrate legacy format names
    const outputFormat = body.outputFormat === "presenton_editor"
      ? "bestdecks_editor"
      : (body.outputFormat ?? "bestdecks_editor");

    const questionnaire = {
      archetype: body.archetype ?? "cold_outreach",
      audience: body.audience ?? "",
      audienceSize: body.audienceSize ?? "",
      audienceIndustry: body.audienceIndustry ?? "",
      audiencePainPoints: body.audiencePainPoints ?? "",
      objective: body.objective ?? "",
      successMetric: body.successMetric ?? "",
      callToAction: body.callToAction ?? "",
      ctaUrgency: body.ctaUrgency ?? "",
      outputFormat,
      desiredCardCount: Number(body.desiredCardCount) || 8,
      tone: body.tone ?? "consultative",
      customTone: body.customTone ?? "",
      visualStyle: body.visualStyle ?? "premium_modern",
      customVisualStyle: body.customVisualStyle ?? "",
      imagePolicy: body.imagePolicy ?? "auto",
      visualContentTypes: body.visualContentTypes ?? [],
      visualDensity: body.visualDensity ?? "moderate",
      mustInclude: body.mustInclude ?? [],
      mustAvoid: body.mustAvoid ?? [],
      extraInstructions: body.extraInstructions ?? "",
      optionalReview: body.optionalReview ?? false,
      allowUserApprovedCrawlException:
        body.allowUserApprovedCrawlException ?? false,
    };

    await saveOnboarding({
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
