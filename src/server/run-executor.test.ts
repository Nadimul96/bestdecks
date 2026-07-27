import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import { parseRunReceipt } from "@/src/domain/run-receipt";
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
  DeckCreateOptions,
  PresentonResult,
  ProviderCallOptions,
} from "@/src/integrations/providers";
import { GEMINI_BRIEF_BUILDER_METADATA } from "@/src/server/ai-brief-builder";
import {
  GEMINI_SLIDE_PLANNER_METADATA,
  slidePlanSchema,
  type SlidePlan,
} from "@/src/server/slide-planner";

process.env.APP_SECRETS_KEY = "4".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const {
  createRun,
  getRun,
  getRunExecutionContext,
} = await import("./repository");
const {
  claimRunJob,
  completeRunCheckpoint,
  completeRunJob,
  getRunJob,
  releaseRunJobForRetry,
  requestRunCancellation,
  listRunAttempts,
  listRunCheckpoints,
} = await import("./run-queue");
const { getDb } = await import("./db");
const { executeClaimedRun, runNextReferenceJob } = await import("./run-executor");

let sequence = 0;

function userId(label: string) {
  sequence += 1;
  return `${label}-${sequence}`;
}

function input(targets = [
  { websiteUrl: "https://target.example.com", companyName: "Target" },
]) {
  return {
    sellerContext: {
      websiteUrl: "https://seller.example.com",
      companyName: "Seller",
      offerSummary: "Evidence-backed proposal decks.",
      services: ["Research", "Presentation design"],
      differentiators: ["Source-linked claims"],
      targetCustomer: "B2B founders",
      desiredOutcome: "Book a discovery call",
      proofPoints: ["Seller-supplied proof"],
      constraints: [],
    },
    questionnaire: {
      archetype: "cold_outreach" as const,
      audience: "Founder",
      objective: "Book a discovery call",
      callToAction: "Book a discovery call",
      outputFormat: "pptx" as const,
      desiredCardCount: 4,
      tone: "consultative" as const,
      visualStyle: "premium_modern" as const,
      imagePolicy: "never" as const,
      mustInclude: [],
      mustAvoid: [],
      visualContentTypes: [],
      visualDensity: "rich" as const,
      optionalReview: false,
      allowUserApprovedCrawlException: false,
    },
    targets,
  };
}

function plan(unsupported = false): SlidePlan {
  const sourceId = "source:target";
  const headlines = [
    unsupported ? "[Unsupported] Target uses manual reporting" : "Target publishes a workflow product",
    "Evidence-backed proposal decks.",
    "[Inference] A tailored deck may clarify fit",
    "Book a discovery call",
  ];
  return slidePlanSchema.parse({
    title: "Target proposal",
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
        url: "https://target.example.com/",
        title: "Target",
        retrievedAt: "2026-07-13T20:00:00.000Z",
        provider: "cloudflare",
      }],
      claims: headlines.map((text, index) => {
        const id = `claim:slide-${String(index + 1).padStart(2, "0")}-headline`;
        if (index === 0) {
          return unsupported
            ? {
                id,
                text,
                claimClass: "external_fact" as const,
                supportStatus: "unsupported" as const,
                citedSourceIds: [],
              }
            : {
                id,
                text,
                claimClass: "external_fact" as const,
                supportStatus: "source_backed" as const,
                citedSourceIds: [sourceId],
              };
        }
        if (index === 2) {
          return {
            id,
            text,
            claimClass: "model_inference" as const,
            supportStatus: "model_inference" as const,
            citedSourceIds: [sourceId],
          };
        }
        return {
          id,
          text,
          claimClass: "seller_claim" as const,
          supportStatus: "seller_supplied" as const,
          citedSourceIds: [],
        };
      }),
    },
  });
}

