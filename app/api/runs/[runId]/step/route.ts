import { after, NextResponse } from "next/server";

import { getRun, updateRun, addRunEvent, updateRunTarget, addArtifact, getRunOwner, refundCredits } from "@/src/server/repository";
import { resolveIntegrationConfig } from "@/src/server/settings";
import { ProposalOrchestrator } from "@/src/app/orchestrator";
import { buildRunPlan } from "@/src/domain/pipeline";
import { CloudflareCrawler } from "@/src/integrations/cloudflare";
import { DeepcrawlCrawler } from "@/src/integrations/deepcrawl";
import { GeminiImageProvider } from "@/src/integrations/gemini";
import { PerplexityEnrichmentProvider } from "@/src/integrations/perplexity";
import { PlusAiDeckProvider } from "@/src/integrations/plusai";
import { UnconfiguredDeepcrawlCrawler, type DeckGenerationInput, type DeckProvider } from "@/src/integrations/providers";
import { AiBriefBuilder } from "@/src/server/ai-brief-builder";
import { createDeckProvider, hasDeckProviderConfig } from "@/src/server/deck-provider";
import { INTERNAL_ORIGIN_HEADER, resolveRequestOrigin } from "@/src/server/request-origin";
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
    const { getSession } = await import("@/src/server/auth");
    const session = await getSession();
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

  const origin = resolveRequestOrigin(request);
  const stepUrl = `${origin}/api/runs/${runId}/step`;
  const { userId: runUserId } = await getRunOwner(runId);

  try {
    if (step === "prepare") {
      await runPrepareStep(runId, run, stepUrl, INTERNAL_SECRET, runUserId ?? undefined);
    } else if (step === "target") {
      await runTargetStep(runId, run, targetIndex, stepUrl, INTERNAL_SECRET, runUserId ?? undefined);
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

const CHAIN_MAX_RETRIES = 3;
const CHAIN_BASE_DELAY_MS = 2_000;

function chainNextStep(
  runId: string,
  stepUrl: string,
  body: Record<string, unknown>,
  secret: string,
  origin: string,
) {
  after(async () => {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < CHAIN_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(stepUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": secret,
            [INTERNAL_ORIGIN_HEADER]: origin,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) return; // Success — done

        const text = await response.text();
        lastError = `HTTP ${response.status}: ${text.slice(0, 500)}`;

        // Don't retry client errors (except 408/429)
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          console.error(`[step-runner] Non-retryable error chaining step: ${lastError}`);
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (attempt < CHAIN_MAX_RETRIES - 1) {
        const delay = CHAIN_BASE_DELAY_MS * (attempt + 1);
        console.warn(`[step-runner] Chain attempt ${attempt + 1} failed for run ${runId}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted — mark run as failed and refund
    console.error(`[step-runner] All ${CHAIN_MAX_RETRIES} chain attempts failed for run ${runId}: ${lastError}`);
    try {
      await updateRun(runId, { status: "failed", lastError: `Pipeline stalled: ${lastError}` });
      await addRunEvent(runId, { level: "error", stage: "chain_failed", message: `Step chaining failed after ${CHAIN_MAX_RETRIES} attempts: ${lastError}` });

      const { userId, creditsCharged } = await getRunOwner(runId);
      if (userId && creditsCharged > 0) {
        await refundCredits(userId, creditsCharged);
        await addRunEvent(runId, {
          level: "info",
          stage: "credit_refund",
          message: `${creditsCharged} credit${creditsCharged !== 1 ? "s" : ""} refunded — pipeline could not continue.`,
        });
      }
    } catch (refundErr) {
      console.error(`[step-runner] Failed to handle chain failure for run ${runId}:`, refundErr);
    }
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
  userId?: string,
) {
  await updateRun(runId, { status: "running", lastError: null });
  await addRunEvent(runId, { level: "info", stage: "run_started", message: "Run processing started." });

  const settings = await resolveIntegrationConfig(userId);
  if (!settings.cloudflareAccountId || !settings.cloudflareApiToken) {
    throw new Error("Cloudflare configuration is missing.");
  }
  if (!settings.perplexityApiKey) {
    throw new Error("Perplexity configuration is missing.");
  }

  // Validate deck provider exists before spending time on crawl
  if (!hasDeckProviderConfig(settings)) {
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
  const persistedTargets = run.targets as unknown as PersistedRunTarget[];

  // Fire events and mark all targets as processing in parallel
  await Promise.all([
    addRunEvent(runId, { level: "info", stage: "seller_brief", message: "Analyzing your business positioning..." }),
    addRunEvent(runId, { level: "info", stage: "crawl", message: `Starting crawl and enrichment for ${input.targets.length} target(s)...` }),
    ...persistedTargets.map((targetRow) =>
      updateRunTarget(targetRow.id, { status: "processing", lastError: null }),
    ),
  ]);

  const prepared = await orchestrator.prepareRun(input);

  // Save run-level results and mark targets in parallel
  await Promise.all([
    addRunEvent(runId, { level: "info", stage: "company_brief", message: `Crawl and enrichment complete. ${prepared.preparedCompanies.length} target(s) ready, ${prepared.failedCompanies.length} failed.` }),
    updateRun(runId, { sellerBriefJson: prepared.sellerBrief }),
    addArtifact(runId, { artifactType: "run_plan", artifactJson: buildRunPlan(input) }),
    addArtifact(runId, { artifactType: "seller_brief", artifactJson: prepared.sellerBrief }),
  ]);

  // Mark failed targets and save prepared data in parallel
  await Promise.all([
    // Failed targets
    ...prepared.failedCompanies.flatMap((failedCompany) => {
      const targetRow = persistedTargets.find((t) => t.website_url === failedCompany.target.websiteUrl);
      if (!targetRow) return [];
      return [
        updateRunTarget(targetRow.id, { status: "failed", lastError: failedCompany.message }),
        addRunEvent(runId, { targetId: targetRow.id, level: "error", stage: failedCompany.stage, message: failedCompany.message }),
      ];
    }),
    // Prepared targets
    ...prepared.preparedCompanies.flatMap((preparedCompany) => {
      const targetRow = persistedTargets.find((t) => t.website_url === preparedCompany.target.websiteUrl);
      if (!targetRow) return [];
      return [
        updateRunTarget(targetRow.id, { status: "brief_ready", crawlProvider: preparedCompany.crawlResult.provider, lastError: null }),
        addArtifact(runId, { targetId: targetRow.id, artifactType: "crawl_result", artifactJson: preparedCompany.crawlResult }),
        addArtifact(runId, { targetId: targetRow.id, artifactType: "enrichment", artifactJson: preparedCompany.enrichment }),
        addArtifact(runId, { targetId: targetRow.id, artifactType: "company_brief", artifactJson: preparedCompany.companyBrief }),
        addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "company_brief", message: `Built detailed profile for ${preparedCompany.companyBrief.companyName ?? preparedCompany.target.websiteUrl}.` }),
      ];
    }),
  ]);

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
  chainNextStep(runId, stepUrl, { step: "target", targetIndex: 0 }, secret, new URL(stepUrl).origin);
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
  userId?: string,
) {
  const settings = await resolveIntegrationConfig(userId);

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
    chainNextStep(
      runId,
      stepUrl,
      { step: "target", targetIndex: targetIndex + 1 },
      secret,
      new URL(stepUrl).origin,
    );
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
    let imagePromise: Promise<Awaited<ReturnType<GeminiImageProvider["generateSupportingAssets"]>>> | null = null;
    if (deckInput.imagePolicy !== "never" && settings.geminiApiKey) {
      await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "image_strategy", message: `Generating supporting visuals for ${targetName}...` });
      const imageProvider = new GeminiImageProvider(settings.geminiApiKey);
      imagePromise = imageProvider.generateSupportingAssets({
        companyBrief,
        sellerPositioningSummary,
        visualStyle: deckInput.visualStyle,
        objective: deckInput.objective,
      });
    }

    // ── Slide planning ──
    let slidePlanPrompt: string | undefined;
    let slidePlanPromise: Promise<{
      slidePlan: Awaited<ReturnType<SlidePlanner["planSlides"]>>;
      slidePlanPrompt: string;
    }> | null = null;
    const sellerContactInfo = {
      companyName: run.sellerContext.companyName,
      email: undefined as string | undefined,
      phone: undefined as string | undefined,
      website: run.sellerContext.websiteUrl,
      logoUrl: undefined as string | undefined,
    };
    if (settings.geminiApiKey) {
      await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "slide_planning", message: `Planning slide content for ${targetName}...` });
      const slidePlanner = new SlidePlanner(settings.geminiApiKey);
      slidePlanPromise = slidePlanner.planSlides({
        companyBrief,
        sellerBrief: sellerBrief as { positioningSummary: string; offerSummary: string; proofPoints: string[]; preferredAngles: string[] },
        deckInput,
        sellerContactInfo,
        slideStructure: run.questionnaire.extraInstructions,
      }).then((slidePlan) => ({
        slidePlan,
        slidePlanPrompt: slidePlanner.formatPlanAsPrompt(slidePlan, sellerContactInfo),
      }));
    }

    if (imagePromise) {
      try {
        const imageResult = await imagePromise;
        imageUrls = imageResult.assetUrls;
        await addArtifact(runId, { targetId: targetRow.id, artifactType: "image_strategy", artifactJson: imageResult });
      } catch (error) {
        await addRunEvent(runId, { targetId: targetRow.id, level: "warning", stage: "image_strategy", message: error instanceof Error ? error.message : "Image generation skipped." });
      }
    }

    if (slidePlanPromise) {
      try {
        const { slidePlan, slidePlanPrompt: prompt } = await slidePlanPromise;
        slidePlanPrompt = prompt;
        await addArtifact(runId, { targetId: targetRow.id, artifactType: "slide_plan", artifactJson: slidePlan as unknown as Record<string, unknown> });
        await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "slide_planning", message: `Content plan ready: ${slidePlan.slides.length} slides structured.` });
      } catch (error) {
        console.error("[step-runner] Slide planning failed:", error);
        await addRunEvent(runId, { targetId: targetRow.id, level: "warning", stage: "slide_planning", message: "Slide planning skipped — using direct generation." });
      }
    }

    // ── Deck generation ──
    await addRunEvent(runId, { targetId: targetRow.id, level: "info", stage: "delivery", message: `Generating personalized deck for ${targetName}...` });

    const deckProvider: DeckProvider = createDeckProvider(settings);

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
    chainNextStep(
      runId,
      stepUrl,
      { step: "target", targetIndex: targetIndex + 1 },
      secret,
      new URL(stepUrl).origin,
    );
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
