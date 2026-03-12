import { ProposalOrchestrator } from "@/src/app/orchestrator";
import { buildRunPlan } from "@/src/domain/pipeline";
import type { IntakeRun } from "@/src/domain/schemas";
import { DeepcrawlCrawler } from "@/src/integrations/deepcrawl";
import { CloudflareCrawler } from "@/src/integrations/cloudflare";
import { GeminiImageProvider } from "@/src/integrations/gemini";
import { PerplexityEnrichmentProvider } from "@/src/integrations/perplexity";
import { PresentonDeckProvider } from "@/src/integrations/presenton";
import {
  UnconfiguredDeepcrawlCrawler,
  type DeckGenerationInput,
} from "@/src/integrations/providers";
import { LocalCompanyBriefBuilder, LocalSellerBriefBuilder } from "@/src/server/builders";
import {
  addArtifact,
  addRunEvent,
  getRun,
  updateRun,
  updateRunTarget,
} from "@/src/server/repository";
import { resolveIntegrationConfig } from "@/src/server/settings";

const activeRuns = new Set<string>();

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

function buildDeckInput(run: ReturnType<typeof getRun>, companyBrief: DeckGenerationInput["companyBrief"], sellerPositioningSummary: string): DeckGenerationInput {
  if (!run) {
    throw new Error("Run payload was not found.");
  }

  return {
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
}

function buildIntakeRun(run: NonNullable<ReturnType<typeof getRun>>): IntakeRun {
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

async function processRun(runId: string) {
  const run = getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} was not found.`);
  }

  updateRun(runId, { status: "running", lastError: null });
  addRunEvent(runId, { level: "info", stage: "run_started", message: "Run processing started." });

  const settings = resolveIntegrationConfig();
  if (!settings.cloudflareAccountId || !settings.cloudflareApiToken) {
    throw new Error("Cloudflare configuration is missing.");
  }
  if (!settings.perplexityApiKey) {
    throw new Error("Perplexity configuration is missing.");
  }

  const primaryCrawler = new CloudflareCrawler({
    accountId: settings.cloudflareAccountId,
    apiToken: settings.cloudflareApiToken,
  });
  const fallbackCrawler = settings.deepcrawlApiKey
    ? new DeepcrawlCrawler({ apiKey: settings.deepcrawlApiKey })
    : new UnconfiguredDeepcrawlCrawler();
  const enrichmentProvider = new PerplexityEnrichmentProvider(settings.perplexityApiKey);
  const imageProvider = settings.geminiApiKey
    ? new GeminiImageProvider(settings.geminiApiKey)
    : undefined;
  const presentonProvider = settings.presentonBaseUrl
    ? new PresentonDeckProvider({
        baseUrl: settings.presentonBaseUrl,
        apiKey: settings.presentonApiKey,
        defaultTemplate: settings.presentonTemplate,
      })
    : undefined;

  if (!presentonProvider) {
    throw new Error("Presenton configuration is missing.");
  }

  const orchestrator = new ProposalOrchestrator({
    primaryCrawler,
    fallbackCrawler,
    enrichmentProvider,
    imageProvider,
    presentonProvider,
    sellerBriefBuilder: new LocalSellerBriefBuilder(),
    companyBriefBuilder: new LocalCompanyBriefBuilder(),
  });

  const input = buildIntakeRun(run);
  const prepared = await orchestrator.prepareRun(input);
  updateRun(runId, { sellerBriefJson: prepared.sellerBrief });
  addArtifact(runId, { artifactType: "run_plan", artifactJson: buildRunPlan(input) });
  addArtifact(runId, { artifactType: "seller_brief", artifactJson: prepared.sellerBrief });
  const persistedTargets = run.targets as unknown as PersistedRunTarget[];

  for (const failedCompany of prepared.failedCompanies) {
    const targetRow = persistedTargets.find(
      (target) => target.website_url === failedCompany.target.websiteUrl,
    );

    if (!targetRow) {
      continue;
    }

    updateRunTarget(targetRow.id, {
      status: "failed",
      lastError: failedCompany.message,
    });
    addRunEvent(runId, {
      targetId: targetRow.id,
      level: "error",
      stage: failedCompany.stage,
      message: failedCompany.message,
    });
  }

  for (const preparedCompany of prepared.preparedCompanies) {
    const targetRow = persistedTargets.find(
      (target) => target.website_url === preparedCompany.target.websiteUrl,
    );

    if (!targetRow) {
      continue;
    }

    try {
      updateRunTarget(targetRow.id, {
        status: "brief_ready",
        crawlProvider: preparedCompany.crawlResult.provider,
        lastError: null,
      });
      addArtifact(runId, {
        targetId: targetRow.id,
        artifactType: "crawl_result",
        artifactJson: preparedCompany.crawlResult,
      });
      addArtifact(runId, {
        targetId: targetRow.id,
        artifactType: "enrichment",
        artifactJson: preparedCompany.enrichment,
      });
      addArtifact(runId, {
        targetId: targetRow.id,
        artifactType: "company_brief",
        artifactJson: preparedCompany.companyBrief,
      });
      addRunEvent(runId, {
        targetId: targetRow.id,
        level: "info",
        stage: "company_brief",
        message: `Prepared brief for ${preparedCompany.target.websiteUrl} using ${preparedCompany.crawlResult.provider}.`,
      });

      const deckInput = buildDeckInput(
        run,
        preparedCompany.companyBrief,
        prepared.sellerBrief.positioningSummary,
      );
      let imageUrls: string[] = [];

      if (deckInput.imagePolicy !== "never" && imageProvider) {
        try {
          const imageResult = await imageProvider.generateSupportingAssets({
            companyBrief: preparedCompany.companyBrief,
            sellerPositioningSummary: prepared.sellerBrief.positioningSummary,
            visualStyle: deckInput.visualStyle,
            objective: deckInput.objective,
          });
          imageUrls = imageResult.assetUrls;
          addArtifact(runId, {
            targetId: targetRow.id,
            artifactType: "image_strategy",
            artifactJson: imageResult,
          });
        } catch (error) {
          addRunEvent(runId, {
            targetId: targetRow.id,
            level: "warning",
            stage: "image_strategy",
            message:
              error instanceof Error
                ? error.message
                : "Image generation skipped after an unknown error.",
          });
        }
      }

      const delivery = await presentonProvider.createDeck(deckInput, imageUrls);
      addArtifact(runId, {
        targetId: targetRow.id,
        artifactType: "presentation_delivery",
        artifactJson: delivery,
      });
      updateRunTarget(targetRow.id, { status: "delivered", lastError: null });
      addRunEvent(runId, {
        targetId: targetRow.id,
        level: "info",
        stage: "delivery",
        message: `Deck delivery completed for ${preparedCompany.target.websiteUrl}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Target processing failed for an unknown reason.";
      updateRunTarget(targetRow.id, {
        status: "failed",
        lastError: message,
      });
      addRunEvent(runId, {
        targetId: targetRow.id,
        level: "error",
        stage: "target_failed",
        message,
      });
    }
  }

  const refreshedRun = getRun(runId);
  if (!refreshedRun) {
    throw new Error("Run disappeared during processing.");
  }

  const failedTargets = (refreshedRun.targets as unknown as PersistedRunTarget[]).filter(
    (target) => target.status === "failed",
  );
  updateRun(runId, {
    status: failedTargets.length > 0 ? "partially_completed" : "completed",
    lastError: failedTargets.length > 0 ? "One or more targets failed." : null,
  });
  addRunEvent(runId, {
    level: failedTargets.length > 0 ? "warning" : "info",
    stage: "run_finished",
    message:
      failedTargets.length > 0
        ? `Run finished with ${failedTargets.length} failed target(s).`
        : "Run finished successfully.",
  });
}

export function launchRunProcessing(runId: string) {
  if (activeRuns.has(runId)) {
    return false;
  }

  activeRuns.add(runId);
  void processRun(runId)
    .catch((error) => {
      updateRun(runId, {
        status: "failed",
        lastError: error instanceof Error ? error.message : "Unknown run failure.",
      });
      addRunEvent(runId, {
        level: "error",
        stage: "run_failed",
        message: error instanceof Error ? error.message : "Unknown run failure.",
      });
    })
    .finally(() => {
      activeRuns.delete(runId);
    });

  return true;
}