function dependencies(options: {
  unsupported?: boolean;
  failHost?: string;
  crawlCalls?: { count: number };
  crawlFailures?: { remaining: number };
  crawlResumeCalls?: { count: number };
  crawlResumeFailures?: { remaining: number };
  crawlOperation?: (signal: AbortSignal | undefined) => Promise<void>;
  sellerBriefFailures?: { remaining: number };
  enrichmentCalls?: { count: number };
  enrichmentFailures?: { remaining: number };
  companyBriefCalls?: { count: number };
  companyBriefFailures?: { remaining: number };
  planningCalls?: { count: number };
  planningFailures?: { remaining: number };
  renderCalls?: { count: number };
  renderFailures?: { remaining: number };
  fatalRenderHost?: string;
  retryableRenderHost?: string;
  renderOperation?: (
    websiteUrl: string,
    signal: AbortSignal | undefined,
  ) => Promise<void>;
  verificationCalls?: { count: number };
  verificationFailures?: { remaining: number };
  verificationFailHost?: string;
  verificationByteLength?: number;
  verificationContentMismatch?: boolean;
  now?: () => Date;
} = {}) {
  return async () => ({
    crawler: {
      name: "cloudflare" as const,
      async startCrawl(_request: unknown, callOptions?: ProviderCallOptions) {
        if (options.crawlCalls) options.crawlCalls.count += 1;
        if (options.crawlFailures && options.crawlFailures.remaining > 0) {
          options.crawlFailures.remaining -= 1;
          throw Object.assign(new Error("redacted indeterminate crawl failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        callOptions?.onObservability?.({
          usage: [{ metric: "browser_time", unit: "milliseconds", amount: 100 }],
        });
        return "crawl-job-1";
      },
      async resumeCrawl(
        jobId: string,
        request: { websiteUrl: string },
        callOptions?: ProviderCallOptions,
      ) {
        assert.equal(jobId, "crawl-job-1");
        if (options.crawlResumeCalls) options.crawlResumeCalls.count += 1;
        if (options.crawlOperation) await options.crawlOperation(callOptions?.signal);
        if (options.crawlResumeFailures && options.crawlResumeFailures.remaining > 0) {
          options.crawlResumeFailures.remaining -= 1;
          throw Object.assign(new Error("redacted crawl resume failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        if (options.failHost && new URL(request.websiteUrl).hostname === options.failHost) {
          throw Object.assign(new Error("redacted target failure"), {
            code: "client_request",
            retryable: false,
          });
        }
        callOptions?.onObservability?.({
          usage: [{ metric: "browser_time", unit: "milliseconds", amount: 200 }],
        });
        return {
          provider: "cloudflare" as const,
          pages: [{
            url: request.websiteUrl,
            title: "Target",
            markdown: "# Target\nTarget publishes a workflow product.",
            statusCode: 200,
          }],
          blockedUrls: [],
          discoveredUrls: [request.websiteUrl],
          rawJobId: "crawl-job-1",
          status: "completed",
        };
      },
      async crawlSite(
        request: { websiteUrl: string },
        callOptions?: ProviderCallOptions,
      ) {
        const jobId = await this.startCrawl(request, callOptions);
        return this.resumeCrawl(jobId, request, callOptions);
      },
    },
    enrichmentProvider: {
      name: "perplexity" as const,
      async enrichCompany(
        request: { websiteUrl: string },
        callOptions?: ProviderCallOptions,
      ) {
        if (options.enrichmentCalls) options.enrichmentCalls.count += 1;
        if (options.enrichmentFailures && options.enrichmentFailures.remaining > 0) {
          options.enrichmentFailures.remaining -= 1;
          throw Object.assign(new Error("redacted transient failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        callOptions?.onObservability?.({
          usage: [
            { metric: "input_tokens", unit: "tokens", amount: 10 },
            { metric: "output_tokens", unit: "tokens", amount: 5 },
            { metric: "total_tokens", unit: "tokens", amount: 15 },
          ],
        });
        return {
          synthesizedSummary: "[Sourced] Target publishes a workflow product.",
          evidence: [{
            title: "Target",
            url: request.websiteUrl,
            snippet: "Target publishes a workflow product.",
          }],
          confidence: "high" as const,
        };
      },
    },
    sellerBriefBuilder: {
      async buildSellerBrief() {
        if (options.sellerBriefFailures && options.sellerBriefFailures.remaining > 0) {
          options.sellerBriefFailures.remaining -= 1;
          throw Object.assign(new Error("redacted transient local failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
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
        callOptions?: ProviderCallOptions,
      ) {
        if (options.companyBriefCalls) options.companyBriefCalls.count += 1;
        if (options.companyBriefFailures && options.companyBriefFailures.remaining > 0) {
          options.companyBriefFailures.remaining -= 1;
          throw Object.assign(new Error("redacted indeterminate company brief failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        callOptions?.onObservability?.({
          usage: [
            { metric: "input_tokens", unit: "tokens", amount: 20 },
            { metric: "output_tokens", unit: "tokens", amount: 10 },
            { metric: "total_tokens", unit: "tokens", amount: 30 },
          ],
        });
        return {
          websiteUrl: value.target.websiteUrl,
          companyName: value.target.companyName,
          industry: "B2B software",
          offer: "Workflow product",
          painPoints: [],
          proofPoints: ["Target publishes a workflow product"],
          pitchAngles: ["Clarify fit"],
          sourceUrls: [value.target.websiteUrl],
        };
      },
    },
    slidePlanner: {
      async planSlides(_value: unknown, callOptions?: ProviderCallOptions) {
        if (options.planningCalls) options.planningCalls.count += 1;
        if (options.planningFailures && options.planningFailures.remaining > 0) {
          options.planningFailures.remaining -= 1;
          throw Object.assign(new Error("redacted indeterminate planning failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        callOptions?.onObservability?.({
          usage: [
            { metric: "input_tokens", unit: "tokens", amount: 30 },
            { metric: "output_tokens", unit: "tokens", amount: 15 },
            { metric: "total_tokens", unit: "tokens", amount: 45 },
          ],
        });
        return plan(options.unsupported);
      },
    },
    async targetUrlValidator() {},
    deckProvider: {
      name: "presenton" as const,
      async createDeck(
        value: { companyBrief: { websiteUrl: string } },
        _imageUrls?: string[],
        callOptions?: DeckCreateOptions,
      ) {
        if (options.renderCalls) options.renderCalls.count += 1;
        const renderHost = new URL(value.companyBrief.websiteUrl).hostname;
        if (options.renderOperation) {
          await options.renderOperation(value.companyBrief.websiteUrl, callOptions?.signal);
        }
        if (options.fatalRenderHost === renderHost) {
          throw Object.assign(new Error("redacted renderer authentication failure"), {
            code: "authentication",
            retryable: false,
          });
        }
        if (options.retryableRenderHost === renderHost) {
          throw Object.assign(new Error("redacted transient renderer failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        if (options.renderFailures && options.renderFailures.remaining > 0) {
          options.renderFailures.remaining -= 1;
          throw Object.assign(new Error("redacted indeterminate renderer failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        const presentationId = options.verificationFailHost
          && new URL(value.companyBrief.websiteUrl).hostname === options.verificationFailHost
          ? "verification-failure-target"
          : "presentation-1";
        callOptions?.onObservability?.({
          usage: [{ metric: "credits_consumed", unit: "credits", amount: 1 }],
        });
        return {
          presentationId,
          exportUrl: `https://presenton.example/exports/${presentationId}.pptx`,
          usage: { unit: "credits" as const, amount: 1 },
        };
      },
      async verifyArtifact(
        result: PresentonResult,
        verificationOptions: ArtifactVerificationOptions,
      ) {
        if (options.verificationCalls) options.verificationCalls.count += 1;
        if (result.presentationId === "verification-failure-target") {
          throw Object.assign(new Error("redacted persistent verification failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        if (options.verificationFailures && options.verificationFailures.remaining > 0) {
          options.verificationFailures.remaining -= 1;
          throw Object.assign(new Error("redacted transient verification failure"), {
            code: "provider_unavailable",
            retryable: true,
          });
        }
        return {
          url: "https://presenton.example/exports/presentation-1.pptx",
          sha256: "a".repeat(64),
          byteLength: options.verificationByteLength ?? 1_024,
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          verifiedAt: "2026-07-13T20:00:02.000Z",
          contentVerification: {
            method: "pptx_ooxml_rich_static_v2" as const,
            sha256: options.verificationContentMismatch
              ? "c".repeat(64)
              : hashExpectedSlideText(verificationOptions.expectedSlides),
            slideCount: verificationOptions.expectedSlides.length,
          },
          visualProfile: {
            id: RICH_STATIC_VISUAL_PROFILE.profileId,
            manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
            templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
            templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
            themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
            layoutIds: verificationOptions.layoutIds,
            measuredRichness: {
              slideCount: verificationOptions.layoutIds.length,
              vectorShapeCount: verificationOptions.layoutIds.length * 2,
              styledTextRunCount: verificationOptions.layoutIds.length,
              slidesWithBackground: verificationOptions.layoutIds.length,
              slidesWithVectorAccents: verificationOptions.layoutIds.length,
              distinctLayoutSignatures: verificationOptions.layoutIds.length > 1 ? 2 : 1,
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
        stage: "crawling" as const,
        providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
        modelId: null,
        contractVersion: CLOUDFLARE_CRAWLER_METADATA.contractVersion,
      },
      {
        stage: "enriching" as const,
        providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
        modelId: PERPLEXITY_ENRICHMENT_METADATA.defaultModelId,
        contractVersion: PERPLEXITY_ENRICHMENT_METADATA.contractVersion,
      },
      {
        stage: "enriching" as const,
        providerId: GEMINI_BRIEF_BUILDER_METADATA.providerId,
        modelId: GEMINI_BRIEF_BUILDER_METADATA.defaultModelId,
        contractVersion: GEMINI_BRIEF_BUILDER_METADATA.contractVersion,
      },
      {
        stage: "planning" as const,
        providerId: GEMINI_SLIDE_PLANNER_METADATA.providerId,
        modelId: GEMINI_SLIDE_PLANNER_METADATA.defaultModelId,
        contractVersion: GEMINI_SLIDE_PLANNER_METADATA.contractVersion,
      },
      {
        stage: "rendering" as const,
        providerId: presentonProviderMetadata.providerId,
        modelId: presentonProviderMetadata.modelId,
        contractVersion: presentonProviderMetadata.contractVersion,
      },
    ],
    commitSha: "abcdef1234567",
    ...(options.now ? { now: options.now } : {}),
  });
}

function receiptFromRun(run: NonNullable<Awaited<ReturnType<typeof getRun>>>) {
  const artifact = (run.artifacts as Array<{
    artifact_type: string;
    artifact_json: unknown;
  }>).find(({ artifact_type }) => artifact_type === "run_receipt");
  assert.ok(artifact);
  return parseRunReceipt(artifact.artifact_json);
}

function assertRecoveredDeliveredTarget(
  receipt: ReturnType<typeof parseRunReceipt>,
  targetId: string,
) {
  const target = receipt.targets.find((candidate) => candidate.targetId === targetId);
  assert.ok(target);
  assert.equal(target.outcome, "delivered");
  assert.equal(target.artifact?.sha256, "a".repeat(64));
  assert.equal(target.evidenceCoverage?.ratio, 1);
  assert.ok(target.claimLedger);
  assert.equal(target.claimLedger.claims.length, 4);
  assert.ok(target.claimLedger.sources.every(
    ({ url }) => new URL(url).pathname === "/_redacted/source",
  ));
  assert.equal(receipt.commitSha, "abcdef1234567");
  assert.deepEqual(
    receipt.providers.map(({ providerId }) => providerId).sort(),
    [
      CLOUDFLARE_CRAWLER_METADATA.providerId,
      PERPLEXITY_ENRICHMENT_METADATA.providerId,
      GEMINI_BRIEF_BUILDER_METADATA.providerId,
      GEMINI_SLIDE_PLANNER_METADATA.providerId,
      presentonProviderMetadata.providerId,
    ].sort(),
  );
}

async function executeRetryPair(
  runId: string,
  context: NonNullable<Awaited<ReturnType<typeof getRunExecutionContext>>>,
  dependencyFactory: ReturnType<typeof dependencies>,
  leasePrefix: string,
) {
  const first = await claimRunJob(runId, {
    leaseOwner: `${leasePrefix}-1`,
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(first);
  await assert.rejects(
    executeClaimedRun(first, context, await dependencyFactory()),
    (error: unknown) =>
      error instanceof Error
      && "retryable" in error
      && (error as Error & { retryable: boolean }).retryable,
  );
  const released = await releaseRunJobForRetry(first.lease, { retryDelayMs: 0 });
  assert.equal(released?.exhausted, false);

  const second = await claimRunJob(runId, {
    leaseOwner: `${leasePrefix}-2`,
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(second);
  const receipt = await executeClaimedRun(second, context, await dependencyFactory());
  return { first, second, receipt };
}

function checkpointMetadata(
  checkpoints: Awaited<ReturnType<typeof listRunCheckpoints>>,
  suffix: string,
) {
  const checkpoint = checkpoints.find(({ checkpointKey }) => checkpointKey.endsWith(suffix));
  assert.ok(checkpoint, `missing checkpoint ending in ${suffix}`);
  return checkpoint.metadata as { outcome?: string; errorCode?: string };
}

test("reference worker delivers once and persists a verified receipt atomically", async () => {
  const owner = userId("worker-success");
  const runId = await createRun(input(), owner);
  const renderCalls = { count: 0 };

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "success-worker",
      dependencyFactory: dependencies({ renderCalls }),
    }),
    "completed",
  );
  assert.equal(renderCalls.count, 1);

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "delivered");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "delivered");
  assert.equal(receipt.targets[0]?.artifact?.sha256, "a".repeat(64));
  assert.equal(receipt.targets[0]?.evidenceCoverage?.ratio, 1);
  assert.equal(receipt.evidenceContract.rubricVersion, "exact-visible-claim-provenance-v1");
  assert.equal(receipt.targets[0]?.claimLedger?.claims.length, 4);
  assert.ok(receipt.targets[0]?.claimLedger?.sources.every(
    ({ url }) => new URL(url).pathname === "/_redacted/source",
  ));
  assert.ok(receipt.stageTimings.length >= 5);
  const providers = new Map(receipt.providers.map((provider) => [provider.providerId, provider]));
  assert.ok(receipt.providers.every((provider) =>
    provider.health?.configured === true
    && provider.health.reachable === true
    && provider.health.liveSmokePassed === null
  ));
  assert.deepEqual(providers.get(CLOUDFLARE_CRAWLER_METADATA.providerId)?.usage, [
    { metric: "browser_time", unit: "milliseconds", amount: 300 },
  ]);
  assert.deepEqual(providers.get(PERPLEXITY_ENRICHMENT_METADATA.providerId)?.usage, [
    { metric: "input_tokens", unit: "tokens", amount: 10 },
    { metric: "output_tokens", unit: "tokens", amount: 5 },
    { metric: "total_tokens", unit: "tokens", amount: 15 },
  ]);
  assert.deepEqual(providers.get(GEMINI_BRIEF_BUILDER_METADATA.providerId)?.usage, [
    { metric: "input_tokens", unit: "tokens", amount: 20 },
    { metric: "output_tokens", unit: "tokens", amount: 10 },
    { metric: "total_tokens", unit: "tokens", amount: 30 },
  ]);
  assert.deepEqual(providers.get(GEMINI_SLIDE_PLANNER_METADATA.providerId)?.usage, [
    { metric: "input_tokens", unit: "tokens", amount: 30 },
    { metric: "output_tokens", unit: "tokens", amount: 15 },
    { metric: "total_tokens", unit: "tokens", amount: 45 },
  ]);
  assert.deepEqual(providers.get(presentonProviderMetadata.providerId)?.usage, [
    { metric: "credits_consumed", unit: "credits", amount: 1 },
  ]);
  assert.ok(receipt.providers.every((provider) => provider.cost === undefined));
  const checkpointKeys = (await listRunCheckpoints(runId)).map(
    ({ checkpointKey }) => checkpointKey,
  );
  for (const suffix of [
    ":crawl-dispatch:v1",
    ":crawl-job:v1",
    ":crawl-response:v1",
    ":enrichment-dispatch:v1",
    ":enrichment-response:v1",
    ":company-brief-dispatch:v1",
    ":company-brief-response:v1",
    ":planning-dispatch:v1",
    ":planning-response:v1",
  ]) {
    assert.ok(checkpointKeys.some((checkpointKey) => checkpointKey.endsWith(suffix)));
  }

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "replay-worker",
      dependencyFactory: dependencies({ renderCalls }),
    }),
    "idle",
  );
  assert.equal(renderCalls.count, 1);
});

test("worker refuses to persist an oversized artifact as delivered", async () => {
  const owner = userId("worker-oversized-artifact");
  const runId = await createRun(input(), owner);

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "oversized-artifact-worker",
      dependencyFactory: dependencies({
        verificationByteLength: MAX_DELIVERY_ARTIFACT_BYTES + 1,
      }),
    }),
    "completed",
  );

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.targets[0]?.outcome, "failed");
  assert.equal(receipt.targets[0]?.artifact, undefined);
});

test("worker refuses a readable artifact whose visible text attestation mismatches", async () => {
  const owner = userId("worker-content-mismatch");
  const runId = await createRun(input(), owner);

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "content-mismatch-worker",
      dependencyFactory: dependencies({ verificationContentMismatch: true }),
    }),
    "completed",
  );

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.targets[0]?.outcome, "failed");
  assert.equal(receipt.targets[0]?.artifact, undefined);
});

test("unsupported factual claims block rendering and produce an honest failed receipt", async () => {
  const owner = userId("worker-blocked");
  const runId = await createRun(input(), owner);
  const renderCalls = { count: 0 };

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "blocked-worker",
      dependencyFactory: dependencies({ unsupported: true, renderCalls }),
    }),
    "completed",
  );
  assert.equal(renderCalls.count, 0);

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.targets[0]?.outcome, "blocked");
  assert.equal(receipt.targets[0]?.readiness.evidenceGatePassed, false);
  assert.equal(receipt.targets[0]?.unsupportedFactualClaimIds.length, 1);
});

test("a permanent target failure is isolated and the run completes partially", async () => {
  const owner = userId("worker-partial");
  const runId = await createRun(
    input([
      { websiteUrl: "https://bad.example.com", companyName: "Bad" },
      { websiteUrl: "https://target.example.com", companyName: "Target" },
    ]),
    owner,
  );

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "partial-worker",
      dependencyFactory: dependencies({ failHost: "bad.example.com" }),
    }),
    "completed",
  );
  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "partially_completed");
  const receipt = receiptFromRun(run);
  assert.deepEqual(
    receipt.targets.map(({ outcome }) => outcome),
    ["blocked", "delivered"],
  );
});

