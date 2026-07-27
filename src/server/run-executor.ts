import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { z } from "zod";

import {
  EVIDENCE_LEDGER_SCHEMA_VERSION,
  EVIDENCE_RUBRIC_VERSION,
  evaluateEvidence,
  type EvidenceEvaluation,
} from "@/src/domain/evidence";
import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import {
  mergeProviderCallObservability,
  providerCallObservabilitySchema,
  providerHealthSchema,
  type ProviderCallObservability,
} from "@/src/domain/provider-observability";
import {
  parseRunReceipt,
  sanitizeArtifactReceiptUrl,
  sanitizeReceiptUrl,
  type RunReceipt,
} from "@/src/domain/run-receipt";
import type { IntakeRun } from "@/src/domain/schemas";
import {
  selectRichStaticLayoutIds,
  visualProfileVerificationSchema,
} from "@/src/domain/visual-profile";
import {
  isPersistableSourceUrl,
  normalizePersistableSourceUrl,
} from "@/src/domain/source-url";
import {
  CLOUDFLARE_CRAWLER_METADATA,
  CloudflareCrawler,
} from "@/src/integrations/cloudflare";
import {
  PERPLEXITY_ENRICHMENT_METADATA,
  PerplexityEnrichmentProvider,
} from "@/src/integrations/perplexity";
import {
  PresentonDeckProvider,
  presentonProviderMetadata,
} from "@/src/integrations/presenton";
import { hashExpectedSlideText } from "@/src/integrations/pptx-content-verifier";
import type {
  ArtifactVerification,
  ArtifactVerificationOptions,
  CompanyBrief,
  CrawlResult,
  DeckGenerationInput,
  DeckProvider,
  EnrichmentProvider,
  PresentonResult,
  ResumableCrawlProvider,
  SellerDiscoveryResult,
} from "@/src/integrations/providers";
import {
  GEMINI_BRIEF_BUILDER_METADATA,
  AiBriefBuilder,
} from "@/src/server/ai-brief-builder";
import {
  LocalSellerBriefBuilder,
  type CompanyBriefBuilder,
  type SellerBriefBuilder,
} from "@/src/server/builders";
import {
  addRunEvent,
  getRunExecutionContext,
  type RunExecutionContext,
  type RunExecutionTarget,
} from "@/src/server/repository";
import {
  MAX_LEASE_DURATION_MS,
  RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY,
  claimNextRunJob,
  commitRunTargetCheckpoint,
  completeSellerBriefCheckpoint,
  completeRunCheckpoint,
  completeRunJob,
  getRunJob,
  heartbeatRunJob,
  listRunAttempts,
  listRunCheckpoints,
  projectRunTargetForLease,
  releaseRunJobForRetry,
  transitionRunJob,
  parseRunExecutionContract,
  type ClaimedRunJob,
  type DurableRunState,
  type RunCheckpoint,
  type RunExecutionContract,
  type RunLease,
  type TerminalRunState,
} from "@/src/server/run-queue";
import { resolveIntegrationConfig } from "@/src/server/settings";
import {
  validatePublicTargetUrl,
  validateTargetTransportApproval,
} from "@/src/server/target-url-policy";
import {
  GEMINI_SLIDE_PLANNER_METADATA,
  SlidePlanner,
  slidePlanSchema,
  type SlidePlan,
  type SlidePlannerInput,
} from "@/src/server/slide-planner";

const WORKER_LEASE_MS = MAX_LEASE_DURATION_MS;
const DEFAULT_LEASE_HEARTBEAT_INTERVAL_MS = 30_000;
const INITIAL_RETRY_DELAY_MS = 30_000;
const MAX_WORKER_RETRY_DELAY_MS = 15 * 60 * 1000;

const HttpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
});

const SourceUrlSchema = z.string().trim().max(2_048).url()
  .refine(isPersistableSourceUrl, "Expected a safe HTTP(S) source URL.")
  .transform(normalizePersistableSourceUrl);

const TimingSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
}).strict();

const CrawlResultSchema = z.object({
  provider: z.literal("cloudflare"),
  pages: z.array(z.object({
    url: SourceUrlSchema,
    title: z.string().optional(),
    markdown: z.string().optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
  }).strict()).min(1),
  blockedUrls: z.array(SourceUrlSchema),
  discoveredUrls: z.array(SourceUrlSchema),
  rawJobId: z.string().trim().min(1).max(256).optional(),
  status: z.string().trim().min(1).max(100).optional(),
}).strict();

const EnrichmentResultSchema = z.object({
  synthesizedSummary: z.string().trim().min(1).max(50_000),
  evidence: z.array(z.object({
    title: z.string().trim().min(1).max(2_000),
    url: SourceUrlSchema,
    snippet: z.string().max(20_000),
  }).strict()).max(200),
  confidence: z.enum(["low", "medium", "high"]),
}).strict();

const SellerBriefSchema = z.object({
  positioningSummary: z.string().trim().min(1),
  offerSummary: z.string().trim().min(1),
  proofPoints: z.array(z.string()),
  preferredAngles: z.array(z.string()),
  commonObjections: z.array(z.object({
    objection: z.string(),
    response: z.string(),
  })).optional(),
  pricingModel: z.string().optional(),
  pricingContext: z.string().optional(),
  bestCaseStudy: z.object({
    clientName: z.string(),
    industry: z.string(),
    results: z.string(),
  }).optional(),
}).strict();

const CompanyBriefSchema = z.object({
  websiteUrl: SourceUrlSchema,
  companyName: z.string().optional(),
  industry: z.string(),
  offer: z.string(),
  locale: z.string().optional(),
  likelyBuyer: z.string().optional(),
  whyNow: z.string().optional(),
  painPoints: z.array(z.string()),
  proofPoints: z.array(z.string()),
  pitchAngles: z.array(z.string()),
  sourceUrls: z.array(SourceUrlSchema),
  sourceClaims: z.array(z.object({
    text: z.string().trim().min(1).max(5_000),
    sourceUrl: SourceUrlSchema,
  }).strict()).max(100).optional(),
  anchorMetric: z.string().optional(),
  contrarianAngle: z.string().optional(),
  compoundingLogic: z.string().optional(),
}).strict();

const ErrorOutcomeSchema = z.object({
  outcome: z.literal("failed"),
  errorCode: z.string().trim().min(1).max(200),
  timing: TimingSchema,
}).strict();

const CrawlCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("succeeded"),
    crawlResult: CrawlResultSchema,
    timing: TimingSchema,
  }).strict(),
  ErrorOutcomeSchema,
]);

const EnrichmentCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("succeeded"),
    enrichment: EnrichmentResultSchema,
    companyBrief: CompanyBriefSchema,
    timing: TimingSchema,
  }).strict(),
  ErrorOutcomeSchema,
]);

const EvidenceEvaluationSchema = z.object({
  coverage: z.object({
    supportedFactualClaims: z.number().int().nonnegative(),
    factualClaims: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1).nullable(),
    percent: z.number().min(0).max(100).nullable(),
  }).strict(),
  unsupportedFactualClaimIds: z.array(z.string()),
  sellerClaimIds: z.array(z.string()),
  modelInferenceClaimIds: z.array(z.string()),
  claimLabels: z.array(z.object({
    claimId: z.string(),
    claimClass: z.enum(["seller_claim", "external_fact", "model_inference"]),
    label: z.enum(["source-backed", "seller-supplied", "model-inference", "unsupported"]),
  }).strict()),
  deliveryGate: z.object({
    canDeliver: z.boolean(),
    blockingClaimIds: z.array(z.string()),
    requiredCoverageRatio: z.literal(1),
    policy: z.literal("all_factual_claims_must_be_source_backed"),
  }).strict(),
}).strict();

const ReadinessSchema = z.object({
  requiredSlideFieldsPresent: z.boolean(),
  ctaPresent: z.boolean(),
  evidenceGatePassed: z.boolean(),
  artifactReadable: z.boolean(),
  providerProvenancePresent: z.boolean(),
  visualProfileVerified: z.boolean(),
}).strict();

const PlanningCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("ready"),
    plan: slidePlanSchema,
    evidenceEvaluation: EvidenceEvaluationSchema,
    readiness: ReadinessSchema,
    timing: TimingSchema,
  }).strict(),
  z.object({
    outcome: z.literal("blocked"),
    plan: slidePlanSchema.optional(),
    evidenceEvaluation: EvidenceEvaluationSchema.optional(),
    readiness: ReadinessSchema,
    errorCode: z.string().trim().min(1).max(200),
    timing: TimingSchema,
  }).strict(),
  ErrorOutcomeSchema,
]);

const ProviderDispatchCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  providerId: z.string().trim().min(1).max(200),
  reservedAt: z.string().datetime({ offset: true }),
}).strict();

const CrawlResponseCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  crawlResult: CrawlResultSchema,
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const CrawlJobCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  providerId: z.literal(CLOUDFLARE_CRAWLER_METADATA.providerId),
  jobId: z.string().trim().min(1).max(256),
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const EnrichmentResponseCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  enrichment: EnrichmentResultSchema,
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const CompanyBriefResponseCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  companyBrief: CompanyBriefSchema,
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const PlanningResponseCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  plan: slidePlanSchema,
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const PresentonResultSchema = z.object({
  presentationId: z.string().trim().min(1).max(200)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
  editorUrl: HttpUrlSchema.optional(),
  exportUrl: HttpUrlSchema.optional(),
  rawPath: z.string().max(4_096).optional(),
  usage: z.object({
    unit: z.literal("credits"),
    amount: z.number().finite().nonnegative(),
  }).strict().optional(),
}).strict();

