import { NextResponse } from "next/server";

import { getRun, updateRun, addRunEvent, updateRunTarget, addArtifact, getRunOwner, refundCredits } from "@/src/server/repository";
import { resolveIntegrationConfig } from "@/src/server/settings";
import { ProposalOrchestrator } from "@/src/app/orchestrator";
import { buildRunPlan } from "@/src/domain/pipeline";
import { CloudflareCrawler } from "@/src/integrations/cloudflare";
import { DeepcrawlCrawler } from "@/src/integrations/deepcrawl";
import { GeminiImageProvider } from "@/src/integrations/gemini";
import { PerplexityEnrichmentProvider } from "@/src/integrations/perplexity";
import { PlusAiDeckProvider } from "@/src/integrations/plusai";
import { PresentonDeckProvider } from "@/src/integrations/presenton";
import { UnconfiguredDeepcrawlCrawler, type DeckGenerationInput, type DeckProvider } from "@/src/integrations/providers";
import { AiBriefBuilder } from "@/src/server/ai-brief-builder";
import { LocalCompanyBriefBuilder, LocalSellerBriefBuilder } from "@/src/server/builders";
import { SlidePlanner } from "@/src/server/slide-planner";
import type { IntakeRun } from "@/src/domain/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Each step gets its own 300s budget

/**
 * POST /api/runs/:runId/step
 * Body: { step: "prepare" | "target", targetIndex?: number }
 *
 * Step-based pipeline execution. Each step is a separate HTTP request,
 * so each step gets its own 300s Vercel function budget.
 *
 * Flow:
 * 1. "prepare" — crawl + enrich all targets, save results, then self-chain to target steps
 * 2. "target" (targetIndex=0) — images + slide plan + deck gen for target 0, then chain to target 1
 * 3. "target" (targetIndex=1) — same for target 1, then chain to target 2 or finalize
 *
 * The chain uses fire-and-forget fetch() to the next step URL.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  // Authenticate via internal secret (self-calls) or user session
  const authHeader = request.headers.get("x-internal-secret");
  const INTERNAL_SECRET = process.env.INTERNAL_PIPELINE_SECRET || process.env.BETTER_AUTH_SECRET || "internal";

  if (authHeader !== INTERNAL_SECRET) {
    // Fallback: check user session
    const { getAdminSession } = await import("@/src/server/auth");
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const step = body.step as string;
  const targetIndex = typeof body.targetIndex === "number" ? body.targetIndex : 0;

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  // If run was cancelled or already completed, bail out
  if (["cancelled", "completed", "failed"].includes(run.status)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `Run is ${run.status}` });
  }

  const origin = request.headers.get("origin")
    || request.headers.get("x-forwarded-proto") && `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
    || `https://${request.headers.get("host") || "localhost:3000"}`;
  const stepUrl = `${origin}/api/runs/${runId}/step`;

  try {
    if (step === "prepare") {
      await runPrepareStep(runId, run, stepUrl, INTERNAL_SECRET);
    } else if (step === "target") {
      await runTargetStep(runId, run, targetIndex, stepUrl, INTERNAL_SECRET);
    } else {
      return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, step, targetIndex });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown step failure.";
    console.error(`[step-runner] Step "${step}" failed for run ${runId}:`, error);

    await updateRun(runId, { status: "failed", lastError: message });
    await addRunEvent(runId, { level: "error", stage: "run_failed", message });

    // Refund all credits
    try {
      const { userId, creditsCharged } = await getRunOwner(runId);
      if (userId && creditsCharged > 0) {
        await refundCredits(userId, creditsCharged);
        await addRunEvent(runId, {
          level: "info",
          stage: "credit_refund",
          message: `${creditsCharged} credit${creditsCharged !== 1 ? "s" : ""} refunded — run did not complete.`,
        });
      }
    } catch (refundErr) {
      console.error(`[step-runner] Refund failed for run ${runId}:`, refundErr);
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   Fire-and-forget: call the next step
   ───────────────────────────────────────────── */

function chainNextStep(
  stepUrl: string,
  body: Record<string, unknown>,
  secret: string,
) {
  // Fire and forget — don't await, don't care about the response
  fetch(stepUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error("[step-runner] Failed to chain next step:", err);
  });
}

/* ─────────────────────────────────────────────
   Step: PREPARE — crawl + enrich all targets
   ───────────────────────────────────────────── */

interface PersistedRunTarget {
  id: string;
  website_url: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  campaign_goal: string | null;
  notes: string | null;
  status: string;
}