test("pre-claimed cancellation is persisted without invoking providers", async () => {
  const owner = userId("worker-cancel");
  const runId = await createRun(input(), owner);
  await requestRunCancellation(runId);
  let factoryCalls = 0;

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "cancel-worker",
      dependencyFactory: async (context) => {
        factoryCalls += 1;
        void context;
        return dependencies()();
      },
    }),
    "completed",
  );
  assert.equal(factoryCalls, 1);
  const run = await getRun(runId, owner);
  assert.equal(run?.status, "cancelled");
  assert.ok(run);
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "cancelled");
  assert.equal(receipt.targets[0]?.errorCode, "run_cancelled");
  assert.equal((await listRunAttempts(runId))[0]?.status, "cancelled");
  assert.equal((await listRunCheckpoints(runId)).length, 0);
});

test("a non-retryable dependency factory failure persists a valid failed receipt", async () => {
  const owner = userId("worker-factory-failure");
  const runId = await createRun(input(), owner);

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "factory-failure-worker",
      dependencyFactory: async () => {
        throw new TypeError("redacted invalid dependency configuration");
      },
    }),
    "completed",
  );

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "failed");
  assert.equal(receipt.providers.length, 0);
  assert.equal(receipt.targets[0]?.outcome, "failed");
  assert.equal(receipt.targets[0]?.errorCode, "terminal_failure");
  assert.equal((await listRunAttempts(runId))[0]?.status, "failed");
});