const ArtifactVerificationSchema = z.object({
  url: HttpUrlSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive().max(MAX_DELIVERY_ARTIFACT_BYTES),
  contentType: z.string().trim().min(1).max(200).optional(),
  verifiedAt: z.string().datetime({ offset: true }),
  contentVerification: z.object({
    method: z.literal("pptx_ooxml_rich_static_v2"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    slideCount: z.number().int().positive().max(60),
  }).strict(),
  visualProfile: visualProfileVerificationSchema,
}).strict();

const RenderingCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("delivered"),
    result: PresentonResultSchema,
    verification: ArtifactVerificationSchema,
    readiness: ReadinessSchema,
    timing: TimingSchema,
  }).strict(),
  z.object({
    outcome: z.enum(["blocked", "failed"]),
    errorCode: z.string().trim().min(1).max(200),
    readiness: ReadinessSchema,
    timing: TimingSchema,
  }).strict(),
]);

const RenderingDispatchCheckpointSchema = ProviderDispatchCheckpointSchema;

const RenderingResponseCheckpointSchema = z.object({
  contractVersion: z.literal(1),
  result: PresentonResultSchema,
  observability: providerCallObservabilitySchema.optional(),
  receivedAt: z.string().datetime({ offset: true }),
}).strict();

const SellerBriefCheckpointSchema = z.object({
  sellerBrief: SellerBriefSchema,
  timing: TimingSchema,
}).strict();

type CrawlCheckpoint = z.infer<typeof CrawlCheckpointSchema>;
type EnrichmentCheckpoint = z.infer<typeof EnrichmentCheckpointSchema>;
type PlanningCheckpoint = z.infer<typeof PlanningCheckpointSchema>;
type RenderingCheckpoint = z.infer<typeof RenderingCheckpointSchema>;

interface ProviderProvenance {
  stage: "crawling" | "enriching" | "planning" | "rendering";
  providerId: string;
  modelId: string | null;
  contractVersion: number;
}

function createObservabilityCollector() {
  const values: ProviderCallObservability[] = [];
  return {
    observe: (value: ProviderCallObservability) => values.push(value),
    value: () => mergeProviderCallObservability(values),
  };
}

interface VerifiableDeckProvider extends DeckProvider {
  verifyArtifact(
    result: PresentonResult,
    options: ArtifactVerificationOptions,
  ): Promise<ArtifactVerification>;
}

export interface RunExecutorDependencies {
  crawler: ResumableCrawlProvider;
  enrichmentProvider: EnrichmentProvider;
  sellerBriefBuilder: SellerBriefBuilder;
  companyBriefBuilder: CompanyBriefBuilder;
  slidePlanner: Pick<SlidePlanner, "planSlides">;
  targetUrlValidator: (value: string) => Promise<void>;
  deckProvider: VerifiableDeckProvider;
  configurationNames: string[];
  providerProvenance: ProviderProvenance[];
  commitSha: string | null;
  now?: () => Date;
}

export interface RunLeaseExecutionOptions {
  leaseDurationMs?: number;
  leaseHeartbeatIntervalMs?: number;
}

interface ResolvedLeaseExecutionOptions {
  leaseDurationMs: number;
  leaseHeartbeatIntervalMs: number;
}

export type RunExecutorDependencyFactory = (
  context: RunExecutionContext,
) => Promise<RunExecutorDependencies>;

class LeaseLostError extends Error {
  public constructor() {
    super("The durable run lease is no longer owned by this attempt.");
    this.name = "LeaseLostError";
  }
}

class CancellationHandled extends Error {
  public constructor() {
    super("Run cancellation was persisted.");
    this.name = "CancellationHandled";
  }
}

class WorkerConfigurationError extends Error {
  public readonly retryable = false;
  public readonly code = "configuration";

  public constructor(public readonly component: string) {
    super(`Reference worker configuration is incomplete (${component}).`);
    this.name = "WorkerConfigurationError";
  }
}

class CheckpointContractError extends Error {
  public readonly retryable = false;
  public readonly code = "checkpoint_contract";

  public constructor() {
    super("Persisted checkpoint metadata does not match the worker contract.");
    this.name = "CheckpointContractError";
  }
}

class TargetContractError extends Error {
  public readonly retryable = false;

  public constructor(public readonly code: string) {
    super(`Target processing failed its deterministic contract (${code}).`);
    this.name = "TargetContractError";
  }
}

export function createWorkerId() {
  return `${hostname()}:${process.pid}:${randomUUID()}`;
}

export async function createReferenceDependencies(
  context: RunExecutionContext,
): Promise<RunExecutorDependencies> {
  const commitSha = resolveCommitSha();
  if (!commitSha) throw new WorkerConfigurationError("commit_sha");

  const config = await resolveIntegrationConfig(context.userId);
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
    throw new WorkerConfigurationError("cloudflare");
  }
  if (!config.perplexityApiKey) throw new WorkerConfigurationError("perplexity");
  if (!config.geminiApiKey) throw new WorkerConfigurationError("gemini");
  if (!config.presentonBaseUrl) throw new WorkerConfigurationError("presenton");

  const crawler = new CloudflareCrawler({
    accountId: config.cloudflareAccountId,
    apiToken: config.cloudflareApiToken,
  });
  const enrichmentProvider = new PerplexityEnrichmentProvider(config.perplexityApiKey);
  const companyBriefBuilder = new AiBriefBuilder(config.geminiApiKey);
  const slidePlanner = new SlidePlanner(config.geminiApiKey);
  const deckProvider = new PresentonDeckProvider({
    baseUrl: config.presentonBaseUrl,
    apiKey: config.presentonApiKey,
    basicAuthUsername: config.presentonAuthUsername,
    basicAuthPassword: config.presentonAuthPassword,
    defaultTemplate: config.presentonTemplate,
    allowPrivateNetwork: config.allowPrivateProviderUrls,
  });

  return {
    crawler,
    enrichmentProvider,
    sellerBriefBuilder: new LocalSellerBriefBuilder(),
    companyBriefBuilder,
    slidePlanner,
    targetUrlValidator: validatePublicTargetUrl,
    deckProvider,
    configurationNames: [
      "cloudflare.account_id",
      "cloudflare.api_token",
      "perplexity.api_key",
      "gemini.api_key",
      "presenton.base_url",
      ...(config.presentonApiKey ? ["presenton.api_key"] : []),
      ...(config.presentonAuthUsername ? ["presenton.auth_username"] : []),
      ...(config.presentonAuthPassword ? ["presenton.auth_password"] : []),
      ...(config.presentonTemplate ? ["presenton.template"] : []),
    ],
    providerProvenance: [
      {
        stage: "crawling",
        providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
        modelId: CLOUDFLARE_CRAWLER_METADATA.modelId,
        contractVersion: CLOUDFLARE_CRAWLER_METADATA.contractVersion,
      },
      {
        stage: "enriching",
        providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
        modelId: enrichmentProvider.modelId,
        contractVersion: PERPLEXITY_ENRICHMENT_METADATA.contractVersion,
      },
      {
        stage: "enriching",
        providerId: GEMINI_BRIEF_BUILDER_METADATA.providerId,
        modelId: companyBriefBuilder.modelId,
        contractVersion: GEMINI_BRIEF_BUILDER_METADATA.contractVersion,
      },
      {
        stage: "planning",
        providerId: GEMINI_SLIDE_PLANNER_METADATA.providerId,
        modelId: slidePlanner.modelId,
        contractVersion: GEMINI_SLIDE_PLANNER_METADATA.contractVersion,
      },
      {
        stage: "rendering",
        providerId: presentonProviderMetadata.providerId,
        modelId: presentonProviderMetadata.modelId,
        contractVersion: presentonProviderMetadata.contractVersion,
      },
    ],
    commitSha,
  };
}

export async function runNextReferenceJob(options: {
  leaseOwner?: string;
  dependencyFactory?: RunExecutorDependencyFactory;
  leaseDurationMs?: number;
  leaseHeartbeatIntervalMs?: number;
} = {}): Promise<"idle" | "completed" | "released" | "lost"> {
  const leaseOwner = options.leaseOwner ?? createWorkerId();
  const leaseOptions = resolveLeaseExecutionOptions(options);
  const claimed = await claimNextRunJob({
    leaseOwner,
    leaseDurationMs: leaseOptions.leaseDurationMs,
  });
  if (!claimed) return "idle";

  try {
    const context = await getRunExecutionContext(claimed.job.runId);
    if (!context) throw new TargetContractError("missing_run");
    const dependencies = await (options.dependencyFactory ?? createReferenceDependencies)(context);
    await executeClaimedRun(claimed, context, dependencies, leaseOptions);
    return "completed";
  } catch (error) {
    if (error instanceof CancellationHandled) return "completed";
    if (error instanceof LeaseLostError) {
      const current = await getRunJob(claimed.job.runId);
      if (current?.cancelRequestedAt) {
        const cancelled = await completeRunJob(claimed.lease, "cancelled", {
          error: "Run cancellation was requested.",
        });
        if (cancelled) return "completed";
      }
      return "lost";
    }

    const code = safeErrorCode(error);
    await addRunEvent(claimed.job.runId, {
      idempotencyKey: `attempt:${claimed.attempt.id}:error`,
      stage: claimed.job.state,
      level: "error",
      message: `Run attempt stopped (${code}).`,
    });

    if (isRetryableError(error)) {
      const released = await releaseRunJobForRetry(claimed.lease, {
        retryDelayMs: retryDelayMs(claimed.attempt.attemptNumber),
        error: `Retryable worker failure (${code}).`,
      });
      if (released) return released.exhausted ? "completed" : "released";
    } else {
      const completed = await completeRunJob(claimed.lease, "failed", {
        error: `Non-retryable worker failure (${code}).`,
      });
      if (completed) return "completed";
    }

    const current = await getRunJob(claimed.job.runId);
    if (current?.cancelRequestedAt) {
      const cancelled = await completeRunJob(claimed.lease, "cancelled", {
        error: "Run cancellation was requested.",
      });
      if (cancelled) return "completed";
    }
    return "lost";
  }
}