function buildIntakeRun(run: NonNullable<Awaited<ReturnType<typeof getRun>>>): IntakeRun {
  const persistedTargets = run.targets as unknown as PersistedRunTarget[];
  return {
    sellerContext: run.sellerContext,
    questionnaire: run.questionnaire,
    targets: persistedTargets.map((target) => ({
      websiteUrl: target.website_url,
      companyName: target.company_name ?? undefined,
      firstName: target.first_name ?? undefined,
      lastName: target.last_name ?? undefined,
      role: target.role ?? undefined,
      campaignGoal: target.campaign_goal ?? undefined,
      notes: target.notes ?? undefined,
    })),
  };
}

async function runPrepareStep(
  runId: string,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  stepUrl: string,
  secret: string,
) {
  await updateRun(runId, { status: "running", lastError: null });
  await addRunEvent(runId, { level: "info", stage: "run_started", message: "Run processing started." });

  const settings = await resolveIntegrationConfig();
  if (!settings.cloudflareAccountId || !settings.cloudflareApiToken) {
    throw new Error("Cloudflare configuration is missing.");
  }
  if (!settings.perplexityApiKey) {
    throw new Error("Perplexity configuration is missing.");
  }

  // Validate deck provider exists before spending time on crawl
  if (!settings.plusaiApiKey && !settings.presentonBaseUrl) {
    throw new Error("No deck provider configured. Set PLUSAI_API_KEY or PRESENTON_BASE_URL.");
  }

  await addRunEvent(runId, { level: "info", stage: "preflight", message: "Deck generation service connected." });

  const primaryCrawler = new CloudflareCrawler({
    accountId: settings.cloudflareAccountId,
    apiToken: settings.cloudflareApiToken,
  });
  const fallbackCrawler = settings.deepcrawlApiKey
    ? new DeepcrawlCrawler({ apiKey: settings.deepcrawlApiKey })
    : new UnconfiguredDeepcrawlCrawler();
  const enrichmentProvider = new PerplexityEnrichmentProvider(settings.perplexityApiKey);
  const companyBriefBuilder = settings.geminiApiKey
    ? new AiBriefBuilder(settings.geminiApiKey)
    : new LocalCompanyBriefBuilder();

  const orchestrator = new ProposalOrchestrator({
    primaryCrawler,
    fallbackCrawler,
    enrichmentProvider,
    sellerBriefBuilder: new LocalSellerBriefBuilder(),
    companyBriefBuilder,
  });

  const input = buildIntakeRun(run);

  await addRunEvent(runId, { level: "info", stage: "seller_brief", message: "Analyzing your business positioning..." });
  await addRunEvent(runId, { level: "info", stage: "crawl", message: `Starting crawl and enrichment for ${input.targets.length} target(s)...` });

  const prepared = await orchestrator.prepareRun(input);

  await addRunEvent(runId, { level: "info", stage: "company_brief", message: `Crawl and enrichment complete. ${prepared.preparedCompanies.length} target(s) ready, ${prepared.failedCompanies.length} failed.` });
  await updateRun(runId, { sellerBriefJson: prepared.sellerBrief });
  await addArtifact(runId, { artifactType: "run_plan", artifactJson: buildRunPlan(input) });
  await addArtifact(runId, { artifactType: "seller_brief", artifactJson: prepared.sellerBrief });

  const persistedTargets = run.targets as unknown as PersistedRunTarget[];

  // Mark failed targets
  for (const failedCompany of prepared.failedCompanies) {
    const targetRow = persistedTargets.find((t) => t.website_url === failedCompany.target.websiteUrl);
    if (!targetRow) continue;
    await updateRunTarget(targetRow.id, { status: "failed", lastError: failedCompany.message });
    await addRunEvent(runId, { targetId: targetRow.id, level: "error", stage: failedCompany.stage, message: failedCompany.message });
  }

  // Save prepared data as artifacts so the target step can retrieve them
  for (const preparedCompany of prepared.preparedCompanies) {
    const targetRow = persistedTargets.find((t) => t.website_url === preparedCompany.target.websiteUrl);
    if (!targetRow) continue;
    await updateRunTarget(targetRow.id, { status: "brief_ready", crawlProvider: preparedCompany.crawlResult.provider, lastError: null });
    await addArtifact(runId, { targetId: targetRow.id, artifactType: "crawl_result", artifactJson: preparedCompany.crawlResult });
    await addArtifact(runId, { targetId: targetRow.id, artifactType: "enrichment", artifactJson: preparedCompany.enrichment });
    await addArtifact(runId, { targetId: targetRow.id, artifactType: "company_brief", artifactJson: preparedCompany.companyBrief });
    await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "company_brief", message: `Built detailed profile for ${preparedCompany.companyBrief.companyName ?? preparedCompany.target.websiteUrl}.` });
  }

  // If ALL targets failed in prepare, finalize now
  if (prepared.preparedCompanies.length === 0) {
    await updateRun(runId, { status: "failed", lastError: "All targets failed during crawl/enrichment." });
    await addRunEvent(runId, { level: "error", stage: "run_failed", message: "All targets failed during crawl/enrichment." });

    // Refund all credits
    const { userId, creditsCharged } = await getRunOwner(runId);
    if (userId && creditsCharged > 0) {
      await refundCredits(userId, creditsCharged);
      await addRunEvent(runId, { level: "info", stage: "credit_refund", message: `${creditsCharged} credit${creditsCharged !== 1 ? "s" : ""} refunded — all targets failed.` });
    }
    return;
  }

  // Chain to target step 0
  chainNextStep(stepUrl, { step: "target", targetIndex: 0 }, secret);
}