test("a missing commit SHA fails before the first provider call", async () => {
  const owner = userId("worker-missing-commit");
  const runId = await createRun(input(), owner);
  const crawlCalls = { count: 0 };

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "missing-commit-worker",
      dependencyFactory: async () => ({
        ...(await dependencies({ crawlCalls })()),
        commitSha: null,
      }),
    }),
    "completed",
  );

  assert.equal(crawlCalls.count, 0);
  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  assert.equal(receiptFromRun(run).commitSha, null);
  assert.equal((await listRunCheckpoints(runId)).length, 0);
});

test("a pre-contract checkpoint fails closed without rebinding provider provenance", async () => {
  const owner = userId("worker-pre-contract-checkpoint");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const claim = await claimRunJob(runId, {
    leaseOwner: "pre-contract-checkpoint-worker",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(claim);
  const legacyMetadata = {
    commitSha: "deadbee",
    providerId: "legacy.provider.v0",
  };
  const seeded = await completeRunCheckpoint(claim.lease, {
    checkpointKey: "legacy-provider-work-v1",
    stage: "queued",
    metadata: legacyMetadata,
  });
  assert.ok(seeded);
  const crawlCalls = { count: 0 };

  await assert.rejects(
    executeClaimedRun(claim, context, await dependencies({ crawlCalls })()),
    (error: unknown) => error instanceof Error && error.name === "CheckpointContractError",
  );
  assert.equal(crawlCalls.count, 0);
  const checkpoints = await listRunCheckpoints(runId);
  assert.deepEqual(
    checkpoints.map(({ checkpointKey }) => checkpointKey),
    ["legacy-provider-work-v1"],
  );
  assert.deepEqual(checkpoints[0]?.metadata, legacyMetadata);
  assert.equal(checkpoints[0]?.attemptId, claim.attempt.id);
  assert.equal(
    checkpoints.some(({ checkpointKey }) => checkpointKey === "run-execution-contract-v1"),
    false,
  );
  assert.equal(
    (await completeRunJob(claim.lease, "failed", {
      error: "Pre-contract durable checkpoint requires operator review.",
    }))?.state,
    "failed",
  );
});

test("a final-attempt render dispatch failure preserves its indeterminate outcome", async () => {
  const owner = userId("worker-final-render-dispatch");
  const runId = await createRun(input(), owner);
  const renderCalls = { count: 0 };
  const renderFailures = { remaining: 1 };
  const db = await getDb();
  await db.run("UPDATE run_jobs SET max_attempts = 1 WHERE run_id = ?", [runId]);

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "final-render-dispatch-worker",
      dependencyFactory: dependencies({ renderCalls, renderFailures }),
    }),
    "completed",
  );
  assert.equal(renderCalls.count, 1);

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "failed");
  assert.equal(receipt.targets[0]?.outcome, "failed");
  assert.equal(receipt.targets[0]?.errorCode, "indeterminate_render_outcome");
  const target = await db.execute(
    "SELECT status, last_error FROM run_targets WHERE run_id = ? LIMIT 1",
    [runId],
  ) as unknown as { status: string; last_error: string | null };
  assert.deepEqual(target, {
    status: "failed",
    last_error: "indeterminate_render_outcome",
  });
});

