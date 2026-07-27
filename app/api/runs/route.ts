import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  createRunWithOptions,
  listRuns,
  getOnboarding,
  preflightRunAdmission,
  RunAdmissionError,
} from "@/src/server/repository";
import { getSession } from "@/src/server/auth";
import type { IntakeRun } from "@/src/domain/schemas";
import { intakeRunSchema } from "@/src/domain/schemas";
import {
  CsvIntakeError,
  parseTargetsFromIntakeDraft,
} from "@/src/domain/intake";
import {
  TargetUrlPolicyError,
  validateTargetTransportApproval,
  validatePublicTargetUrls,
} from "@/src/server/target-url-policy";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";
import { buildOnboardingRunConfiguration } from "@/src/server/intake-from-onboarding";
import { isRichStaticQuestionnaire } from "@/src/domain/visual-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // The request persists and enqueues; a worker owns execution.

const simpleRunRequestSchema = z.object({
  websitesText: z.string().trim().min(1).max(250_000),
  contactsCsvText: z.string().max(500_000).optional(),
}).strict();

const fullRunRequestSchema = z.object({
  run: intakeRunSchema,
}).strict();

const runRequestSchema = z.union([
  fullRunRequestSchema,
  simpleRunRequestSchema,
]);

function requestsUnsupportedFullRunControls(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const run = (input as Record<string, unknown>).run;
  if (!run || typeof run !== "object" || Array.isArray(run)) return false;
  const questionnaire = (run as Record<string, unknown>).questionnaire;
  if (!questionnaire || typeof questionnaire !== "object" || Array.isArray(questionnaire)) {
    return false;
  }
  const fields = questionnaire as Record<string, unknown>;
  return fields.optionalReview === true
    || fields.allowUserApprovedCrawlException === true;
}

function formatIntakeValidationError(error: ZodError): string {
  const sellerFields = new Set<string>();
  const questionnaireFields = new Set<string>();
  const otherFields = new Set<string>();

  for (const issue of error.issues) {
    const field = String(issue.path.at(-1) ?? "unknown");
    if (issue.path[0] === "sellerContext") {
      sellerFields.add(field);
    } else if (issue.path[0] === "questionnaire") {
      questionnaireFields.add(field);
    } else {
      otherFields.add(field);
    }
  }

  const parts: string[] = [];
  if (sellerFields.size > 0) {
    parts.push(`Your Business: ${[...sellerFields].join(", ")}`);
  }
  if (questionnaireFields.size > 0) {
    parts.push(`Deck Style: ${[...questionnaireFields].join(", ")}`);
  }
  if (otherFields.size > 0) {
    parts.push([...otherFields].join(", "));
  }

  return parts.length > 0
    ? `Please fill out: ${parts.join(" • ")}`
    : "The run input is invalid.";
}

function formatCsvIntakeError(error: CsvIntakeError): string {
  switch (error.code) {
    case "recipient_email_column":
      return "Recipient-email CSV columns are unavailable while outbound email is deferred.";
    case "unsupported_csv_column":
      return "Target CSV contains an unsupported column. Use only the documented target fields.";
    case "csv_row_limit_exceeded":
      return "Target CSV contains more rows than one run can accept.";
    case "malformed_csv":
      return "Target CSV is malformed. Check quotes, headers, and row widths.";
  }
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const runs = await listRuns(userId);
  // Return as flat array so setup guide can check `Array.isArray(data) && data.length > 0`
  return NextResponse.json(Array.isArray(runs) ? runs : []);
}

