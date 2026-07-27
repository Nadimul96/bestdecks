import { appendFileSync } from "node:fs";

import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
} from "@/src/domain/visual-profile";
import { CLOUDFLARE_CRAWLER_METADATA } from "@/src/integrations/cloudflare";
import { PERPLEXITY_ENRICHMENT_METADATA } from "@/src/integrations/perplexity";
import { presentonProviderMetadata } from "@/src/integrations/presenton";
import { hashExpectedSlideText } from "@/src/integrations/pptx-content-verifier";
import type {
  ArtifactVerificationOptions,
  CrawlRequest,
  DeckGenerationInput,
  EnrichmentRequest,
  PresentonResult,
  ProviderCallOptions,
  ResumableCrawlProvider,
} from "@/src/integrations/providers";
import { GEMINI_BRIEF_BUILDER_METADATA } from "@/src/server/ai-brief-builder";
import {
  runNextReferenceJob,
  type RunExecutorDependencies,
} from "@/src/server/run-executor";
import {
  GEMINI_SLIDE_PLANNER_METADATA,
  slidePlanSchema,
} from "@/src/server/slide-planner";

const phase = process.env.BESTDECKS_PROCESS_TEST_PHASE;
const callLogPath = process.env.BESTDECKS_PROCESS_TEST_CALL_LOG;
if (phase !== "phase1" && phase !== "phase2") {
  throw new Error("BESTDECKS_PROCESS_TEST_PHASE must be phase1 or phase2.");
}
if (!callLogPath) {
  throw new Error("BESTDECKS_PROCESS_TEST_CALL_LOG is required.");
}
const retainedCallLogPath = callLogPath;

const crawlJobId = "durable-process-crawl-job-1";
const targetUrl = "https://process-target.example.com/";

function recordCall(event: string, details: Record<string, unknown> = {}) {
  appendFileSync(
    retainedCallLogPath,
    `${JSON.stringify({ event, phase, ...details })}\n`,
    { encoding: "utf8", flag: "a", mode: 0o600 },
  );
}

const crawler: ResumableCrawlProvider = {
  name: "cloudflare",
  async startCrawl(_request: CrawlRequest, options?: ProviderCallOptions) {
    recordCall("crawl_start", { jobId: crawlJobId });
    if (phase === "phase2") {
      throw new Error("The restarted worker attempted a duplicate crawl start.");
    }
    options?.onObservability?.({
      usage: [{ metric: "browser_time", unit: "milliseconds", amount: 10 }],
    });
    return crawlJobId;
  },
  async resumeCrawl(
    jobId: string,
    request: CrawlRequest,
    options?: ProviderCallOptions,
  ) {
    if (jobId !== crawlJobId) throw new Error(`Unexpected durable crawl job ID: ${jobId}`);
    recordCall("crawl_resume", { jobId });
    if (phase === "phase1") {
      process.stdout.write(`PHASE1_BLOCKED ${jobId}\n`);
      return new Promise<never>(() => undefined);
    }
    options?.onObservability?.({
      usage: [{ metric: "browser_time", unit: "milliseconds", amount: 20 }],
    });
    return {
      provider: "cloudflare" as const,
      pages: [{
        url: request.websiteUrl,
        title: "Process Target",
        markdown: "# Process Target\nProcess Target publishes a workflow product.",
        statusCode: 200,
      }],
      blockedUrls: [],
      discoveredUrls: [request.websiteUrl],
      rawJobId: jobId,
      status: "completed",
    };
  },
  async crawlSite(request: CrawlRequest, options?: ProviderCallOptions) {
    const jobId = await this.startCrawl(request, options);
    return this.resumeCrawl(jobId, request, options);
  },
};

function buildPlan() {
  const sourceId = "source:process-target";
  const headlines = [
    "Process Target publishes a workflow product",
    "Evidence-backed proposal decks",
    "[Inference] A tailored deck may clarify fit",
    "Book a discovery call",
  ];
  return slidePlanSchema.parse({
    title: "Process Target proposal",
    slides: headlines.map((headline, index) => ({
      slideNumber: index + 1,
      purpose: index === 0 ? "hook" : index === 3 ? "path_forward" : "solution",
      headline,
      headlineClaimId: `claim:slide-${String(index + 1).padStart(2, "0")}-headline`,
      bulletPoints: [],
      bulletClaimIds: [],
      speakerNotes: "",
      suggestImage: false,
    })),
    evidence: {
      sources: [{
        id: sourceId,
        url: targetUrl,
        title: "Process Target",
        retrievedAt: "2026-07-14T00:00:00.000Z",
        provider: "cloudflare",
      }],
      claims: headlines.map((text, index) => {
        const common = {
          id: `claim:slide-${String(index + 1).padStart(2, "0")}-headline`,
          text,
        };
        if (index === 0) {
          return {
            ...common,
            claimClass: "external_fact" as const,
            supportStatus: "source_backed" as const,
            citedSourceIds: [sourceId],
          };
        }
        if (index === 2) {
          return {
            ...common,
            claimClass: "model_inference" as const,
            supportStatus: "model_inference" as const,
            citedSourceIds: [sourceId],
          };
        }
        return {
          ...common,
          claimClass: "seller_claim" as const,
          supportStatus: "seller_supplied" as const,
          citedSourceIds: [],
        };
      }),
    },
  });
}