test("a retry resumes from the completed crawl checkpoint without duplicating it", async () => {
  const owner = userId("worker-resume");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const crawlCalls = { count: 0 };
  const renderCalls = { count: 0 };
  const sellerBriefFailures = { remaining: 1 };
  const firstDependencies = await dependencies({
    crawlCalls,
    sellerBriefFailures,
    renderCalls,
  })();

  const first = await claimRunJob(runId, {
    leaseOwner: "resume-worker-1",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(first);
  await assert.rejects(
    executeClaimedRun(first, context, firstDependencies),
    (error: unknown) =>
      error instanceof Error
      && "retryable" in error
      && (error as Error & { retryable: boolean }).retryable,
  );
  const released = await releaseRunJobForRetry(first.lease, { retryDelayMs: 0 });
  assert.equal(released?.exhausted, false);

  const second = await claimRunJob(runId, {
    leaseOwner: "resume-worker-2",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(second);
  await executeClaimedRun(
    second,
    context,
    await dependencies({ crawlCalls, sellerBriefFailures, renderCalls })(),
  );

  assert.equal(crawlCalls.count, 1);
  assert.equal(renderCalls.count, 1);
  assert.deepEqual(
    (await listRunAttempts(runId)).map(({ status }) => status),
    ["released", "completed"],
  );
  const crawlCheckpoints = (await listRunCheckpoints(runId)).filter(
    ({ checkpointKey }) => checkpointKey.includes(":crawl:"),
  );
  assert.equal(crawlCheckpoints.length, 1);
  assert.equal(crawlCheckpoints[0]?.attemptId, first.attempt.id);
});

test("a retry never repeats a Cloudflare crawl after dispatch without response", async () => {
  const owner = userId("worker-crawl-dispatch");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const crawlCalls = { count: 0 };
  const crawlFailures = { remaining: 1 };

  const { receipt } = await executeRetryPair(
    runId,
    context,
    dependencies({ crawlCalls, crawlFailures }),
    "crawl-dispatch-worker",
  );

  assert.equal(crawlCalls.count, 1);
  assert.equal(receipt.targets[0]?.errorCode, "indeterminate_crawl_outcome");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpointMetadata(checkpoints, ":crawl:v1").errorCode,
    "indeterminate_crawl_outcome",
  );
  assert.equal(
    checkpoints.filter(({ checkpointKey }) => checkpointKey.endsWith(":crawl-dispatch:v1")).length,
    1,
  );
  assert.equal(
    checkpoints.filter(({ checkpointKey }) => checkpointKey.endsWith(":crawl-response:v1")).length,
    0,
  );
  assert.equal((await getRun(runId, owner))?.status, "failed");
});

test("a restart resumes Cloudflare polling from the durable job ID without a second POST", async () => {
  const owner = userId("worker-crawl-job-resume");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const crawlCalls = { count: 0 };
  const crawlResumeCalls = { count: 0 };
  const crawlResumeFailures = { remaining: 1 };

  const { first, second, receipt } = await executeRetryPair(
    runId,
    context,
    dependencies({ crawlCalls, crawlResumeCalls, crawlResumeFailures }),
    "crawl-job-resume-worker",
  );

  assert.equal(crawlCalls.count, 1, "the paid crawl start must not be repeated");
  assert.equal(crawlResumeCalls.count, 2, "restart should repeat only safe poll/fetch work");
  assert.equal(receipt.terminalState, "delivered");
  const checkpoints = await listRunCheckpoints(runId);
  const jobCheckpoint = checkpoints.find(
    ({ checkpointKey }) => checkpointKey.endsWith(":crawl-job:v1"),
  );
  const responseCheckpoint = checkpoints.find(
    ({ checkpointKey }) => checkpointKey.endsWith(":crawl-response:v1"),
  );
  assert.equal(jobCheckpoint?.attemptId, first.attempt.id);
  assert.equal(responseCheckpoint?.attemptId, second.attempt.id);
  assert.equal(
    (jobCheckpoint?.metadata as { jobId?: string } | undefined)?.jobId,
    "crawl-job-1",
  );
});

test("a retry never repeats Perplexity enrichment after dispatch without response", async () => {
  const owner = userId("worker-enrichment-dispatch");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const enrichmentCalls = { count: 0 };
  const enrichmentFailures = { remaining: 1 };
  const companyBriefCalls = { count: 0 };

  const { receipt } = await executeRetryPair(
    runId,
    context,
    dependencies({ enrichmentCalls, enrichmentFailures, companyBriefCalls }),
    "enrichment-dispatch-worker",
  );

  assert.equal(enrichmentCalls.count, 1);
  assert.equal(companyBriefCalls.count, 0);
  assert.equal(receipt.targets[0]?.errorCode, "indeterminate_enrichment_outcome");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpointMetadata(checkpoints, ":enrichment:v1").errorCode,
    "indeterminate_enrichment_outcome",
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":enrichment-dispatch:v1"),
    ).length,
    1,
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":enrichment-response:v1"),
    ).length,
    0,
  );
});