export async function executeClaimedRun(
  claimed: ClaimedRunJob,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  options: RunLeaseExecutionOptions = {},
): Promise<RunReceipt> {
  // Receipt provenance is a preflight requirement, not a post-render check.
  // Rejecting it here prevents any paid provider dispatch under an
  // unidentifiable build, including when a custom dependency factory is used.
  if (!dependencies.commitSha) throw new WorkerConfigurationError("commit_sha");

  const clock = dependencies.now ?? (() => new Date());
  const leaseOptions = resolveLeaseExecutionOptions(options);
  const checkpoints = new Map(
    (await listRunCheckpoints(context.runId)).map((checkpoint) => [
      checkpoint.checkpointKey,
      checkpoint,
    ]),
  );
  let state = claimed.job.state;
  const executionContract = await retainRunExecutionContract(
    claimed.lease,
    state,
    dependencies,
    checkpoints,
    clock,
  );

  while (true) {
    await guardLeaseAndCancellation(claimed.lease, clock, leaseOptions);
    switch (state) {
      case "queued":
        state = await moveTo(claimed.lease, "crawling", clock, leaseOptions);
        break;
      case "crawling":
        await runCrawlingStage(
          claimed.lease,
          context,
          dependencies,
          checkpoints,
          clock,
          leaseOptions,
        );
        state = await moveTo(claimed.lease, "enriching", clock, leaseOptions);
        break;
      case "enriching":
        await runEnrichingStage(
          claimed.lease,
          context,
          dependencies,
          checkpoints,
          clock,
          leaseOptions,
        );
        state = await moveTo(claimed.lease, "brief_ready", clock, leaseOptions);
        break;
      case "brief_ready":
        await recordBriefReady(claimed.lease, context, checkpoints, clock);
        state = await moveTo(claimed.lease, "planning", clock, leaseOptions);
        break;
      case "planning":
        await runPlanningStage(
          claimed.lease,
          context,
          dependencies,
          checkpoints,
          clock,
          leaseOptions,
        );
        state = await moveTo(claimed.lease, "rendering", clock, leaseOptions);
        break;
      case "rendering": {
        await runRenderingStage(
          claimed.lease,
          context,
          dependencies,
          checkpoints,
          clock,
          leaseOptions,
        );
        const terminalState = determineTerminalState(context.targets, checkpoints);
        const receipt = await buildReceipt(
          claimed,
          context,
          dependencies,
          checkpoints,
          terminalState,
          executionContract,
          clock,
        );
        const completed = await completeRunJob(claimed.lease, terminalState, {
          now: clock(),
          ...(terminalState === "failed"
            ? { error: "No target produced a verified deliverable." }
            : {}),
          terminalArtifact: {
            idempotencyKey: "run-receipt-v1",
            artifactType: "run_receipt",
            artifactJson: receipt,
          },
        });
        if (!completed) throw new LeaseLostError();
        await addRunEvent(context.runId, {
          idempotencyKey: "run-terminal-v1",
          stage: "rendering",
          level: terminalState === "failed" ? "error" : "info",
          message: `Run reached terminal state ${terminalState}.`,
        });
        return receipt;
      }
      case "delivered":
      case "partially_completed":
      case "failed":
      case "cancelled":
        throw new LeaseLostError();
    }
  }
}

/**
 * Bind resumable work to the retained non-secret build and provider contract
 * identity that first claimed the run. A later worker may resume checkpoints
 * only when its commit, configuration-name set, provider IDs, models, and
 * contract versions still match. Secret values are deliberately never stored.
 */
async function retainRunExecutionContract(
  lease: RunLease,
  state: DurableRunState,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
): Promise<RunExecutionContract> {
  const existing = checkpoints.get(RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY);
  let proposed: RunExecutionContract;
  try {
    proposed = parseRunExecutionContract({
      schemaVersion: 1,
      commitSha: dependencies.commitSha,
      configurationNames: dependencies.configurationNames,
      providers: dependencies.providerProvenance,
      recordedAt: existing?.completedAt ?? clock().toISOString(),
    });
  } catch {
    throw new WorkerConfigurationError("execution_contract");
  }

  if (existing) {
    let retained: RunExecutionContract;
    try {
      retained = parseRunExecutionContract(existing.metadata);
    } catch {
      throw new CheckpointContractError();
    }
    const identity = (contract: RunExecutionContract) => ({
      schemaVersion: contract.schemaVersion,
      commitSha: contract.commitSha,
      configurationNames: contract.configurationNames,
      providers: contract.providers,
    });
    if (JSON.stringify(identity(retained)) !== JSON.stringify(identity(proposed))) {
      throw new CheckpointContractError();
    }
    return retained;
  }

  // The execution contract is the first checkpoint for every new run. If any
  // other checkpoint already exists, attributing that earlier work to the
  // current build or provider set would fabricate provenance.
  if (checkpoints.size > 0) throw new CheckpointContractError();

  await recordCheckpoint(
    lease,
    RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY,
    state,
    proposed,
    checkpoints,
    clock,
  );
  return proposed;
}

async function runCrawlingStage(
  lease: RunLease,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  for (const target of context.targets) {
    await guardLeaseAndCancellation(lease, clock, leaseOptions);
    const key = targetKey(target, "crawl");
    const existingFinal = checkpoints.get(key);
    if (existingFinal) {
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "crawling",
        existingFinal.metadata,
        checkpoints,
        clock,
      );
      continue;
    }
    const dispatchKey = targetKey(target, "crawl-dispatch");
    const jobKey = targetKey(target, "crawl-job");
    const responseKey = targetKey(target, "crawl-response");
    const boundary = readProviderBoundary(
      checkpoints,
      dispatchKey,
      responseKey,
      CLOUDFLARE_CRAWLER_METADATA.providerId,
      CrawlResponseCheckpointSchema,
    );
    const jobCheckpoint = checkpoints.get(jobKey);
    const crawlJob = jobCheckpoint
      ? parseCheckpoint(jobCheckpoint, CrawlJobCheckpointSchema)
      : undefined;
    if (crawlJob && !boundary.dispatch) throw new CheckpointContractError();
    if (boundary.dispatch && !boundary.response && !crawlJob) {
      await recordIndeterminateProviderOutcome(
        lease,
        context,
        target,
        key,
        "crawling",
        "indeterminate_crawl_outcome",
        checkpoints,
        clock,
      );
      continue;
    }

    await projectTargetForLease(
      lease,
      target,
      "crawling",
      { status: "crawling", lastError: null },
      clock,
    );
    const startedAt = boundary.dispatch
      ? new Date(boundary.dispatch.reservedAt)
      : clock();
    try {
      let crawlResult = boundary.response?.crawlResult;
      if (!crawlResult) {
        validateTargetTransportApproval(target.input.websiteUrl);
        await dependencies.targetUrlValidator(target.input.websiteUrl);
        const request = buildCrawlRequest(target.input.websiteUrl);
        let jobId = crawlJob?.jobId;
        if (!jobId) {
          const startObservability = createObservabilityCollector();
          await guardLeaseAndCancellation(lease, clock, leaseOptions);
          await recordCheckpoint(
            lease,
            dispatchKey,
            "crawling",
            {
              contractVersion: 1,
              providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
              reservedAt: startedAt.toISOString(),
            } satisfies z.infer<typeof ProviderDispatchCheckpointSchema>,
            checkpoints,
            clock,
          );
          jobId = await runExternalProviderOperation(
            lease,
            clock,
            leaseOptions,
            (signal) => dependencies.crawler.startCrawl(request, {
              signal,
              onObservability: startObservability.observe,
            }),
          );
          const retainedStartObservability = startObservability.value();
          await recordCheckpoint(
            lease,
            jobKey,
            "crawling",
            {
              contractVersion: 1,
              providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
              jobId,
              ...(retainedStartObservability
                ? { observability: retainedStartObservability }
                : {}),
              receivedAt: clock().toISOString(),
            } satisfies z.infer<typeof CrawlJobCheckpointSchema>,
            checkpoints,
            clock,
          );
        }
        const crawlObservability = createObservabilityCollector();
        const raw = await runExternalProviderOperation(
          lease,
          clock,
          leaseOptions,
          (signal) => dependencies.crawler.resumeCrawl(jobId, request, {
            signal,
            onObservability: crawlObservability.observe,
          }),
        );
        crawlResult = CrawlResultSchema.parse(normalizeCrawlResult(raw));
        const retainedCrawlObservability = crawlObservability.value();
        await recordCheckpoint(
          lease,
          responseKey,
          "crawling",
          {
            contractVersion: 1,
            crawlResult,
            ...(retainedCrawlObservability
              ? { observability: retainedCrawlObservability }
              : {}),
            receivedAt: clock().toISOString(),
          } satisfies z.infer<typeof CrawlResponseCheckpointSchema>,
          checkpoints,
          clock,
        );
      }
      const metadata: CrawlCheckpoint = {
        outcome: "succeeded",
        crawlResult,
        timing: completeTiming(startedAt, clock()),
      };
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "crawling",
        metadata,
        checkpoints,
        clock,
      );
    } catch (error) {
      await recordTargetFailure(
        error,
        lease,
        context,
        target,
        key,
        "crawling",
        startedAt,
        checkpoints,
        clock,
      );
    }
  }
}