/**
 * POST /api/runs
 * Accepts either:
 * A) Simple: { websitesText, contactsCsvText? } — builds IntakeRun from saved onboarding data
 * B) Full:   { run: IntakeRun } — uses the provided run directly
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/u.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key header is required." },
      { status: 400 },
    );
  }

  try {
    const rawBody = await readBoundedJson(request);
    const body = runRequestSchema.parse(rawBody);

    if (requestsUnsupportedFullRunControls(rawBody)) {
      return NextResponse.json(
        {
          error:
            "Manual approval pauses and crawl-failure exceptions are not supported; both flags must be false.",
        },
        { status: 400 },
      );
    }

    let intakeRun: IntakeRun;

    if ("run" in body) {
      // Full format: { run: IntakeRun }
      intakeRun = {
        ...body.run,
        questionnaire: {
          ...body.run.questionnaire,
          optionalReview: false,
          allowUserApprovedCrawlException: false,
        },
      };
    } else {
      // Simple format: { websitesText, contactsCsvText? }
      // Build the IntakeRun from saved onboarding data + target URLs
      const onboarding = await getOnboarding(session.user.id);

      if (!onboarding.sellerContext) {
        return NextResponse.json(
          { error: "Please complete the Business Context step first." },
          { status: 400 },
        );
      }

      if (!onboarding.questionnaire) {
        return NextResponse.json(
          { error: "Please complete the Deck Style (Run Settings) step first." },
          { status: 400 },
        );
      }

      // The canonical intake parser owns quoting, header, width, recipient-PII,
      // URL normalization, and hostname-deduplication semantics.
      const targets = parseTargetsFromIntakeDraft(
        body.websitesText,
        body.contactsCsvText,
      );
      if (targets.length === 0) {
        return NextResponse.json(
          { error: "No target URLs provided." },
          { status: 400 },
        );
      }

      const configuration = buildOnboardingRunConfiguration(
        onboarding.sellerContext,
        onboarding.questionnaire,
      );

      intakeRun = {
        ...configuration,
        targets,
      };
    }

    const parsedRun = intakeRunSchema.parse(intakeRun);
    if (parsedRun.questionnaire.outputFormat !== "pptx") {
      return NextResponse.json(
        { error: "The reference worker currently delivers only PPTX files." },
        { status: 400 },
      );
    }
    if (!isRichStaticQuestionnaire(parsedRun.questionnaire)) {
      return NextResponse.json(
        {
          error:
            "v0.1 requires the verified rich-static vector profile; generated media is unavailable.",
        },
        { status: 400 },
      );
    }
    if (parsedRun.questionnaire.optionalReview
      || parsedRun.questionnaire.allowUserApprovedCrawlException) {
      return NextResponse.json(
        {
          error:
            "Manual approval pauses and crawl-failure exceptions are not supported; both flags must be false.",
        },
        { status: 400 },
      );
    }
    for (const target of parsedRun.targets) {
      validateTargetTransportApproval(target.websiteUrl);
    }

    const preflight = await preflightRunAdmission(
      parsedRun,
      session.user.id,
      idempotencyKey,
    );
    if (preflight.replay) {
      return NextResponse.json({
        ok: true,
        runId: preflight.replay.runId,
        state: preflight.replay.state,
      }, { status: 202 });
    }

    await validatePublicTargetUrls(parsedRun.targets.map((target) => target.websiteUrl));

    // createRun atomically persists the run, targets, initial event, and queue job.
    const runId = await createRunWithOptions(parsedRun, session.user.id, { idempotencyKey });

    return NextResponse.json({
      ok: true,
      runId,
      state: "queued",
    }, { status: 202 });
  } catch (error) {
    if (error instanceof RunAdmissionError) {
      const conflict = error.code === "idempotency_conflict";
      return NextResponse.json(
        {
          error: conflict
            ? "That idempotency key was already used for different run input."
            : "Run admission is temporarily limited. Finish active work or try again later.",
          code: error.code,
        },
        {
          status: conflict ? 409 : 429,
          headers: conflict ? undefined : { "Retry-After": "60" },
        },
      );
    }
    if (error instanceof ZodError) {
      console.warn("[runs] run request rejected", {
        code: "validation_error",
        issueCount: error.issues.length,
      });
      return NextResponse.json(
        { error: formatIntakeValidationError(error) },
        { status: 400 },
      );
    }

    if (error instanceof CsvIntakeError) {
      return NextResponse.json(
        {
          error: formatCsvIntakeError(error),
          code: error.code,
        },
        { status: 400 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 },
      );
    }

    if (error instanceof TargetUrlPolicyError) {
      return NextResponse.json(
        { error: "Every target must resolve to a public HTTPS destination." },
        { status: 400 },
      );
    }

    console.error("[runs] run creation failed", { code: "internal_error" });
    return NextResponse.json(
      { error: "Unable to create the run." },
      { status: 500 },
    );
  }
}