test("a retry resumes Perplexity response but never repeats Gemini brief dispatch", async () => {
  const owner = userId("worker-company-brief-dispatch");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const enrichmentCalls = { count: 0 };
  const companyBriefCalls = { count: 0 };
  const companyBriefFailures = { remaining: 1 };

  const { receipt } = await executeRetryPair(
    runId,
    context,
    dependencies({ enrichmentCalls, companyBriefCalls, companyBriefFailures }),
    "company-brief-dispatch-worker",
  );

  assert.equal(enrichmentCalls.count, 1, "the durable Perplexity response must be reused");
  assert.equal(companyBriefCalls.count, 1);
  assert.equal(receipt.targets[0]?.errorCode, "indeterminate_company_brief_outcome");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpointMetadata(checkpoints, ":enrichment:v1").errorCode,
    "indeterminate_company_brief_outcome",
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":enrichment-response:v1"),
    ).length,
    1,
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":company-brief-dispatch:v1"),
    ).length,
    1,
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":company-brief-response:v1"),
    ).length,
    0,
  );
});

test("a retry never repeats Gemini planning after dispatch without response", async () => {
  const owner = userId("worker-planning-dispatch");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const planningCalls = { count: 0 };
  const planningFailures = { remaining: 1 };
  const renderCalls = { count: 0 };

  const { receipt } = await executeRetryPair(
    runId,
    context,
    dependencies({ planningCalls, planningFailures, renderCalls }),
    "planning-dispatch-worker",
  );

  assert.equal(planningCalls.count, 1);
  assert.equal(renderCalls.count, 0);
  assert.equal(receipt.targets[0]?.errorCode, "indeterminate_planning_outcome");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpointMetadata(checkpoints, ":planning:v1").errorCode,
    "indeterminate_planning_outcome",
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":planning-dispatch:v1"),
    ).length,
    1,
  );
  assert.equal(
    checkpoints.filter(
      ({ checkpointKey }) => checkpointKey.endsWith(":planning-response:v1"),
    ).length,
    0,
  );
});