/* ─────────────────────────────────────────────
   Step: TARGET — process one target (images + slide plan + deck gen)
   ───────────────────────────────────────────── */

async function runTargetStep(
  runId: string,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  targetIndex: number,
  stepUrl: string,
  secret: string,
) {
  const settings = await resolveIntegrationConfig();

  const persistedTargets = run.targets as unknown as PersistedRunTarget[];
  // Filter to only targets that have brief_ready status (successfully prepared)
  const readyTargets = persistedTargets.filter((t) => t.status === "brief_ready");

  if (targetIndex >= readyTargets.length) {
    // All targets processed — finalize
    await finalizeRun(runId);
    return;
  }

  const targetRow = readyTargets[targetIndex];
  await updateRunTarget(targetRow.id, { status: "processing", lastError: null });

  // Retrieve the company brief from artifacts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifacts = run.artifacts as any[];
  const briefArtifact = artifacts.find(
    (a) => a.target_id === targetRow.id && a.artifact_type === "company_brief",
  );
  if (!briefArtifact) {
    await updateRunTarget(targetRow.id, { status: "failed", lastError: "Company brief not found — prepare step may have failed." });
    await addRunEvent(runId, { targetId: targetRow.id, level: "error", stage: "target_failed", message: "Company brief not found." });
    // Continue to next target
    chainNextStep(stepUrl, { step: "target", targetIndex: targetIndex + 1 }, secret);
    return;
  }

  const companyBrief = briefArtifact.artifact_json as DeckGenerationInput["companyBrief"];
  const targetName = companyBrief.companyName ?? targetRow.website_url;

  // Resolve seller brief
  const sellerBriefArtifact = artifacts.find(
    (a) => a.artifact_type === "seller_brief",
  );
  const sellerPositioningSummary = (sellerBriefArtifact?.artifact_json as Record<string, unknown>)?.positioningSummary as string ?? "";
  const sellerBrief = sellerBriefArtifact?.artifact_json as Record<string, unknown> ?? {};

  // Build deck input
  const deckInput: DeckGenerationInput = {
    companyBrief,
    sellerPositioningSummary,
    archetype: run.questionnaire.archetype,
    objective: run.questionnaire.objective,
    audience: run.questionnaire.audience,
    cardCount: run.questionnaire.desiredCardCount,
    callToAction: run.questionnaire.callToAction,
    tone: run.questionnaire.tone,
    visualStyle: run.questionnaire.visualStyle,
    mustInclude: run.questionnaire.mustInclude,
    mustAvoid: run.questionnaire.mustAvoid,
    outputFormat: run.questionnaire.outputFormat,
    imagePolicy: run.questionnaire.imagePolicy,
  };

  try {
    // ── Image generation ──
    let imageUrls: string[] = [];
    if (deckInput.imagePolicy !== "never" && settings.geminiApiKey) {
      await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "image_strategy", message: `Generating supporting visuals for ${targetName}...` });
      try {
        const imageProvider = new GeminiImageProvider(settings.geminiApiKey);
        const imageResult = await imageProvider.generateSupportingAssets({
          companyBrief,
          sellerPositioningSummary,
          visualStyle: deckInput.visualStyle,
          objective: deckInput.objective,
        });
        imageUrls = imageResult.assetUrls;
        await addArtifact(runId, { targetId: targetRow.id, artifactType: "image_strategy", artifactJson: imageResult });
      } catch (error) {
        await addRunEvent(runId, { targetId: targetRow.id, level: "warning", stage: "image_strategy", message: error instanceof Error ? error.message : "Image generation skipped." });
      }
    }

    // ── Slide planning ──
    let slidePlanPrompt: string | undefined;
    if (settings.geminiApiKey) {
      await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "slide_planning", message: `Planning slide content for ${targetName}...` });
      try {
        const slidePlanner = new SlidePlanner(settings.geminiApiKey);
        const sellerContactInfo = {
          companyName: run.sellerContext.companyName,
          email: undefined as string | undefined,
          phone: undefined as string | undefined,
          website: run.sellerContext.websiteUrl,
          logoUrl: undefined as string | undefined,
        };

        const slidePlan = await slidePlanner.planSlides({
          companyBrief,
          sellerBrief: sellerBrief as { positioningSummary: string; offerSummary: string; proofPoints: string[]; preferredAngles: string[] },
          deckInput,
          sellerContactInfo,
          slideStructure: run.questionnaire.extraInstructions,
        });

        slidePlanPrompt = slidePlanner.formatPlanAsPrompt(slidePlan, sellerContactInfo);
        await addArtifact(runId, { targetId: targetRow.id, artifactType: "slide_plan", artifactJson: slidePlan as unknown as Record<string, unknown> });
        await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "slide_planning", message: `Content plan ready: ${slidePlan.slides.length} slides structured.` });
      } catch (error) {
        console.error("[step-runner] Slide planning failed:", error);
        await addRunEvent(runId, { targetId: targetRow.id, level: "warning", stage: "slide_planning", message: "Slide planning skipped — using direct generation." });
      }
    }

    // ── Deck generation ──
    await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "delivery", message: `Generating personalized deck for ${targetName}...` });

    let deckProvider: DeckProvider;
    if (settings.plusaiApiKey) {
      deckProvider = new PlusAiDeckProvider({ apiKey: settings.plusaiApiKey });
    } else if (settings.presentonBaseUrl) {
      deckProvider = new PresentonDeckProvider({
        baseUrl: settings.presentonBaseUrl,
        apiKey: settings.presentonApiKey,
        defaultTemplate: settings.presentonTemplate,
      });
    } else {
      throw new Error("No deck provider configured.");
    }

    let delivery;
    if (deckProvider instanceof PlusAiDeckProvider && slidePlanPrompt) {
      delivery = await deckProvider.createDeck(deckInput, imageUrls, { slidePlanPrompt });
    } else {
      delivery = await deckProvider.createDeck(deckInput, imageUrls);
    }

    const artifactJson = {
      ...delivery,
      provider: deckProvider.name,
      download_url: delivery.exportUrl ?? undefined,
      url: delivery.editorUrl ?? delivery.exportUrl ?? undefined,
    };
    await addArtifact(runId, { targetId: targetRow.id, artifactType: "presentation_delivery", artifactJson });
    await updateRunTarget(targetRow.id, { status: "delivered", lastError: null });

    const deliveryMsg = delivery.editorUrl ? "View in editor" : delivery.exportUrl ? "Ready for download" : "";
    await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "delivery", message: `Deck delivered for ${targetName}. ${deliveryMsg}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Target processing failed.";
    await updateRunTarget(targetRow.id, { status: "failed", lastError: message });
    await addRunEvent(runId, { targetId: targetRow.id, level: "error", stage: "target_failed", message });
  }

  // Chain to next target or finalize
  if (targetIndex + 1 < readyTargets.length) {
    chainNextStep(stepUrl, { step: "target", targetIndex: targetIndex + 1 }, secret);
  } else {
    await finalizeRun(runId);
  }
}

/* ─────────────────────────────────────────────
   Finalize — set run status, refund failed
   ───────────────────────────────────────────── */

async function finalizeRun(runId: string) {
  const refreshedRun = await getRun(runId);
  if (!refreshedRun) return;

  const persistedTargets = refreshedRun.targets as unknown as PersistedRunTarget[];
  const failedTargets = persistedTargets.filter((t) => t.status === "failed");

  // Refund credits for failed targets
  if (failedTargets.length > 0) {
    try {
      const { userId } = await getRunOwner(runId);
      if (userId) {
        await refundCredits(userId, failedTargets.length);
        await addRunEvent(runId, {
          level: "info",
          stage: "credit_refund",
          message: `${failedTargets.length} credit${failedTargets.length !== 1 ? "s" : ""} refunded for failed target${failedTargets.length !== 1 ? "s" : ""}.`,
        });
      }
    } catch (err) {
      console.error(`[step-runner] Credit refund failed:`, err);
    }
  }

  const allFailed = persistedTargets.every((t) => t.status === "failed");

  await updateRun(runId, {
    status: allFailed ? "failed" : failedTargets.length > 0 ? "partially_completed" : "completed",
    lastError: allFailed ? "All targets failed." : failedTargets.length > 0 ? "Some targets failed." : null,
  });
  await addRunEvent(runId, {
    level: failedTargets.length > 0 ? "warning" : "info",
    stage: "run_finished",
    message: allFailed
      ? "Run finished — all targets failed."
      : failedTargets.length > 0
        ? `Run finished with ${failedTargets.length} failed target(s).`
        : "Run finished successfully.",
  });
}