async function runEnrichingStage(
  lease: RunLease,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  const sellerKey = "seller-brief-v1";
  let sellerBrief: SellerDiscoveryResult;
  const existingSeller = checkpoints.get(sellerKey);
  if (existingSeller) {
    await commitSellerBrief(
      lease,
      sellerKey,
      existingSeller.metadata,
      checkpoints,
      clock,
    );
    sellerBrief = parseCheckpoint(existingSeller, SellerBriefCheckpointSchema).sellerBrief;
  } else {
    const startedAt = clock();
    sellerBrief = SellerBriefSchema.parse(
      await dependencies.sellerBriefBuilder.buildSellerBrief(context.input.sellerContext),
    );
    const metadata = {
      sellerBrief,
      timing: completeTiming(startedAt, clock()),
    };
    await commitSellerBrief(lease, sellerKey, metadata, checkpoints, clock);
  }

  for (const target of context.targets) {
    await guardLeaseAndCancellation(lease, clock, leaseOptions);
    const key = targetKey(target, "enrichment");
    const existingFinal = checkpoints.get(key);
    if (existingFinal) {
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "enriching",
        existingFinal.metadata,
        checkpoints,
        clock,
      );
      continue;
    }
    const crawl = readTargetCheckpoint(checkpoints, target, "crawl", CrawlCheckpointSchema);
    if (crawl.outcome === "failed") {
      await recordSkippedTarget(
        lease,
        context,
        target,
        key,
        "enriching",
        propagateIndeterminateCode(crawl.errorCode, "upstream_crawl_failed"),
        checkpoints,
        clock,
      );
      continue;
    }

    const enrichmentDispatchKey = targetKey(target, "enrichment-dispatch");
    const enrichmentResponseKey = targetKey(target, "enrichment-response");
    const companyBriefDispatchKey = targetKey(target, "company-brief-dispatch");
    const companyBriefResponseKey = targetKey(target, "company-brief-response");
    const enrichmentBoundary = readProviderBoundary(
      checkpoints,
      enrichmentDispatchKey,
      enrichmentResponseKey,
      PERPLEXITY_ENRICHMENT_METADATA.providerId,
      EnrichmentResponseCheckpointSchema,
    );
    const companyBriefBoundary = readProviderBoundary(
      checkpoints,
      companyBriefDispatchKey,
      companyBriefResponseKey,
      GEMINI_BRIEF_BUILDER_METADATA.providerId,
      CompanyBriefResponseCheckpointSchema,
    );
    if (
      (companyBriefBoundary.dispatch || companyBriefBoundary.response)
      && !enrichmentBoundary.response
    ) {
      throw new CheckpointContractError();
    }
    if (enrichmentBoundary.dispatch && !enrichmentBoundary.response) {
      await recordIndeterminateProviderOutcome(
        lease,
        context,
        target,
        key,
        "enriching",
        "indeterminate_enrichment_outcome",
        checkpoints,
        clock,
      );
      continue;
    }
    if (companyBriefBoundary.dispatch && !companyBriefBoundary.response) {
      await recordIndeterminateProviderOutcome(
        lease,
        context,
        target,
        key,
        "enriching",
        "indeterminate_company_brief_outcome",
        checkpoints,
        clock,
      );
      continue;
    }

    await projectTargetForLease(
      lease,
      target,
      "enriching",
      { status: "enriching", lastError: null },
      clock,
    );
    const startedAt = enrichmentBoundary.dispatch
      ? new Date(enrichmentBoundary.dispatch.reservedAt)
      : clock();
    try {
      let enrichment = enrichmentBoundary.response?.enrichment;
      if (!enrichment) {
        const enrichmentObservability = createObservabilityCollector();
        const enrichmentRequest = {
          websiteUrl: target.input.websiteUrl,
          companyName: target.input.companyName,
          sellerPositioningSummary: sellerBrief.positioningSummary,
          requestedSignals: [
            "industry",
            "locale",
            "recent activity",
            "buyer signals",
            "observable proof points",
          ],
        };
        await recordCheckpoint(
          lease,
          enrichmentDispatchKey,
          "enriching",
          {
            contractVersion: 1,
            providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
            reservedAt: startedAt.toISOString(),
          } satisfies z.infer<typeof ProviderDispatchCheckpointSchema>,
          checkpoints,
          clock,
        );
        enrichment = EnrichmentResultSchema.parse(
          await runExternalProviderOperation(
            lease,
            clock,
            leaseOptions,
            (signal) => dependencies.enrichmentProvider.enrichCompany(
              enrichmentRequest,
              {
                signal,
                onObservability: enrichmentObservability.observe,
              },
            ),
          ),
        );
        const retainedEnrichmentObservability = enrichmentObservability.value();
        await recordCheckpoint(
          lease,
          enrichmentResponseKey,
          "enriching",
          {
            contractVersion: 1,
            enrichment,
            ...(retainedEnrichmentObservability
              ? { observability: retainedEnrichmentObservability }
              : {}),
            receivedAt: clock().toISOString(),
          } satisfies z.infer<typeof EnrichmentResponseCheckpointSchema>,
          checkpoints,
          clock,
        );
      }

      let companyBrief = companyBriefBoundary.response?.companyBrief;
      if (!companyBrief) {
        const companyBriefObservability = createObservabilityCollector();
        const companyBriefRequest = {
          target: target.input,
          sellerBrief,
          crawlMarkdown: crawl.crawlResult.pages
            .map((page) => page.markdown)
            .filter((value): value is string => Boolean(value))
            .join("\n\n---\n\n"),
          crawlEvidence: crawl.crawlResult.pages
            .filter((page) => Boolean(page.markdown))
            .map((page) => ({ url: page.url, text: page.markdown ?? "" })),
          sourceUrls: unique([
            ...crawl.crawlResult.pages.map((page) => page.url),
            ...crawl.crawlResult.discoveredUrls,
            ...enrichment.evidence.map((item) => item.url),
          ]),
          enrichmentSummary: enrichment.synthesizedSummary,
          sourceEvidence: enrichment.evidence,
        };
        const companyBriefStartedAt = clock();
        await recordCheckpoint(
          lease,
          companyBriefDispatchKey,
          "enriching",
          {
            contractVersion: 1,
            providerId: GEMINI_BRIEF_BUILDER_METADATA.providerId,
            reservedAt: companyBriefStartedAt.toISOString(),
          } satisfies z.infer<typeof ProviderDispatchCheckpointSchema>,
          checkpoints,
          clock,
        );
        companyBrief = CompanyBriefSchema.parse(
          await runExternalProviderOperation(
            lease,
            clock,
            leaseOptions,
            (signal) => dependencies.companyBriefBuilder.buildCompanyBrief(
              companyBriefRequest,
              {
                signal,
                onObservability: companyBriefObservability.observe,
              },
            ),
          ),
        );
        const retainedCompanyBriefObservability = companyBriefObservability.value();
        await recordCheckpoint(
          lease,
          companyBriefResponseKey,
          "enriching",
          {
            contractVersion: 1,
            companyBrief,
            ...(retainedCompanyBriefObservability
              ? { observability: retainedCompanyBriefObservability }
              : {}),
            receivedAt: clock().toISOString(),
          } satisfies z.infer<typeof CompanyBriefResponseCheckpointSchema>,
          checkpoints,
          clock,
        );
      }
      const metadata: EnrichmentCheckpoint = {
        outcome: "succeeded",
        enrichment,
        companyBrief,
        timing: completeTiming(startedAt, clock()),
      };
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "enriching",
        metadata,
        checkpoints,
        clock,
      );
    } catch (error) {
      await recordTargetFailure(
        error,
        lease,
        context,
        target,
        key,
        "enriching",
        startedAt,
        checkpoints,
        clock,
      );
    }
  }
}

async function recordBriefReady(
  lease: RunLease,
  context: RunExecutionContext,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const key = "brief-ready-v1";
  if (checkpoints.has(key)) return;
  const timestamp = clock();
  const preparedTargets = context.targets.filter((target) =>
    readTargetCheckpoint(
      checkpoints,
      target,
      "enrichment",
      EnrichmentCheckpointSchema,
    ).outcome === "succeeded"
  ).length;
  await recordCheckpoint(
    lease,
    key,
    "brief_ready",
    {
      preparedTargets,
      failedTargets: context.targets.length - preparedTargets,
      timing: completeTiming(timestamp, timestamp),
    },
    checkpoints,
    clock,
  );
}

