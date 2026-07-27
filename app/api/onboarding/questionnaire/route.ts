import { NextResponse } from "next/server";

import { questionnaireDraftSchema } from "@/src/domain/onboarding";
import {
  isRichStaticQuestionnaire,
  RICH_STATIC_VISUAL_PROFILE,
} from "@/src/domain/visual-profile";
import { getSession } from "@/src/server/auth";
import { privateJson } from "@/src/server/private-json";
import { saveOnboarding, getOnboarding } from "@/src/server/repository";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/questionnaire
 * Returns saved questionnaire/run-settings so the UI can hydrate on page load.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getOnboarding(session.user.id);
    return privateJson(data.questionnaire ?? {});
  } catch {
    return privateJson({});
  }
}

/**
 * POST /api/onboarding/questionnaire
 * Merges supplied questionnaire/run-settings fields into the saved draft.
 * Omitted fields remain unchanged so focused editors cannot erase one another.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await readBoundedJson(request);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "Questionnaire is invalid." }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;

    const allowedFields = [
      "archetype",
      "audience",
      "audienceSize",
      "audienceIndustry",
      "audiencePainPoints",
      "objective",
      "successMetric",
      "callToAction",
      "ctaUrgency",
      "outputFormat",
      "desiredCardCount",
      "tone",
      "customTone",
      "visualStyle",
      "customVisualStyle",
      "imagePolicy",
      "visualContentTypes",
      "visualDensity",
      "mustInclude",
      "mustAvoid",
      "extraInstructions",
      "customArchetypePrompt",
    ] as const;
    const candidate = Object.fromEntries(
      allowedFields
        .filter((field) => Object.hasOwn(body, field))
        .map((field) => [field, body[field]]),
    ) as Record<string, unknown>;
    if (Object.hasOwn(candidate, "outputFormat")) {
      candidate.outputFormat = candidate.outputFormat === "presenton_editor"
        ? "pptx"
        : candidate.outputFormat;
    }
    if (Object.hasOwn(candidate, "desiredCardCount")) {
      candidate.desiredCardCount = Number(candidate.desiredCardCount);
    }
    if (Object.hasOwn(candidate, "tone") && candidate.tone !== "custom") {
      candidate.customTone = "";
    }
    if (Object.hasOwn(candidate, "visualStyle") && candidate.visualStyle !== "custom") {
      candidate.customVisualStyle = "";
    }
    // These retired controls cannot be re-enabled through a partial update.
    candidate.optionalReview = false;
    candidate.allowUserApprovedCrawlException = false;
    const requestedProfile = {
      imagePolicy: Object.hasOwn(candidate, "imagePolicy")
        ? String(candidate.imagePolicy)
        : RICH_STATIC_VISUAL_PROFILE.imagePolicy,
      visualContentTypes: Object.hasOwn(candidate, "visualContentTypes")
        && Array.isArray(candidate.visualContentTypes)
        ? candidate.visualContentTypes.map(String)
        : [...RICH_STATIC_VISUAL_PROFILE.visualContentTypes],
      visualDensity: Object.hasOwn(candidate, "visualDensity")
        ? String(candidate.visualDensity)
        : RICH_STATIC_VISUAL_PROFILE.visualDensity,
    };
    if (!isRichStaticQuestionnaire(requestedProfile)) {
      return NextResponse.json(
        { error: "v0.1 requires the verified rich-static vector profile." },
        { status: 400 },
      );
    }
    candidate.imagePolicy = RICH_STATIC_VISUAL_PROFILE.imagePolicy;
    candidate.visualContentTypes = [...RICH_STATIC_VISUAL_PROFILE.visualContentTypes];
    candidate.visualDensity = RICH_STATIC_VISUAL_PROFILE.visualDensity;

    const parsed = questionnaireDraftSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: "Questionnaire is invalid." }, { status: 400 });
    }

    await saveOnboarding({
      profile: {},
      questionnaire: parsed.data,
    }, session.user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Unable to save questionnaire." },
      { status: 400 },
    );
  }
}