test("a retry never repeats an external render after dispatch without completion", async () => {
  const owner = userId("worker-render-dispatch");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const renderCalls = { count: 0 };
  const renderFailures = { remaining: 1 };

  const first = await claimRunJob(runId, {
    leaseOwner: "render-dispatch-worker-1",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(first);
  await assert.rejects(
    executeClaimedRun(
      first,
      context,
      await dependencies({ renderCalls, renderFailures })(),
    ),
    (error: unknown) =>
      error instanceof Error
      && "retryable" in error
      && (error as Error & { retryable: boolean }).retryable,
  );
  assert.equal(renderCalls.count, 1);
  const released = await releaseRunJobForRetry(first.lease, { retryDelayMs: 0 });
  assert.equal(released?.exhausted, false);

  const second = await claimRunJob(runId, {
    leaseOwner: "render-dispatch-worker-2",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(second);
  await executeClaimedRun(
    second,
    context,
    await dependencies({ renderCalls, renderFailures })(),
  );

  assert.equal(renderCalls.count, 1, "the worker must not repeat an indeterminate side effect");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpoints.filter(({ checkpointKey }) => checkpointKey.includes(":render-dispatch:")).length,
    1,
  );
  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "failed");
  assert.equal(receiptFromRun(run).targets[0]?.errorCode, "indeterminate_render_outcome");
});

test("a retry resumes artifact verification from a durable renderer response", async () => {
  const owner = userId("worker-render-response");
  const runId = await createRun(input(), owner);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const renderCalls = { count: 0 };
  const verificationCalls = { count: 0 };
  const verificationFailures = { remaining: 1 };

  const first = await claimRunJob(runId, {
    leaseOwner: "render-response-worker-1",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(first);
  await assert.rejects(
    executeClaimedRun(
      first,
      context,
      await dependencies({ renderCalls, verificationCalls, verificationFailures })(),
    ),
    (error: unknown) =>
      error instanceof Error
      && "retryable" in error
      && (error as Error & { retryable: boolean }).retryable,
  );
  const released = await releaseRunJobForRetry(first.lease, { retryDelayMs: 0 });
  assert.equal(released?.exhausted, false);

  const second = await claimRunJob(runId, {
    leaseOwner: "render-response-worker-2",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(second);
  await executeClaimedRun(
    second,
    context,
    await dependencies({ renderCalls, verificationCalls, verificationFailures })(),
  );

  assert.equal(renderCalls.count, 1);
  assert.equal(verificationCalls.count, 2);
  assert.equal((await getRun(runId, owner))?.status, "delivered");
  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(
    checkpoints.filter(({ checkpointKey }) => checkpointKey.includes(":render-response:")).length,
    1,
  );
});

test("final verification exhaustion preserves an earlier verified target", async () => {
  const owner = userId("worker-partial-verification-exhaustion");
  const runId = await createRun(
    input([
      { websiteUrl: "https://delivered.example.com", companyName: "Delivered" },
      { websiteUrl: "https://unverifiable.example.com", companyName: "Unverifiable" },
    ]),
    owner,
  );
  await (await getDb()).run("UPDATE run_jobs SET max_attempts = 2 WHERE run_id = ?", [runId]);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const dependencyFactory = dependencies({
    verificationFailHost: "unverifiable.example.com",
  });

  const first = await claimRunJob(runId, {
    leaseOwner: "partial-verification-worker-1",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(first);
  await assert.rejects(
    executeClaimedRun(first, context, await dependencyFactory()),
    (error: unknown) =>
      error instanceof Error
      && "retryable" in error
      && (error as Error & { retryable: boolean }).retryable,
  );
  assert.equal((await releaseRunJobForRetry(first.lease, { retryDelayMs: 0 }))?.exhausted, false);

  const second = await claimRunJob(runId, {
    leaseOwner: "partial-verification-worker-2",
    leaseDurationMs: 15 * 60 * 1_000,
  });
  assert.ok(second);
  const receipt = await executeClaimedRun(second, context, await dependencyFactory());

  assert.equal(receipt.terminalState, "partially_completed");
  assert.deepEqual(receipt.targets.map(({ outcome }) => outcome), ["delivered", "failed"]);
  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "partially_completed");
  assert.deepEqual(
    run.targets.map(({ status }) => status),
    ["delivered", "failed"],
  );
});

test("fatal renderer authentication preserves an earlier verified target and receipt", async () => {
  const owner = userId("worker-partial-render-auth");
  const runId = await createRun(
    input([
      { websiteUrl: "https://delivered.example.com", companyName: "Delivered" },
      { websiteUrl: "https://auth-failure.example.com", companyName: "Auth Failure" },
    ]),
    owner,
  );
  const context = await getRunExecutionContext(runId);
  assert.ok(context);

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "partial-render-auth-worker",
      dependencyFactory: dependencies({ fatalRenderHost: "auth-failure.example.com" }),
    }),
    "completed",
  );

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "partially_completed");
  assert.deepEqual(run.targets.map(({ status }) => status), ["delivered", "failed"]);
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "partially_completed");
  assert.deepEqual(receipt.targets.map(({ outcome }) => outcome), ["delivered", "failed"]);
  assertRecoveredDeliveredTarget(receipt, context.targets[0]!.id);
});

test("final lease exhaustion preserves an earlier verified target and receipt", async () => {
  const owner = userId("worker-partial-lease-exhaustion");
  const runId = await createRun(
    input([
      { websiteUrl: "https://delivered.example.com", companyName: "Delivered" },
      { websiteUrl: "https://stalled.example.com", companyName: "Stalled" },
    ]),
    owner,
  );
  const db = await getDb();
  await db.run("UPDATE run_jobs SET max_attempts = 1 WHERE run_id = ?", [runId]);
  const context = await getRunExecutionContext(runId);
  assert.ok(context);
  const claimTime = new Date();
  const claim = await claimRunJob(runId, {
    leaseOwner: "partial-lease-exhaustion-worker",
    leaseDurationMs: 60,
    now: claimTime,
  });
  assert.ok(claim);

  let releaseStalledRender!: () => void;
  const stalledRenderStarted = new Promise<void>((resolve) => {
    releaseStalledRender = resolve;
  });
  const execution = executeClaimedRun(
    claim,
    context,
    await dependencies({
      now: () => claimTime,
      renderOperation: async (websiteUrl, signal) => {
        if (new URL(websiteUrl).hostname !== "stalled.example.com") return;
        releaseStalledRender();
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    })(),
    { leaseDurationMs: 60, leaseHeartbeatIntervalMs: 10 },
  );
  let executionError: unknown;
  const executionSettled = execution.then(
    () => undefined,
    (error: unknown) => {
      executionError = error;
    },
  );
  await stalledRenderStarted;

  const beforeExpiry = await db.executeAll(
    "SELECT status FROM run_targets WHERE run_id = ? ORDER BY target_ordinal ASC",
    [runId],
  ) as unknown as Array<{ status: string }>;
  assert.deepEqual(beforeExpiry.map(({ status }) => status), ["delivered", "rendering"]);
  assert.equal(
    await claimRunJob(runId, {
      leaseOwner: "recovery-after-partial-exhaustion",
      leaseDurationMs: 60,
      now: new Date(Date.parse(claim.attempt.leaseExpiresAt) + 1),
    }),
    null,
  );
  await executionSettled;
  assert.ok(executionError instanceof Error);
  assert.equal(executionError.name, "LeaseLostError");

  const job = await getRunJob(runId);
  assert.equal(job?.state, "partially_completed");
  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "partially_completed");
  assert.deepEqual(run.targets.map(({ status }) => status), ["delivered", "failed"]);
  const receipt = receiptFromRun(run);
  assert.equal(receipt.terminalState, "partially_completed");
  assert.deepEqual(receipt.targets.map(({ outcome }) => outcome), ["delivered", "failed"]);
  assertRecoveredDeliveredTarget(receipt, context.targets[0]!.id);
  const attempts = await listRunAttempts(runId);
  assert.equal(attempts[0]?.status, "expired");
  assert.equal(attempts[0]?.finalState, "partially_completed");
});

test("a provider call longer than its lease interval is kept alive by periodic heartbeats", async () => {
  const owner = userId("worker-long-provider-call");
  const runId = await createRun(input(), owner);
  const delayMs = 450;
  const startedAt = Date.now();

  const result = await runNextReferenceJob({
    leaseOwner: "long-provider-worker",
    leaseDurationMs: 180,
    leaseHeartbeatIntervalMs: 30,
    dependencyFactory: dependencies({
      crawlOperation: async (signal) => {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, delayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(signal.reason);
          }, { once: true });
        });
      },
    }),
  });

  assert.equal(result, "completed");
  assert.ok(Date.now() - startedAt >= delayMs);
  assert.equal((await getRun(runId, owner))?.status, "delivered");
  const attempt = (await listRunAttempts(runId))[0];
  assert.ok(attempt);
  assert.ok(new Date(attempt.heartbeatAt).getTime() > new Date(attempt.startedAt).getTime());
});