async function runPlanningStage(
  lease: RunLease,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  const sellerBrief = parseCheckpoint(
    requiredCheckpoint(checkpoints, "seller-brief-v1"),
    SellerBriefCheckpointSchema,
  ).sellerBrief;

  for (const target of context.targets) {
    await guardLeaseAndCancellation(lease, clock, leaseOptions);
    const key = targetKey(target, "planning");
    const existingFinal = checkpoints.get(key);
    if (existingFinal) {
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "planning",
        existingFinal.metadata,
        checkpoints,
        clock,
      );
      continue;
    }
    const enrichment = readTargetCheckpoint(
      checkpoints,
      target,
      "enrichment",
      EnrichmentCheckpointSchema,
    );
    if (enrichment.outcome === "failed") {
      await recordPlanningBlocked(
        lease,
        context,
        target,
        key,
        propagateIndeterminateCode(
          enrichment.errorCode,
          "upstream_enrichment_failed",
        ),
        undefined,
        undefined,
        checkpoints,
        clock,
      );
      continue;
    }

    const dispatchKey = targetKey(target, "planning-dispatch");
    const responseKey = targetKey(target, "planning-response");
    const boundary = readProviderBoundary(
      checkpoints,
      dispatchKey,
      responseKey,
      GEMINI_SLIDE_PLANNER_METADATA.providerId,
      PlanningResponseCheckpointSchema,
    );
    if (boundary.dispatch && !boundary.response) {
      await recordIndeterminateProviderOutcome(
        lease,
        context,
        target,
        key,
        "planning",
        "indeterminate_planning_outcome",
        checkpoints,
        clock,
      );
      continue;
    }

    await projectTargetForLease(
      lease,
      target,
      "planning",
      { status: "planning", lastError: null },
      clock,
    );
    const startedAt = boundary.dispatch
      ? new Date(boundary.dispatch.reservedAt)
      : clock();
    try {
      const deckInput = buildDeckInput(context.input.questionnaire, enrichment.companyBrief, sellerBrief);
      let plan = boundary.response?.plan;
      if (!plan) {
        const planningObservability = createObservabilityCollector();
        const planningRequest: SlidePlannerInput = {
          companyBrief: enrichment.companyBrief,
          sellerBrief,
          deckInput,
          sellerContactInfo: context.sellerContactInfo,
          sourceMetadata: sourceMetadataForTarget(target, checkpoints),
          slideStructure: context.input.questionnaire.extraInstructions,
        };
        await recordCheckpoint(
          lease,
          dispatchKey,
          "planning",
          {
            contractVersion: 1,
            providerId: GEMINI_SLIDE_PLANNER_METADATA.providerId,
            reservedAt: startedAt.toISOString(),
          } satisfies z.infer<typeof ProviderDispatchCheckpointSchema>,
          checkpoints,
          clock,
        );
        plan = slidePlanSchema.parse(
          await runExternalProviderOperation(
            lease,
            clock,
            leaseOptions,
            (signal) => dependencies.slidePlanner.planSlides(planningRequest, {
              signal,
              onObservability: planningObservability.observe,
            }),
          ),
        );
        const retainedPlanningObservability = planningObservability.value();
        await recordCheckpoint(
          lease,
          responseKey,
          "planning",
          {
            contractVersion: 1,
            plan,
            ...(retainedPlanningObservability
              ? { observability: retainedPlanningObservability }
              : {}),
            receivedAt: clock().toISOString(),
          } satisfies z.infer<typeof PlanningResponseCheckpointSchema>,
          checkpoints,
          clock,
        );
      }
      const evidenceEvaluation = EvidenceEvaluationSchema.parse(
        evaluateEvidence(plan.evidence),
      ) as EvidenceEvaluation;
      const readiness = {
        requiredSlideFieldsPresent: true,
        ctaPresent: planContainsCta(plan, context.input.questionnaire.callToAction),
        evidenceGatePassed: evidenceEvaluation.deliveryGate.canDeliver,
        artifactReadable: false,
        providerProvenancePresent: dependencies.providerProvenance.some(
          (provider) => provider.stage === "planning",
        ),
        visualProfileVerified: false,
      };
      const blockedCode = !readiness.evidenceGatePassed
        ? "unsupported_factual_claims"
        : !readiness.ctaPresent
          ? "missing_cta"
          : !readiness.providerProvenancePresent
            ? "missing_provider_provenance"
            : null;
      const metadata: PlanningCheckpoint = blockedCode
        ? {
            outcome: "blocked",
            plan,
            evidenceEvaluation,
            readiness,
            errorCode: blockedCode,
            timing: completeTiming(startedAt, clock()),
          }
        : {
            outcome: "ready",
            plan,
            evidenceEvaluation,
            readiness,
            timing: completeTiming(startedAt, clock()),
          };
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "planning",
        metadata,
        checkpoints,
        clock,
      );
      if (metadata.outcome === "blocked") {
        await addRunEvent(context.runId, {
          targetId: target.id,
          idempotencyKey: `${key}:blocked`,
          stage: "planning",
          level: "warning",
          message: `Target delivery was blocked (${metadata.errorCode}).`,
        });
      }
    } catch (error) {
      await recordTargetFailure(
        error,
        lease,
        context,
        target,
        key,
        "planning",
        startedAt,
        checkpoints,
        clock,
      );
    }
  }
}

async function runRenderingStage(
  lease: RunLease,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  const sellerBrief = parseCheckpoint(
    requiredCheckpoint(checkpoints, "seller-brief-v1"),
    SellerBriefCheckpointSchema,
  ).sellerBrief;

  for (const target of context.targets) {
    await guardLeaseAndCancellation(lease, clock, leaseOptions);
    const key = targetKey(target, "rendering");
    const existingFinal = checkpoints.get(key);
    if (existingFinal) {
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "rendering",
        existingFinal.metadata,
        checkpoints,
        clock,
      );
      continue;
    }
    const dispatchKey = targetKey(target, "render-dispatch");
    const responseKey = targetKey(target, "render-response");
    const planning = readTargetCheckpoint(
      checkpoints,
      target,
      "planning",
      PlanningCheckpointSchema,
    );
    if (planning.outcome !== "ready") {
      const readiness = planning.outcome === "blocked"
        ? planning.readiness
        : emptyReadiness();
      const metadata: RenderingCheckpoint = {
        outcome: planning.outcome === "blocked" ? "blocked" : "failed",
        errorCode: planning.outcome === "blocked"
          ? planning.errorCode
          : propagateIndeterminateCode(
              planning.errorCode,
              "upstream_planning_failed",
            ),
        readiness,
        timing: instantTiming(clock()),
      };
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "rendering",
        metadata,
        checkpoints,
        clock,
      );
      continue;
    }

    const enrichment = readTargetCheckpoint(
      checkpoints,
      target,
      "enrichment",
      EnrichmentCheckpointSchema,
    );
    if (enrichment.outcome !== "succeeded") throw new CheckpointContractError();

    const existingDispatchCheckpoint = checkpoints.get(dispatchKey);
    const existingResponseCheckpoint = checkpoints.get(responseKey);
    const existingDispatch = existingDispatchCheckpoint
      ? parseCheckpoint(existingDispatchCheckpoint, RenderingDispatchCheckpointSchema)
      : undefined;
    const existingResponse = existingResponseCheckpoint
      ? parseCheckpoint(existingResponseCheckpoint, RenderingResponseCheckpointSchema)
      : undefined;
    if (existingResponse && !existingDispatch) throw new CheckpointContractError();
    if (existingDispatch && !existingResponse) {
      await recordIndeterminateRenderingOutcome(
        lease,
        context,
        target,
        key,
        planning,
        checkpoints,
        clock,
      );
      continue;
    }

    await projectTargetForLease(
      lease,
      target,
      "rendering",
      { status: "rendering", lastError: null },
      clock,
    );
    const startedAt = existingDispatch ? new Date(existingDispatch.reservedAt) : clock();
    try {
      const deckInput = buildDeckInput(context.input.questionnaire, enrichment.companyBrief, sellerBrief);
      const expectedSlides = planning.plan.slides.map(({ headline, bulletPoints }) => ({
        headline,
        bulletPoints,
      }));
      const layoutIds = selectRichStaticLayoutIds(expectedSlides.length);
      let result = existingResponse?.result;
      if (!result) {
        const renderingObservability = createObservabilityCollector();
        await recordCheckpoint(
          lease,
          dispatchKey,
          "rendering",
          {
            contractVersion: 1,
            providerId: presentonProviderMetadata.providerId,
            reservedAt: startedAt.toISOString(),
          } satisfies z.infer<typeof RenderingDispatchCheckpointSchema>,
          checkpoints,
          clock,
        );
        const parsedResult = PresentonResultSchema.parse(
          await runExternalProviderOperation(
            lease,
            clock,
            leaseOptions,
            (signal) => dependencies.deckProvider.createDeck(deckInput, [], {
              exactSlides: expectedSlides,
              layoutIds,
              signal,
              onObservability: renderingObservability.observe,
            }),
          ),
        );
        // rawPath is provider-internal and may contain a transient signed query.
        // Delivery persists only the normalized URLs and usage returned by the adapter.
        result = {
          presentationId: parsedResult.presentationId,
          ...(parsedResult.editorUrl ? { editorUrl: parsedResult.editorUrl } : {}),
          ...(parsedResult.exportUrl ? { exportUrl: parsedResult.exportUrl } : {}),
          ...(parsedResult.usage ? { usage: parsedResult.usage } : {}),
        };
        const retainedRenderingObservability = renderingObservability.value()
          ?? (parsedResult.usage
            ? {
                usage: [{
                  metric: "credits_consumed",
                  unit: "credits",
                  amount: parsedResult.usage.amount,
                }],
              }
            : undefined);
        await recordCheckpoint(
          lease,
          responseKey,
          "rendering",
          {
            contractVersion: 1,
            result,
            ...(retainedRenderingObservability
              ? { observability: retainedRenderingObservability }
              : {}),
            receivedAt: clock().toISOString(),
          } satisfies z.infer<typeof RenderingResponseCheckpointSchema>,
          checkpoints,
          clock,
        );
      }
      const verification = ArtifactVerificationSchema.parse(
        await runExternalProviderOperation(
          lease,
          clock,
          leaseOptions,
          (signal) => dependencies.deckProvider.verifyArtifact(result, {
            expectedSlides,
            layoutIds,
            signal,
          }),
        ),
      );
      if (
        verification.contentVerification.slideCount !== expectedSlides.length
        || verification.contentVerification.sha256 !== hashExpectedSlideText(expectedSlides)
      ) {
        throw new TargetContractError("artifact_content_mismatch");
      }
      const readiness = {
        ...planning.readiness,
        artifactReadable: true,
        providerProvenancePresent: planning.readiness.providerProvenancePresent
          && dependencies.providerProvenance.some((provider) => provider.stage === "rendering"),
        visualProfileVerified: verification.visualProfile.measuredRichness.slideCount
          === expectedSlides.length,
      };
      if (!Object.values(readiness).every(Boolean)) {
        throw new TargetContractError("delivery_readiness_failed");
      }
      const metadata: RenderingCheckpoint = {
        outcome: "delivered",
        result,
        verification,
        readiness,
        timing: completeTiming(startedAt, clock()),
      };
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "rendering",
        metadata,
        checkpoints,
        clock,
      );
    } catch (error) {
      await recordRenderingFailure(
        error,
        lease,
        context,
        target,
        key,
        planning,
        startedAt,
        checkpoints,
        clock,
      );
    }
  }
}