async function createDependencies(): Promise<RunExecutorDependencies> {
  return {
    crawler,
    enrichmentProvider: {
      name: "perplexity",
      async enrichCompany(request: EnrichmentRequest, options?: ProviderCallOptions) {
        recordCall("enrich");
        options?.onObservability?.({
          usage: [{ metric: "total_tokens", unit: "tokens", amount: 3 }],
        });
        return {
          synthesizedSummary: "[Sourced] Process Target publishes a workflow product.",
          evidence: [{
            title: "Process Target",
            url: request.websiteUrl,
            snippet: "Process Target publishes a workflow product.",
          }],
          confidence: "high" as const,
        };
      },
    },
    sellerBriefBuilder: {
      async buildSellerBrief() {
        return {
          positioningSummary: "Seller creates evidence-backed proposal decks.",
          offerSummary: "Evidence-backed proposal decks.",
          proofPoints: ["Seller-supplied proof"],
          preferredAngles: ["Source-linked claims"],
        };
      },
    },
    companyBriefBuilder: {
      async buildCompanyBrief(
        value: { target: { websiteUrl: string; companyName?: string } },
        options?: ProviderCallOptions,
      ) {
        recordCall("company_brief");
        options?.onObservability?.({
          usage: [{ metric: "total_tokens", unit: "tokens", amount: 5 }],
        });
        return {
          websiteUrl: value.target.websiteUrl,
          companyName: value.target.companyName,
          industry: "B2B software",
          offer: "Workflow product",
          painPoints: [],
          proofPoints: ["Process Target publishes a workflow product"],
          pitchAngles: ["Clarify fit"],
          sourceUrls: [value.target.websiteUrl],
        };
      },
    },
    slidePlanner: {
      async planSlides(_value: unknown, options?: { onObservability?: ProviderCallOptions["onObservability"] }) {
        recordCall("plan");
        options?.onObservability?.({
          usage: [{ metric: "total_tokens", unit: "tokens", amount: 7 }],
        });
        return buildPlan();
      },
    },
    async targetUrlValidator() {},
    deckProvider: {
      name: "presenton",
      async createDeck(
        _value: DeckGenerationInput,
        _imageUrls?: string[],
        options?: ProviderCallOptions,
      ) {
        recordCall("render");
        options?.onObservability?.({
          usage: [{ metric: "credits_consumed", unit: "credits", amount: 1 }],
        });
        return {
          presentationId: "process-presentation-1",
          exportUrl: "https://presenton.example/exports/process-presentation-1.pptx",
          usage: { unit: "credits" as const, amount: 1 },
        };
      },
      async verifyArtifact(
        _result: PresentonResult,
        options: ArtifactVerificationOptions,
      ) {
        recordCall("verify");
        return {
          url: "https://presenton.example/exports/process-presentation-1.pptx",
          sha256: "d".repeat(64),
          byteLength: 2_048,
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          verifiedAt: "2026-07-14T00:00:01.000Z",
          contentVerification: {
            method: "pptx_ooxml_rich_static_v2" as const,
            sha256: hashExpectedSlideText(options.expectedSlides),
            slideCount: options.expectedSlides.length,
          },
          visualProfile: {
            id: RICH_STATIC_VISUAL_PROFILE.profileId,
            manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
            templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
            templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
            themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
            layoutIds: options.layoutIds,
            measuredRichness: {
              slideCount: options.layoutIds.length,
              vectorShapeCount: options.layoutIds.length * 2,
              styledTextRunCount: options.layoutIds.length,
              slidesWithBackground: options.layoutIds.length,
              slidesWithVectorAccents: options.layoutIds.length,
              distinctLayoutSignatures: options.layoutIds.length > 1 ? 2 : 1,
              distinctPaletteColors: 3,
            },
          },
        };
      },
    },
    configurationNames: [
      "cloudflare.account_id",
      "cloudflare.api_token",
      "perplexity.api_key",
      "gemini.api_key",
      "presenton.base_url",
    ],
    providerProvenance: [
      {
        stage: "crawling",
        providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
        modelId: null,
        contractVersion: CLOUDFLARE_CRAWLER_METADATA.contractVersion,
      },
      {
        stage: "enriching",
        providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
        modelId: PERPLEXITY_ENRICHMENT_METADATA.defaultModelId,
        contractVersion: PERPLEXITY_ENRICHMENT_METADATA.contractVersion,
      },
      {
        stage: "enriching",
        providerId: GEMINI_BRIEF_BUILDER_METADATA.providerId,
        modelId: GEMINI_BRIEF_BUILDER_METADATA.defaultModelId,
        contractVersion: GEMINI_BRIEF_BUILDER_METADATA.contractVersion,
      },
      {
        stage: "planning",
        providerId: GEMINI_SLIDE_PLANNER_METADATA.providerId,
        modelId: GEMINI_SLIDE_PLANNER_METADATA.defaultModelId,
        contractVersion: GEMINI_SLIDE_PLANNER_METADATA.contractVersion,
      },
      {
        stage: "rendering",
        providerId: presentonProviderMetadata.providerId,
        modelId: presentonProviderMetadata.modelId,
        contractVersion: presentonProviderMetadata.contractVersion,
      },
    ],
    commitSha: "abcdef1234567",
  };
}

const outcome = await runNextReferenceJob({
  leaseOwner: `process-fixture-${phase}`,
  dependencyFactory: createDependencies,
  leaseDurationMs: 300,
  leaseHeartbeatIntervalMs: 75,
});
if (phase === "phase1") {
  throw new Error(`Phase 1 unexpectedly returned with outcome ${outcome}.`);
}
if (outcome !== "completed") {
  throw new Error(`The restarted worker did not complete the run (outcome=${outcome}).`);
}
process.stdout.write("PHASE2_DONE\n");