test("cancellation aborts an in-flight provider call and persists cancellation", async () => {
  const owner = userId("worker-inflight-cancel");
  const runId = await createRun(input(), owner);
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let abortObserved = false;

  const worker = runNextReferenceJob({
    leaseOwner: "inflight-cancel-worker",
    leaseDurationMs: 180,
    leaseHeartbeatIntervalMs: 20,
    dependencyFactory: dependencies({
      crawlOperation: (signal) => new Promise<void>((_resolve, reject) => {
        notifyStarted();
        signal?.addEventListener("abort", () => {
          abortObserved = true;
          reject(signal.reason);
        }, { once: true });
      }),
    }),
  });

  await started;
  await requestRunCancellation(runId);
  assert.equal(await worker, "completed");
  assert.equal(abortObserved, true);
  assert.equal((await getRun(runId, owner))?.status, "cancelled");
  assert.equal((await listRunAttempts(runId))[0]?.status, "cancelled");
  assert.equal(
    (await listRunCheckpoints(runId)).some(
      ({ checkpointKey }) => checkpointKey.endsWith(":crawl-response:v1"),
    ),
    false,
  );
});

test("cancellation immediately before response checkpoint persistence completes as cancelled", async () => {
  const owner = userId("worker-pre-checkpoint-cancel");
  const runId = await createRun(input(), owner);
  let cancellationRequested = false;

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "pre-checkpoint-cancel-worker",
      dependencyFactory: dependencies({
        crawlOperation: async () => {
          await requestRunCancellation(runId);
          cancellationRequested = true;
        },
      }),
    }),
    "completed",
  );
  assert.equal(cancellationRequested, true);

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "cancelled");
  assert.equal(receiptFromRun(run).terminalState, "cancelled");
  assert.equal((await listRunAttempts(runId))[0]?.status, "cancelled");
  const checkpointKeys = (await listRunCheckpoints(runId)).map(
    ({ checkpointKey }) => checkpointKey,
  );
  assert.ok(checkpointKeys.some((key) => key.endsWith(":crawl-dispatch:v1")));
  assert.ok(checkpointKeys.some((key) => key.endsWith(":crawl-job:v1")));
  assert.equal(checkpointKeys.some((key) => key.endsWith(":crawl-response:v1")), false);
});

test("the worker rejects plaintext HTTP even when the crawl-failure exception is enabled", async () => {
  const owner = userId("worker-http-policy");
  const httpInput = input([{ websiteUrl: "http://public.example.com", companyName: "Target" }]);
  httpInput.questionnaire.allowUserApprovedCrawlException = true;
  const runId = await createRun(httpInput, owner);
  const crawlCalls = { count: 0 };

  assert.equal(
    await runNextReferenceJob({
      leaseOwner: "http-policy-worker",
      dependencyFactory: dependencies({ crawlCalls }),
    }),
    "completed",
  );
  assert.equal(crawlCalls.count, 0);
  assert.equal((await getRun(runId, owner))?.status, "failed");
});

test("lost lease ownership aborts an in-flight provider call and returns lost", async () => {
  const owner = userId("worker-inflight-lease-loss");
  const runId = await createRun(input(), owner);
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let abortObserved = false;

  const worker = runNextReferenceJob({
    leaseOwner: "lease-loss-worker",
    leaseDurationMs: 180,
    leaseHeartbeatIntervalMs: 20,
    dependencyFactory: dependencies({
      crawlOperation: (signal) => new Promise<void>((_resolve, reject) => {
        notifyStarted();
        signal?.addEventListener("abort", () => {
          abortObserved = true;
          reject(signal.reason);
        }, { once: true });
      }),
    }),
  });

  await started;
  await (await getDb()).run(
    "UPDATE run_jobs SET lease_owner = ? WHERE run_id = ?",
    ["replacement-worker", runId],
  );
  assert.equal(await worker, "lost");
  assert.equal(abortObserved, true);
  assert.equal(
    (await listRunCheckpoints(runId)).some(
      ({ checkpointKey }) => checkpointKey.endsWith(":crawl-response:v1"),
    ),
    false,
  );
});