async function recordIndeterminateRenderingOutcome(
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  planning: Extract<PlanningCheckpoint, { outcome: "ready" }>,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const errorCode = "indeterminate_render_outcome";
  const metadata: RenderingCheckpoint = {
    outcome: "failed",
    errorCode,
    readiness: planning.readiness,
    timing: instantTiming(clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    "rendering",
    metadata,
    checkpoints,
    clock,
  );
  await addRunEvent(context.runId, {
    targetId: target.id,
    idempotencyKey: `${key}:indeterminate`,
    stage: "rendering",
    level: "error",
    message: "Rendering was not retried because an earlier external dispatch has no durable completion record.",
  });
}

function buildProviderReceipts(
  context: RunExecutionContext,
  providerProvenance: ProviderProvenance[],
  checkpoints: Map<string, RunCheckpoint>,
) {
  const retained = new Map<string, ProviderCallObservability[]>();
  const markReachable = (
    providerId: string,
    observability: ProviderCallObservability | undefined,
  ) => {
    const values = retained.get(providerId) ?? [];
    if (observability) values.push(observability);
    retained.set(providerId, values);
  };

  for (const target of context.targets) {
    const crawlJobCheckpoint = checkpoints.get(targetKey(target, "crawl-job"));
    if (crawlJobCheckpoint) {
      const value = parseCheckpoint(crawlJobCheckpoint, CrawlJobCheckpointSchema);
      markReachable(CLOUDFLARE_CRAWLER_METADATA.providerId, value.observability);
    }
    const crawlResponseCheckpoint = checkpoints.get(targetKey(target, "crawl-response"));
    if (crawlResponseCheckpoint) {
      const value = parseCheckpoint(crawlResponseCheckpoint, CrawlResponseCheckpointSchema);
      markReachable(CLOUDFLARE_CRAWLER_METADATA.providerId, value.observability);
    }
    const enrichmentResponseCheckpoint = checkpoints.get(
      targetKey(target, "enrichment-response"),
    );
    if (enrichmentResponseCheckpoint) {
      const value = parseCheckpoint(
        enrichmentResponseCheckpoint,
        EnrichmentResponseCheckpointSchema,
      );
      markReachable(PERPLEXITY_ENRICHMENT_METADATA.providerId, value.observability);
    }
    const companyBriefResponseCheckpoint = checkpoints.get(
      targetKey(target, "company-brief-response"),
    );
    if (companyBriefResponseCheckpoint) {
      const value = parseCheckpoint(
        companyBriefResponseCheckpoint,
        CompanyBriefResponseCheckpointSchema,
      );
      markReachable(GEMINI_BRIEF_BUILDER_METADATA.providerId, value.observability);
    }
    const planningResponseCheckpoint = checkpoints.get(targetKey(target, "planning-response"));
    if (planningResponseCheckpoint) {
      const value = parseCheckpoint(planningResponseCheckpoint, PlanningResponseCheckpointSchema);
      markReachable(GEMINI_SLIDE_PLANNER_METADATA.providerId, value.observability);
    }
    const renderingResponseCheckpoint = checkpoints.get(targetKey(target, "render-response"));
    if (renderingResponseCheckpoint) {
      const value = parseCheckpoint(
        renderingResponseCheckpoint,
        RenderingResponseCheckpointSchema,
      );
      markReachable(presentonProviderMetadata.providerId, value.observability);
    }
  }

  return providerProvenance.map((provider) => {
    const values = retained.get(provider.providerId);
    const observability = mergeProviderCallObservability(values ?? []);
    return {
      ...provider,
      health: providerHealthSchema.parse({
        configured: true,
        reachable: values === undefined ? null : true,
        liveSmokePassed: null,
      }),
      ...(observability ?? {}),
    };
  });
}

async function buildReceipt(
  claimed: ClaimedRunJob,
  context: RunExecutionContext,
  dependencies: RunExecutorDependencies,
  checkpoints: Map<string, RunCheckpoint>,
  terminalState: TerminalRunState,
  executionContract: RunExecutionContract,
  clock: () => Date,
) {
  const createdAt = clock().toISOString();
  const attempts = await listRunAttempts(context.runId);
  const sourceUrls = unique(context.targets.flatMap((target) => {
    const enrichment = readTargetCheckpoint(
      checkpoints,
      target,
      "enrichment",
      EnrichmentCheckpointSchema,
    );
    return enrichment.outcome === "succeeded" ? enrichment.companyBrief.sourceUrls : [];
  })).map(sanitizeReceiptUrl);

  return parseRunReceipt({
    schemaVersion: 1,
    runId: context.runId,
    createdAt,
    commitSha: executionContract.commitSha,
    evidenceContract: {
      ledgerSchemaVersion: EVIDENCE_LEDGER_SCHEMA_VERSION,
      rubricVersion: EVIDENCE_RUBRIC_VERSION,
    },
    configurationNames: executionContract.configurationNames,
    providers: buildProviderReceipts(
      context,
      executionContract.providers,
      checkpoints,
    ),
    sourceUrls,
    attempts: attempts.map((attempt) => {
      if (attempt.id !== claimed.attempt.id) {
        return {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          ...(attempt.finishedAt ? { finishedAt: attempt.finishedAt } : {}),
        };
      }
      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: terminalState === "failed"
          ? "failed"
          : terminalState === "cancelled"
            ? "cancelled"
            : "completed",
        startedAt: attempt.startedAt,
        finishedAt: createdAt,
      };
    }),
    stageTimings: aggregateStageTimings(checkpoints),
    terminalState,
    targets: context.targets.map((target) => {
      const rendering = readTargetCheckpoint(
        checkpoints,
        target,
        "rendering",
        RenderingCheckpointSchema,
      );
      const planning = readTargetCheckpoint(
        checkpoints,
        target,
        "planning",
        PlanningCheckpointSchema,
      );
      const evaluation = planning.outcome === "ready" || planning.outcome === "blocked"
        ? planning.evidenceEvaluation
        : undefined;
      if (rendering.outcome === "delivered") {
        return {
          targetId: target.id,
          outcome: "delivered",
          evidenceCoverage: evaluation
            ? {
                supportedFactualClaims: evaluation.coverage.supportedFactualClaims,
                factualClaims: evaluation.coverage.factualClaims,
                ratio: evaluation.coverage.ratio,
              }
            : undefined,
          claimLedger: planning.outcome === "ready"
            ? redactEvidenceLedgerUrls(planning.plan.evidence)
            : undefined,
          unsupportedFactualClaimIds: evaluation?.unsupportedFactualClaimIds ?? [],
          readiness: rendering.readiness,
          artifact: {
            providerId: presentonProviderMetadata.providerId,
            presentationId: rendering.result.presentationId,
            urls: unique([
              rendering.result.editorUrl,
              rendering.result.exportUrl,
            ].filter((value): value is string => Boolean(value))).map(
              sanitizeArtifactReceiptUrl,
            ),
            sha256: rendering.verification.sha256,
            byteLength: rendering.verification.byteLength,
            ...(rendering.verification.contentType
              ? { contentType: rendering.verification.contentType }
              : {}),
            verifiedAt: rendering.verification.verifiedAt,
            contentVerification: rendering.verification.contentVerification,
            visualProfile: rendering.verification.visualProfile,
            ...(rendering.result.usage ? { usage: rendering.result.usage } : {}),
          },
        };
      }
      return {
        targetId: target.id,
        outcome: rendering.outcome,
        evidenceCoverage: evaluation
          ? {
              supportedFactualClaims: evaluation.coverage.supportedFactualClaims,
              factualClaims: evaluation.coverage.factualClaims,
              ratio: evaluation.coverage.ratio,
            }
          : undefined,
        claimLedger: planning.outcome === "ready" || planning.outcome === "blocked"
          ? planning.plan
            ? redactEvidenceLedgerUrls(planning.plan.evidence)
            : undefined
          : undefined,
        unsupportedFactualClaimIds: evaluation?.unsupportedFactualClaimIds ?? [],
        readiness: rendering.readiness,
        errorCode: rendering.errorCode,
      };
    }),
  });
}

function determineTerminalState(
  targets: RunExecutionTarget[],
  checkpoints: Map<string, RunCheckpoint>,
): TerminalRunState {
  const delivered = targets.filter((target) =>
    readTargetCheckpoint(
      checkpoints,
      target,
      "rendering",
      RenderingCheckpointSchema,
    ).outcome === "delivered"
  ).length;
  if (delivered === targets.length) return "delivered";
  return delivered > 0 ? "partially_completed" : "failed";
}

async function recordIndeterminateProviderOutcome(
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  stage: "crawling" | "enriching" | "planning",
  errorCode: string,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const metadata = {
    outcome: "failed" as const,
    errorCode,
    timing: instantTiming(clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    stage,
    metadata,
    checkpoints,
    clock,
  );
  await addRunEvent(context.runId, {
    targetId: target.id,
    idempotencyKey: `${key}:indeterminate`,
    stage,
    level: "error",
    message: "Provider work was not retried because an earlier external dispatch has no durable response.",
  });
}

async function recordTargetFailure(
  error: unknown,
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  stage: "crawling" | "enriching" | "planning",
  startedAt: Date,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  if (isRetryableError(error) || isRunFatalError(error)) throw error;
  const errorCode = safeErrorCode(error);
  const metadata = {
    outcome: "failed" as const,
    errorCode,
    timing: completeTiming(startedAt, clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    stage,
    metadata,
    checkpoints,
    clock,
  );
  await addRunEvent(context.runId, {
    targetId: target.id,
    idempotencyKey: `${key}:failed`,
    stage,
    level: "error",
    message: `Target stage failed (${errorCode}).`,
  });
}

async function recordRenderingFailure(
  error: unknown,
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  planning: Extract<PlanningCheckpoint, { outcome: "ready" }>,
  startedAt: Date,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  if (isRunFatalError(error)) throw error;
  if (isRetryableError(error)) {
    const job = await getRunJob(lease.runId);
    const dispatchCheckpoint = checkpoints.get(targetKey(target, "render-dispatch"));
    const responseCheckpoint = checkpoints.get(targetKey(target, "render-response"));
    const finalAttempt = job?.currentAttemptId === lease.attemptId
      && job.attemptCount >= job.maxAttempts;
    if (finalAttempt) {
      if (dispatchCheckpoint && !responseCheckpoint) {
        // There is no safe retry left and repeating this paid side effect could
        // create a duplicate deck. Commit the ambiguity as the target's honest
        // terminal outcome while the final lease still owns the run.
        await recordIndeterminateRenderingOutcome(
          lease,
          context,
          target,
          key,
          planning,
          checkpoints,
          clock,
        );
        return;
      }

      // A durable renderer response makes the paid side effect resumable, but
      // verification can still exhaust its retry budget. Commit only this
      // target as failed so earlier verified targets remain deliverable and
      // the normal terminal reducer can produce `partially_completed`.
      const errorCode = safeErrorCode(error);
      await commitTargetCheckpoint(
        lease,
        target,
        key,
        "rendering",
        {
          outcome: "failed",
          errorCode,
          readiness: planning.readiness,
          timing: completeTiming(startedAt, clock()),
        } satisfies RenderingCheckpoint,
        checkpoints,
        clock,
      );
      await addRunEvent(context.runId, {
        targetId: target.id,
        idempotencyKey: `${key}:retries-exhausted`,
        stage: "rendering",
        level: "error",
        message: `Target artifact verification exhausted retries (${errorCode}).`,
      });
      return;
    }
    throw error;
  }
  const errorCode = safeErrorCode(error);
  const metadata: RenderingCheckpoint = {
    outcome: "failed",
    errorCode,
    readiness: planning.readiness,
    timing: completeTiming(startedAt, clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    "rendering",
    metadata,
    checkpoints,
    clock,
  );
}

async function recordPlanningBlocked(
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  errorCode: string,
  plan: SlidePlan | undefined,
  evidenceEvaluation: EvidenceEvaluation | undefined,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const metadata: PlanningCheckpoint = {
    outcome: "blocked",
    ...(plan ? { plan } : {}),
    ...(evidenceEvaluation ? { evidenceEvaluation } : {}),
    readiness: emptyReadiness(),
    errorCode,
    timing: instantTiming(clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    "planning",
    metadata,
    checkpoints,
    clock,
  );
}

async function recordSkippedTarget(
  lease: RunLease,
  context: RunExecutionContext,
  target: RunExecutionTarget,
  key: string,
  stage: "enriching",
  errorCode: string,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const metadata = {
    outcome: "failed" as const,
    errorCode,
    timing: instantTiming(clock()),
  };
  await commitTargetCheckpoint(
    lease,
    target,
    key,
    stage,
    metadata,
    checkpoints,
    clock,
  );
}

function resolveLeaseExecutionOptions(
  options: RunLeaseExecutionOptions,
): ResolvedLeaseExecutionOptions {
  const leaseDurationMs = options.leaseDurationMs ?? WORKER_LEASE_MS;
  if (
    !Number.isInteger(leaseDurationMs)
    || leaseDurationMs < 3
    || leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new RangeError("Worker lease duration is invalid.");
  }
  const maxHeartbeatInterval = Math.max(1, Math.floor(leaseDurationMs / 2));
  const leaseHeartbeatIntervalMs = options.leaseHeartbeatIntervalMs
    ?? Math.min(DEFAULT_LEASE_HEARTBEAT_INTERVAL_MS, Math.floor(leaseDurationMs / 3));
  if (
    !Number.isInteger(leaseHeartbeatIntervalMs)
    || leaseHeartbeatIntervalMs < 1
    || leaseHeartbeatIntervalMs > maxHeartbeatInterval
  ) {
    throw new RangeError("Worker lease heartbeat interval is invalid.");
  }
  return { leaseDurationMs, leaseHeartbeatIntervalMs };
}

async function renewLeaseAndHandleCancellation(
  lease: RunLease,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  const job = await heartbeatRunJob(lease, leaseOptions.leaseDurationMs, { now: clock() });
  if (!job) throw new LeaseLostError();
  if (!job.cancelRequestedAt) return;
  const cancelled = await completeRunJob(lease, "cancelled", {
    now: clock(),
    error: "Run cancellation was requested.",
  });
  if (!cancelled) throw new LeaseLostError();
  await addRunEvent(lease.runId, {
    idempotencyKey: "run-cancelled-v1",
    stage: job.state,
    level: "info",
    message: "Run cancellation completed by the durable worker.",
  });
  throw new CancellationHandled();
}

async function guardLeaseAndCancellation(
  lease: RunLease,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  await renewLeaseAndHandleCancellation(lease, clock, leaseOptions);
}

async function runExternalProviderOperation<T>(
  lease: RunLease,
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let fatalError: LeaseLostError | CancellationHandled | undefined;
  let heartbeatInFlight: Promise<void> | undefined;
  let rejectMonitor: (error: unknown) => void = () => undefined;
  const monitorFailure = new Promise<never>((_resolve, reject) => {
    rejectMonitor = reject;
  });

  const fail = (error: unknown) => {
    if (fatalError) return;
    fatalError = error instanceof CancellationHandled || error instanceof LeaseLostError
      ? error
      : new LeaseLostError();
    // Reject the race before abort listeners can translate the same event into
    // a provider-specific network error.
    rejectMonitor(fatalError);
    controller.abort(fatalError);
  };
  const heartbeat = () => {
    if (heartbeatInFlight || fatalError) return;
    heartbeatInFlight = renewLeaseAndHandleCancellation(lease, clock, leaseOptions)
      .catch(fail)
      .finally(() => {
        heartbeatInFlight = undefined;
      });
  };
  const timer = setInterval(heartbeat, leaseOptions.leaseHeartbeatIntervalMs);

  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  // If lease loss wins the race, retain a rejection handler while the aborted
  // transport unwinds in the background.
  void operationPromise.catch(() => undefined);
  let result: T | undefined;
  let operationError: unknown;
  let succeeded = false;
  try {
    result = await Promise.race([operationPromise, monitorFailure]);
    succeeded = true;
  } catch (error) {
    operationError = error;
  } finally {
    clearInterval(timer);
    const pendingHeartbeat = heartbeatInFlight;
    if (pendingHeartbeat) await pendingHeartbeat;
  }

  if (fatalError) throw fatalError;
  if (!succeeded) throw operationError;
  return result as T;
}

async function moveTo(
  lease: RunLease,
  state: "crawling" | "enriching" | "brief_ready" | "planning" | "rendering",
  clock: () => Date,
  leaseOptions: ResolvedLeaseExecutionOptions,
) {
  const moved = await transitionRunJob(lease, state, { now: clock() });
  if (moved) return moved.state;
  const current = await getRunJob(lease.runId);
  if (current?.cancelRequestedAt) {
    await guardLeaseAndCancellation(lease, clock, leaseOptions);
  }
  throw new LeaseLostError();
}

async function recordCheckpoint(
  lease: RunLease,
  checkpointKey: string,
  stage: DurableRunState,
  metadata: unknown,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const completed = await completeRunCheckpoint(lease, {
    checkpointKey,
    stage,
    metadata,
    now: clock(),
  });
  if (!completed) throw new LeaseLostError();
  checkpoints.set(checkpointKey, completed.checkpoint);
}

async function commitTargetCheckpoint(
  lease: RunLease,
  target: RunExecutionTarget,
  checkpointKey: string,
  stage: "crawling" | "enriching" | "planning" | "rendering",
  metadata: unknown,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const completed = await commitRunTargetCheckpoint(lease, {
    checkpointKey,
    stage,
    targetId: target.id,
    metadata,
    now: clock(),
  });
  if (!completed) throw new LeaseLostError();
  checkpoints.set(checkpointKey, completed.checkpoint);
}

async function projectTargetForLease(
  lease: RunLease,
  target: RunExecutionTarget,
  stage: "crawling" | "enriching" | "planning" | "rendering",
  values: {
    status: string;
    crawlProvider?: string | null;
    lastError?: string | null;
  },
  clock: () => Date,
) {
  const projected = await projectRunTargetForLease(lease, {
    stage,
    targetId: target.id,
    ...values,
    now: clock(),
  });
  if (!projected) throw new LeaseLostError();
}

async function commitSellerBrief(
  lease: RunLease,
  checkpointKey: string,
  metadata: unknown,
  checkpoints: Map<string, RunCheckpoint>,
  clock: () => Date,
) {
  const completed = await completeSellerBriefCheckpoint(lease, {
    checkpointKey,
    metadata,
    now: clock(),
  });
  if (!completed) throw new LeaseLostError();
  checkpoints.set(checkpointKey, completed.checkpoint);
}

function readTargetCheckpoint<T extends z.ZodTypeAny>(
  checkpoints: Map<string, RunCheckpoint>,
  target: RunExecutionTarget,
  stage: "crawl" | "enrichment" | "planning" | "rendering",
  schema: T,
): z.infer<T> {
  return parseCheckpoint(requiredCheckpoint(checkpoints, targetKey(target, stage)), schema);
}

function requiredCheckpoint(checkpoints: Map<string, RunCheckpoint>, key: string) {
  const checkpoint = checkpoints.get(key);
  if (!checkpoint) throw new CheckpointContractError();
  return checkpoint;
}

function parseCheckpoint<T extends z.ZodTypeAny>(checkpoint: RunCheckpoint, schema: T): z.infer<T> {
  const parsed = schema.safeParse(checkpoint.metadata);
  if (!parsed.success) throw new CheckpointContractError();
  return parsed.data;
}

function readProviderBoundary<T extends z.ZodTypeAny>(
  checkpoints: Map<string, RunCheckpoint>,
  dispatchKey: string,
  responseKey: string,
  expectedProviderId: string,
  responseSchema: T,
): {
  dispatch: z.infer<typeof ProviderDispatchCheckpointSchema> | undefined;
  response: z.infer<T> | undefined;
} {
  const dispatchCheckpoint = checkpoints.get(dispatchKey);
  const responseCheckpoint = checkpoints.get(responseKey);
  const dispatch = dispatchCheckpoint
    ? parseCheckpoint(dispatchCheckpoint, ProviderDispatchCheckpointSchema)
    : undefined;
  const response = responseCheckpoint
    ? parseCheckpoint(responseCheckpoint, responseSchema)
    : undefined;
  if (response && !dispatch) throw new CheckpointContractError();
  if (dispatch && dispatch.providerId !== expectedProviderId) {
    throw new CheckpointContractError();
  }
  return { dispatch, response };
}

function targetKey(
  target: RunExecutionTarget,
  stage:
    | "crawl"
    | "crawl-dispatch"
    | "crawl-job"
    | "crawl-response"
    | "enrichment"
    | "enrichment-dispatch"
    | "enrichment-response"
    | "company-brief-dispatch"
    | "company-brief-response"
    | "planning"
    | "planning-dispatch"
    | "planning-response"
    | "render-dispatch"
    | "render-response"
    | "rendering",
) {
  return `target:${target.id}:${stage}:v1`;
}

function buildCrawlRequest(websiteUrl: string) {
  const path = new URL(websiteUrl).pathname.replace(/\/+$/, "") || "/";
  const scoped = path !== "/";
  return {
    websiteUrl,
    maxPages: scoped ? 5 : 10,
    maxDepth: scoped ? 1 : 2,
    source: scoped ? "links" as const : "all" as const,
    requestedFormats: ["markdown"] as Array<"markdown">,
    includeExternalLinks: false,
    includeSubdomains: false,
    rejectResourceTypes: ["image", "media", "font", "stylesheet"],
  };
}

function normalizeCrawlResult(result: CrawlResult) {
  if (result.provider !== "cloudflare") {
    throw new TargetContractError("unexpected_crawl_provider");
  }
  return {
    provider: result.provider,
    pages: result.pages.map((page) => ({
      url: normalizePersistableSourceUrl(page.url),
      ...(page.title ? { title: page.title } : {}),
      ...(page.markdown ? { markdown: page.markdown } : {}),
      ...(page.statusCode ? { statusCode: page.statusCode } : {}),
    })),
    blockedUrls: unique(result.blockedUrls.map(normalizePersistableSourceUrl)),
    discoveredUrls: unique(result.discoveredUrls.map(normalizePersistableSourceUrl)),
    ...(result.rawJobId ? { rawJobId: result.rawJobId } : {}),
    ...(result.status ? { status: result.status } : {}),
  };
}

function buildDeckInput(
  questionnaire: IntakeRun["questionnaire"],
  companyBrief: CompanyBrief,
  sellerBrief: SellerDiscoveryResult,
): DeckGenerationInput {
  if (questionnaire.outputFormat !== "pptx") {
    throw new TargetContractError("unsupported_reference_output_format");
  }
  return {
    companyBrief,
    sellerPositioningSummary: sellerBrief.positioningSummary,
    archetype: questionnaire.archetype,
    customArchetypePrompt: questionnaire.customArchetypePrompt,
    objective: questionnaire.objective,
    audience: questionnaire.audience,
    cardCount: questionnaire.desiredCardCount,
    callToAction: questionnaire.callToAction,
    tone: questionnaire.tone,
    customTone: questionnaire.customTone,
    visualStyle: questionnaire.visualStyle,
    customVisualStyle: questionnaire.customVisualStyle,
    mustInclude: questionnaire.mustInclude,
    mustAvoid: questionnaire.mustAvoid,
    outputFormat: questionnaire.outputFormat,
    imagePolicy: questionnaire.imagePolicy,
    visualContentTypes: questionnaire.visualContentTypes,
    visualDensity: questionnaire.visualDensity,
  };
}

function sourceMetadataForTarget(
  target: RunExecutionTarget,
  checkpoints: Map<string, RunCheckpoint>,
): SlidePlannerInput["sourceMetadata"] {
  const crawl = readTargetCheckpoint(checkpoints, target, "crawl", CrawlCheckpointSchema);
  const enrichment = readTargetCheckpoint(
    checkpoints,
    target,
    "enrichment",
    EnrichmentCheckpointSchema,
  );
  if (crawl.outcome !== "succeeded" || enrichment.outcome !== "succeeded") return [];
  const records = [
    ...crawl.crawlResult.pages.map((page) => ({
      url: page.url,
      title: page.title ?? new URL(page.url).hostname,
      retrievedAt: crawl.timing.completedAt,
      provider: "cloudflare",
    })),
    ...enrichment.enrichment.evidence.map((item) => ({
      url: item.url,
      title: item.title,
      retrievedAt: enrichment.timing.completedAt,
      provider: "perplexity",
    })),
  ];
  return [...new Map(records.map((record) => [record.url, record])).values()];
}

function planContainsCta(plan: SlidePlan, callToAction: string) {
  const needle = normalizeText(callToAction);
  return plan.slides.some((slide) =>
    [slide.headline, ...slide.bulletPoints].some(
      (text) => normalizeText(text).includes(needle),
    )
  );
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function propagateIndeterminateCode(errorCode: string, fallback: string) {
  return errorCode.startsWith("indeterminate_") ? errorCode : fallback;
}

function completeTiming(startedAt: Date, completedAt: Date) {
  const durationMs = completedAt.getTime() - startedAt.getTime();
  if (durationMs < 0) throw new CheckpointContractError();
  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
  };
}

function instantTiming(at: Date) {
  return completeTiming(at, at);
}

function emptyReadiness() {
  return {
    requiredSlideFieldsPresent: false,
    ctaPresent: false,
    evidenceGatePassed: false,
    artifactReadable: false,
    providerProvenancePresent: false,
    visualProfileVerified: false,
  };
}

function aggregateStageTimings(checkpoints: Map<string, RunCheckpoint>) {
  const grouped = new Map<string, Array<z.infer<typeof TimingSchema>>>();
  for (const checkpoint of checkpoints.values()) {
    if (!["crawling", "enriching", "brief_ready", "planning", "rendering"].includes(
      checkpoint.stage,
    )) continue;
    const metadata = checkpoint.metadata as { timing?: unknown } | undefined;
    const parsed = TimingSchema.safeParse(metadata?.timing);
    if (!parsed.success) continue;
    const entries = grouped.get(checkpoint.stage) ?? [];
    entries.push(parsed.data);
    grouped.set(checkpoint.stage, entries);
  }

  return [...grouped.entries()].map(([stage, timings]) => {
    const startedAt = timings.map((timing) => timing.startedAt).sort()[0]!;
    const completedAt = timings.map((timing) => timing.completedAt).sort().at(-1)!;
    return {
      stage,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  });
}

function isRetryableError(error: unknown) {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable?: unknown }).retryable === true;
  }
  if (
    error instanceof z.ZodError
    || error instanceof WorkerConfigurationError
    || error instanceof CheckpointContractError
    || error instanceof TargetContractError
    || error instanceof TypeError
  ) return false;
  // Unknown operational failures receive bounded retries. This favors avoiding
  // false terminal completion while still exhausting deterministically.
  return true;
}

function isRunFatalError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "authentication" || code === "configuration";
}

function safeErrorCode(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const providerCode = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "unknown";
  return `${name}:${providerCode}`
    .replace(/[^A-Za-z0-9._:/-]/g, "_")
    .slice(0, 200);
}

function retryDelayMs(attemptNumber: number) {
  return Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attemptNumber - 1),
    MAX_WORKER_RETRY_DELAY_MS,
  );
}

function resolveCommitSha() {
  const value = process.env.BESTDECKS_COMMIT_SHA
    ?? process.env.RENDER_GIT_COMMIT
    ?? process.env.CF_PAGES_COMMIT_SHA;
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f0-9]{7,64}$/.test(normalized) ? normalized : null;
}

function redactEvidenceLedgerUrls<T extends {
  sources: Array<{ url: string }>;
}>(ledger: T): T {
  return {
    ...ledger,
    sources: ledger.sources.map((source) => ({
      ...source,
      url: sanitizeReceiptUrl(source.url),
    })),
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
