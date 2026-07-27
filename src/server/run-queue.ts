import { randomUUID } from "node:crypto";

import { z } from "zod";

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
} from "@/src/domain/run-receipt";
import {
  EVIDENCE_LEDGER_SCHEMA_VERSION,
  EVIDENCE_RUBRIC_VERSION,
  evidenceLedgerSchema,
  evaluateEvidence,
} from "@/src/domain/evidence";
import { visualProfileVerificationSchema } from "@/src/domain/visual-profile";
import { getDb, type DbSession } from "@/src/server/db";

export const durableRunStates = [
  "queued",
  "crawling",
  "enriching",
  "brief_ready",
  "planning",
  "rendering",
  "delivered",
  "partially_completed",
  "failed",
  "cancelled",
] as const;

export type DurableRunState = (typeof durableRunStates)[number];
export type ActiveRunState = Exclude<
  DurableRunState,
  "delivered" | "partially_completed" | "failed" | "cancelled"
>;
export type TerminalRunState = Extract<
  DurableRunState,
  "delivered" | "partially_completed" | "failed" | "cancelled"
>;

export const DEFAULT_MAX_RUN_ATTEMPTS = 5;
export const MAX_RUN_ATTEMPTS = 100;
export const MAX_LEASE_DURATION_MS = 15 * 60 * 1000;
export const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

const activeRunStates: ActiveRunState[] = [
  "queued",
  "crawling",
  "enriching",
  "brief_ready",
  "planning",
  "rendering",
];
const activeRunStateSet = new Set<DurableRunState>(activeRunStates);
const terminalRunStateSet = new Set<TerminalRunState>([
  "delivered",
  "partially_completed",
  "failed",
  "cancelled",
]);
const nextActiveState: Record<ActiveRunState, ActiveRunState | "delivered"> = {
  queued: "crawling",
  crawling: "enriching",
  enriching: "brief_ready",
  brief_ready: "planning",
  planning: "rendering",
  rendering: "delivered",
};

const ACTIVE_STATE_SQL = activeRunStates.map((state) => `'${state}'`).join(", ");
const MAX_EXHAUSTED_JOBS_PER_CLAIM = 100;

export const RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY = "run-execution-contract-v1";

const executionContractIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);

const executionProviderStageSchema = z.enum([
  "crawling",
  "enriching",
  "planning",
  "rendering",
]);

const runExecutionContractSchema = z.object({
  schemaVersion: z.literal(1),
  commitSha: z.string().regex(/^[a-f0-9]{7,64}$/u),
  configurationNames: z.array(executionContractIdentifierSchema)
    .min(1)
    .max(64)
    .transform((values) => [...new Set(values)].sort()),
  providers: z.array(z.object({
    stage: executionProviderStageSchema,
    providerId: executionContractIdentifierSchema,
    modelId: executionContractIdentifierSchema.nullable(),
    contractVersion: z.number().int().positive(),
  }).strict()).length(5).transform((providers) => [...providers].sort((left, right) =>
    left.stage.localeCompare(right.stage) || left.providerId.localeCompare(right.providerId)
  )),
  recordedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((contract, context) => {
  const expectedCounts = new Map([
    ["crawling", 1],
    ["enriching", 2],
    ["planning", 1],
    ["rendering", 1],
  ] as const);
  for (const [stage, expected] of expectedCounts) {
    const actual = contract.providers.filter((provider) => provider.stage === stage).length;
    if (actual !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Run execution contract requires ${expected} ${stage} provider record(s).`,
        path: ["providers"],
      });
    }
  }
  const keys = new Set<string>();
  contract.providers.forEach((provider, index) => {
    const key = `${provider.stage}\u0000${provider.providerId}`;
    if (keys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Run execution provider records must be unique by stage and provider ID.",
        path: ["providers", index],
      });
    }
    keys.add(key);
  });
});

export type RunExecutionContract = z.infer<typeof runExecutionContractSchema>;

export function parseRunExecutionContract(input: unknown): RunExecutionContract {
  return runExecutionContractSchema.parse(input);
}

const recoveryReadinessSchema = z.object({
  requiredSlideFieldsPresent: z.boolean(),
  ctaPresent: z.boolean(),
  evidenceGatePassed: z.boolean(),
  artifactReadable: z.boolean(),
  providerProvenancePresent: z.boolean(),
  visualProfileVerified: z.boolean(),
}).strict();

const recoveryTimingSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
}).strict();

const recoveryPlanningArtifactSchema = z.object({
  outcome: z.enum(["ready", "blocked", "failed"]),
  plan: z.object({ evidence: evidenceLedgerSchema }).passthrough().optional(),
  readiness: recoveryReadinessSchema.optional(),
  errorCode: executionContractIdentifierSchema.optional(),
  timing: recoveryTimingSchema.optional(),
}).passthrough();

const recoveryRenderingArtifactSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("delivered"),
    result: z.object({
      presentationId: executionContractIdentifierSchema,
      editorUrl: z.string().url().optional(),
      exportUrl: z.string().url().optional(),
      usage: z.object({
        unit: executionContractIdentifierSchema,
        amount: z.number().finite().nonnegative(),
      }).strict().optional(),
    }).passthrough(),
    verification: z.object({
      url: z.string().url(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      byteLength: z.number().int().positive(),
      contentType: z.string().trim().min(1).max(200).optional(),
      verifiedAt: z.string().datetime({ offset: true }),
      contentVerification: z.object({
        method: z.literal("pptx_ooxml_rich_static_v2"),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        slideCount: z.number().int().positive().max(60),
      }).strict(),
      visualProfile: visualProfileVerificationSchema,
    }).strict(),
    readiness: recoveryReadinessSchema,
    timing: recoveryTimingSchema.optional(),
  }).passthrough(),
  z.object({
    outcome: z.enum(["blocked", "failed"]),
    errorCode: executionContractIdentifierSchema,
    readiness: recoveryReadinessSchema,
    timing: recoveryTimingSchema.optional(),
  }).passthrough(),
]);

interface RecoveryTargetRow {
  id: string;
  status: string;
}

interface RecoveryArtifactRow {
  target_id: string;
  artifact_type: string;
  artifact_json: string;
}

export interface RunJob {
  runId: string;
  state: DurableRunState;
  attemptCount: number;
  maxAttempts: number;
  currentAttemptId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  nextAttemptAt: string;
  cancelRequestedAt?: string;
  lastError?: string;
  stateChangedAt: string;
  stateChangedByAttemptId?: string;
  terminalAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RunAttemptStatus =
  | "running"
  | "released"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export interface RunAttempt {
  id: string;
  runId: string;
  attemptNumber: number;
  leaseOwner: string;
  status: RunAttemptStatus;
  reclaimedFromAttemptId?: string;
  startedAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  finishedAt?: string;
  retryAt?: string;
  finalState?: DurableRunState;
  lastError?: string;
}

export interface RunCheckpoint {
  id: string;
  runId: string;
  checkpointKey: string;
  stage: DurableRunState;
  attemptId: string;
  metadata?: unknown;
  completedAt: string;
}

export interface RunJobTransition {
  id: string;
  runId: string;
  attemptId: string;
  fromState: DurableRunState;
  toState: DurableRunState;
  reason: string;
  createdAt: string;
}

export interface RunLease {
  runId: string;
  attemptId: string;
  leaseOwner: string;
}

export interface ClaimedRunJob {
  job: RunJob;
  attempt: RunAttempt;
  lease: RunLease;
}

export interface EnqueueRunJobOptions {
  now?: Date;
  nextAttemptAt?: Date;
  maxAttempts?: number;
}

export interface ClaimRunJobOptions {
  leaseOwner: string;
  leaseDurationMs: number;
  now?: Date;
}

export interface LeaseMutationOptions {
  now?: Date;
}

export interface ReleaseRunJobOptions extends LeaseMutationOptions {
  retryDelayMs: number;
  error?: string;
}

export interface ReleaseRunJobResult {
  job: RunJob;
  exhausted: boolean;
}

export interface CompleteRunJobOptions extends LeaseMutationOptions {
  error?: string;
  terminalArtifact?: {
    idempotencyKey: string;
    artifactType: string;
    artifactJson: unknown;
  };
}

export interface CompleteCheckpointOptions extends LeaseMutationOptions {
  checkpointKey: string;
  stage: DurableRunState;
  metadata?: unknown;
}

export interface CompleteCheckpointResult {
  checkpoint: RunCheckpoint;
  created: boolean;
}

export interface CommitRunTargetCheckpointOptions extends LeaseMutationOptions {
  checkpointKey: string;
  stage: "crawling" | "enriching" | "planning" | "rendering";
  targetId: string;
  metadata: unknown;
}

export interface ProjectRunTargetOptions extends LeaseMutationOptions {
  stage: "crawling" | "enriching" | "planning" | "rendering";
  targetId: string;
  status: string;
  crawlProvider?: string | null;
  lastError?: string | null;
}

export interface CompleteSellerBriefCheckpointOptions extends LeaseMutationOptions {
  checkpointKey: string;
  metadata: unknown;
}

interface RunJobRow {
  run_id: string;
  state: string;
  attempt_count: number | bigint;
  max_attempts: number | bigint;
  current_attempt_id: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  next_attempt_at: string;
  cancel_requested_at: string | null;
  last_error: string | null;
  state_changed_at: string;
  state_changed_by_attempt_id: string | null;
  terminal_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RunAttemptRow {
  id: string;
  run_id: string;
  attempt_number: number | bigint;
  lease_owner: string;
  status: RunAttemptStatus;
  reclaimed_from_attempt_id: string | null;
  started_at: string;
  heartbeat_at: string;
  lease_expires_at: string;
  finished_at: string | null;
  retry_at: string | null;
  final_state: string | null;
  last_error: string | null;
}

interface RunCheckpointRow {
  id: string;
  run_id: string;
  checkpoint_key: string;
  stage: string;
  attempt_id: string;
  metadata_json: string | null;
  completed_at: string;
}

interface RunJobTransitionRow {
  id: string;
  run_id: string;
  attempt_id: string;
  from_state: string;
  to_state: string;
  reason: string;
  created_at: string;
}

interface TargetStageProjection {
  artifactType: string;
  status: string;
  lastError: string | null;
  setCrawlProvider: boolean;
  crawlProvider: string | null;
}

function assertNonEmpty(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new RangeError(`${label} must not be empty.`);
  }
}

function validateLease(lease: RunLease) {
  assertNonEmpty(lease.runId, "lease.runId");
  assertNonEmpty(lease.attemptId, "lease.attemptId");
  assertNonEmpty(lease.leaseOwner, "lease.leaseOwner");
}

function toDate(value: Date | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Clock value must be a valid date.");
  }
  return date;
}

function toIso(value: Date | undefined) {
  return toDate(value).toISOString();
}

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function validateLeaseDuration(milliseconds: number) {
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > MAX_LEASE_DURATION_MS
  ) {
    throw new RangeError(
      `leaseDurationMs must be an integer between 1 and ${MAX_LEASE_DURATION_MS}.`,
    );
  }
}

function validateMaxAttempts(value: number | undefined) {
  const maxAttempts = value ?? DEFAULT_MAX_RUN_ATTEMPTS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_RUN_ATTEMPTS) {
    throw new RangeError(`maxAttempts must be an integer between 1 and ${MAX_RUN_ATTEMPTS}.`);
  }
  return maxAttempts;
}

function boundedRetryDelay(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("retryDelayMs must be finite.");
  }
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, Math.trunc(milliseconds)));
}

function isDurableRunState(value: string): value is DurableRunState {
  return (durableRunStates as readonly string[]).includes(value);
}

function parseRunState(value: string) {
  if (!isDurableRunState(value)) {
    throw new Error(`Persisted run job has an invalid state: ${value}`);
  }
  return value;
}

function optionalString(value: string | null) {
  return value ?? undefined;
}

function mapRunJob(row: RunJobRow): RunJob {
  return {
    runId: String(row.run_id),
    state: parseRunState(String(row.state)),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    currentAttemptId: optionalString(row.current_attempt_id),
    leaseOwner: optionalString(row.lease_owner),
    leaseExpiresAt: optionalString(row.lease_expires_at),
    nextAttemptAt: String(row.next_attempt_at),
    cancelRequestedAt: optionalString(row.cancel_requested_at),
    lastError: optionalString(row.last_error),
    stateChangedAt: String(row.state_changed_at),
    stateChangedByAttemptId: optionalString(row.state_changed_by_attempt_id),
    terminalAt: optionalString(row.terminal_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRunAttempt(row: RunAttemptRow): RunAttempt {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    attemptNumber: Number(row.attempt_number),
    leaseOwner: String(row.lease_owner),
    status: row.status,
    reclaimedFromAttemptId: optionalString(row.reclaimed_from_attempt_id),
    startedAt: String(row.started_at),
    heartbeatAt: String(row.heartbeat_at),
    leaseExpiresAt: String(row.lease_expires_at),
    finishedAt: optionalString(row.finished_at),
    retryAt: optionalString(row.retry_at),
    finalState: row.final_state ? parseRunState(row.final_state) : undefined,
    lastError: optionalString(row.last_error),
  };
}

function mapRunCheckpoint(row: RunCheckpointRow): RunCheckpoint {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    checkpointKey: String(row.checkpoint_key),
    stage: parseRunState(String(row.stage)),
    attemptId: String(row.attempt_id),
    metadata: row.metadata_json === null ? undefined : JSON.parse(row.metadata_json),
    completedAt: String(row.completed_at),
  };
}

function mapRunJobTransition(row: RunJobTransitionRow): RunJobTransition {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    attemptId: String(row.attempt_id),
    fromState: parseRunState(String(row.from_state)),
    toState: parseRunState(String(row.to_state)),
    reason: String(row.reason),
    createdAt: String(row.created_at),
  };
}

function requiredMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Target checkpoint metadata must be an object.");
  }
  return metadata as Record<string, unknown>;
}

function requiredErrorCode(metadata: Record<string, unknown>) {
  if (typeof metadata.errorCode !== "string" || metadata.errorCode.trim().length === 0) {
    throw new Error("Failed target checkpoint metadata requires an errorCode.");
  }
  return metadata.errorCode;
}

/**
 * Project authoritative target state from the checkpoint payload itself. This
 * makes replay repair deterministic: caller-supplied replay data can never
 * replace the first committed checkpoint's outcome.
 */
function targetStageProjection(
  stage: CommitRunTargetCheckpointOptions["stage"],
  metadata: unknown,
): TargetStageProjection {
  const record = requiredMetadataRecord(metadata);
  const outcome = record.outcome;
  switch (stage) {
    case "crawling":
      if (outcome === "succeeded") {
        return {
          artifactType: "crawl_result",
          status: "crawled",
          lastError: null,
          setCrawlProvider: true,
          crawlProvider: "cloudflare",
        };
      }
      if (outcome === "failed") {
        return {
          artifactType: "crawling_failure",
          status: "failed",
          lastError: requiredErrorCode(record),
          setCrawlProvider: true,
          crawlProvider: null,
        };
      }
      break;
    case "enriching":
      if (outcome === "succeeded") {
        return {
          artifactType: "company_brief",
          status: "brief_ready",
          lastError: null,
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      if (outcome === "failed") {
        return {
          artifactType: "enriching_failure",
          status: "failed",
          lastError: requiredErrorCode(record),
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      break;
    case "planning":
      if (outcome === "ready") {
        return {
          artifactType: "slide_plan",
          status: "planned",
          lastError: null,
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      if (outcome === "blocked") {
        return {
          artifactType: "planning_block",
          status: "blocked",
          lastError: requiredErrorCode(record),
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      if (outcome === "failed") {
        return {
          artifactType: "planning_failure",
          status: "failed",
          lastError: requiredErrorCode(record),
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      break;
    case "rendering":
      if (outcome === "delivered") {
        return {
          artifactType: "presentation_delivery",
          status: "delivered",
          lastError: null,
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      if (outcome === "blocked" || outcome === "failed") {
        return {
          artifactType: "render_failure",
          status: outcome,
          lastError: requiredErrorCode(record),
          setCrawlProvider: false,
          crawlProvider: null,
        };
      }
      break;
  }
  throw new Error(`Checkpoint outcome is invalid for target stage ${stage}.`);
}

async function findJob(transaction: DbSession, runId: string) {
  return transaction.execute("SELECT * FROM run_jobs WHERE run_id = ? LIMIT 1", [runId]) as
    Promise<RunJobRow | undefined>;
}

async function findOwnedActiveJob(
  transaction: DbSession,
  lease: RunLease,
  now: string,
) {
  return transaction.execute(
    `SELECT * FROM run_jobs
     WHERE run_id = ?
       AND current_attempt_id = ?
       AND lease_owner = ?
       AND lease_expires_at > ?
       AND state IN (${ACTIVE_STATE_SQL})
       AND EXISTS (
         SELECT 1 FROM run_attempts
         WHERE id = ?
           AND run_id = run_jobs.run_id
           AND lease_owner = ?
           AND status = 'running'
           AND lease_expires_at > ?
       )
     LIMIT 1`,
    [
      lease.runId,
      lease.attemptId,
      lease.leaseOwner,
      now,
      lease.attemptId,
      lease.leaseOwner,
      now,
    ],
  ) as Promise<RunJobRow | undefined>;
}

async function recordTransition(
  transaction: DbSession,
  input: {
    runId: string;
    attemptId: string;
    fromState: DurableRunState;
    toState: DurableRunState;
    reason: string;
    timestamp: string;
  },
) {
  await transaction.run(
    `INSERT INTO run_job_transitions (
       id, run_id, attempt_id, from_state, to_state, reason, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.runId,
      input.attemptId,
      input.fromState,
      input.toState,
      input.reason,
      input.timestamp,
    ],
  );
}

async function mirrorRunState(
  transaction: DbSession,
  runId: string,
  state: DurableRunState,
  timestamp: string,
  error: string | null,
) {
  await transaction.run(
    `UPDATE runs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
    [state, error, timestamp, runId],
  );
}

function terminalAttemptStatus(state: TerminalRunState): RunAttemptStatus {
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  return "completed";
}

async function revokeCancelledRunDelivery(
  transaction: DbSession,
  runId: string,
  timestamp: string,
  error: string,
) {
  // Cancellation means no output is publishable. Retain checkpoints and
  // artifacts for audit/recovery, but make every delivery projection and
  // public capability unreachable in the same terminal transaction.
  await transaction.run(
    `UPDATE run_targets
     SET status = 'cancelled', last_error = ?, updated_at = ?
     WHERE run_id = ?`,
    [error, timestamp, runId],
  );
  await transaction.run(
    `UPDATE shareable_decks
     SET is_active = 0
     WHERE run_id = ? AND is_active = 1`,
    [runId],
  );
}

async function failUnfinishedRunTargetProjections(
  transaction: DbSession,
  runId: string,
  timestamp: string,
  error: string,
) {
  await transaction.run(
    `UPDATE run_targets
     SET status = 'failed',
         last_error = COALESCE(last_error, ?),
         updated_at = ?
     WHERE run_id = ?
       AND status NOT IN ('delivered', 'blocked', 'failed', 'cancelled')`,
    [error, timestamp, runId],
  );
  await transaction.run(
    `UPDATE shareable_decks
     SET is_active = 0
     WHERE run_id = ?
       AND is_active = 1
       AND target_id IN (
         SELECT id FROM run_targets
         WHERE run_id = ? AND status <> 'delivered'
       )`,
    [runId, runId],
  );
}

function parsePersistedJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Persisted ${label} is not valid JSON.`);
  }
}

async function loadRecoveryTargets(
  transaction: DbSession,
  runId: string,
) {
  const targets = await transaction.executeAll(
    `SELECT id, status
     FROM run_targets
     WHERE run_id = ?
     ORDER BY target_ordinal ASC, id ASC`,
    [runId],
  ) as unknown as RecoveryTargetRow[];
  if (targets.length === 0) {
    throw new Error(`Run ${runId} cannot terminalize without target projections.`);
  }
  const artifactRows = await transaction.executeAll(
    `SELECT target_id, artifact_type, artifact_json
     FROM run_artifacts
     WHERE run_id = ?
       AND target_id IS NOT NULL
       AND artifact_type IN (
         'slide_plan', 'planning_block', 'planning_failure',
         'presentation_delivery', 'render_failure'
       )
     ORDER BY created_at ASC, id ASC`,
    [runId],
  ) as unknown as RecoveryArtifactRow[];
  const artifacts = new Map<string, RecoveryArtifactRow>();
  for (const artifact of artifactRows) {
    artifacts.set(`${artifact.target_id}\u0000${artifact.artifact_type}`, artifact);
  }
  return { targets, artifacts };
}

function recoveryArtifact(
  artifacts: Map<string, RecoveryArtifactRow>,
  targetId: string,
  artifactTypes: readonly string[],
) {
  for (const artifactType of artifactTypes) {
    const artifact = artifacts.get(`${targetId}\u0000${artifactType}`);
    if (artifact) return artifact;
  }
  return undefined;
}

async function deriveFailureTerminalState(
  transaction: DbSession,
  runId: string,
): Promise<Exclude<TerminalRunState, "cancelled">> {
  const { targets, artifacts } = await loadRecoveryTargets(transaction, runId);
  let delivered = 0;
  for (const target of targets) {
    if (target.status !== "delivered") continue;
    const artifact = recoveryArtifact(artifacts, target.id, ["presentation_delivery"]);
    const parsed = artifact
      ? recoveryRenderingArtifactSchema.safeParse(
          parsePersistedJson(artifact.artifact_json, "presentation delivery"),
        )
      : undefined;
    if (!parsed?.success || parsed.data.outcome !== "delivered") {
      throw new Error(
        `Delivered target ${target.id} has no valid authoritative delivery artifact.`,
      );
    }
    delivered += 1;
  }
  if (delivered === targets.length) return "delivered";
  return delivered > 0 ? "partially_completed" : "failed";
}

function redactRecoveryEvidenceLedger(input: unknown) {
  const ledger = evidenceLedgerSchema.parse(input);
  return {
    ...ledger,
    sources: ledger.sources.map((source) => ({
      ...source,
      url: sanitizeReceiptUrl(source.url),
    })),
  };
}

function aggregateRecoveryStageTimings(checkpoints: RunCheckpointRow[]) {
  const stages = new Set(["crawling", "enriching", "brief_ready", "planning", "rendering"]);
  const grouped = new Map<string, Array<z.infer<typeof recoveryTimingSchema>>>();
  for (const checkpoint of checkpoints) {
    if (!stages.has(checkpoint.stage) || checkpoint.metadata_json === null) continue;
    const metadata = parsePersistedJson(checkpoint.metadata_json, "checkpoint metadata");
    const timing = recoveryTimingSchema.safeParse(
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).timing
        : undefined,
    );
    if (!timing.success) continue;
    const entries = grouped.get(checkpoint.stage) ?? [];
    entries.push(timing.data);
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

function buildRecoveryProviderReceipts(
  contract: RunExecutionContract | undefined,
  checkpoints: RunCheckpointRow[],
) {
  if (!contract) return [];
  const metadataByKey = new Map<string, Record<string, unknown>>();
  for (const checkpoint of checkpoints) {
    if (checkpoint.metadata_json === null) continue;
    const metadata = parsePersistedJson(checkpoint.metadata_json, "checkpoint metadata");
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      metadataByKey.set(checkpoint.checkpoint_key, metadata as Record<string, unknown>);
    }
  }

  const providerIds = new Set(contract.providers.map((provider) => provider.providerId));
  const reachable = new Set<string>();
  const observability = new Map<string, ProviderCallObservability[]>();
  const mark = (providerId: unknown, metadata: Record<string, unknown>) => {
    if (typeof providerId !== "string" || !providerIds.has(providerId)) return;
    reachable.add(providerId);
    const parsed = providerCallObservabilitySchema.safeParse(metadata.observability);
    if (!parsed.success) return;
    const values = observability.get(providerId) ?? [];
    values.push(parsed.data);
    observability.set(providerId, values);
  };

  for (const [checkpointKey, metadata] of metadataByKey) {
    if (checkpointKey.endsWith(":crawl-job:v1")) {
      mark(metadata.providerId, metadata);
      continue;
    }
    const responseToDispatch = [
      [":crawl-response:v1", ":crawl-dispatch:v1"],
      [":enrichment-response:v1", ":enrichment-dispatch:v1"],
      [":company-brief-response:v1", ":company-brief-dispatch:v1"],
      [":planning-response:v1", ":planning-dispatch:v1"],
      [":render-response:v1", ":render-dispatch:v1"],
    ] as const;
    const pair = responseToDispatch.find(([suffix]) => checkpointKey.endsWith(suffix));
    if (!pair) continue;
    const dispatchKey = `${checkpointKey.slice(0, -pair[0].length)}${pair[1]}`;
    const dispatch = metadataByKey.get(dispatchKey);
    if (dispatch) mark(dispatch.providerId, metadata);
  }

  return contract.providers.map((provider) => {
    const retained = mergeProviderCallObservability(
      observability.get(provider.providerId) ?? [],
    );
    return {
      ...provider,
      health: providerHealthSchema.parse({
        configured: true,
        reachable: reachable.has(provider.providerId) ? true : null,
        liveSmokePassed: null,
      }),
      ...(retained ?? {}),
    };
  });
}

async function persistRecoveredTerminalReceipt(
  transaction: DbSession,
  input: {
    runId: string;
    terminalState: TerminalRunState;
    timestamp: string;
  },
) {
  const attempts = await transaction.executeAll(
    `SELECT id, attempt_number, status, started_at, finished_at
     FROM run_attempts
     WHERE run_id = ?
     ORDER BY attempt_number ASC`,
    [input.runId],
  ) as unknown as Array<{
    id: string;
    attempt_number: number | bigint;
    status: RunAttemptStatus;
    started_at: string;
    finished_at: string | null;
  }>;
  const checkpoints = await transaction.executeAll(
    `SELECT * FROM run_checkpoints
     WHERE run_id = ?
     ORDER BY completed_at ASC, id ASC`,
    [input.runId],
  ) as unknown as RunCheckpointRow[];
  const contractCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint.checkpoint_key === RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY,
  );
  const contract = contractCheckpoint?.metadata_json
    ? parseRunExecutionContract(
        parsePersistedJson(contractCheckpoint.metadata_json, "run execution contract"),
      )
    : undefined;
  if (
    (input.terminalState === "delivered" || input.terminalState === "partially_completed")
    && !contract
  ) {
    throw new Error("A recovered deliverable requires its retained run execution contract.");
  }

  const { targets, artifacts } = await loadRecoveryTargets(transaction, input.runId);
  const sourceUrls: string[] = [];
  const renderingProvider = contract?.providers.find(
    (provider) => provider.stage === "rendering",
  );
  const targetReceipts = targets.map((target) => {
    const planningArtifact = recoveryArtifact(artifacts, target.id, [
      "slide_plan",
      "planning_block",
      "planning_failure",
    ]);
    const renderingArtifact = recoveryArtifact(artifacts, target.id, [
      "presentation_delivery",
      "render_failure",
    ]);
    const planning = planningArtifact
      ? recoveryPlanningArtifactSchema.safeParse(
          parsePersistedJson(planningArtifact.artifact_json, "planning artifact"),
        )
      : undefined;
    const rendering = renderingArtifact
      ? recoveryRenderingArtifactSchema.safeParse(
          parsePersistedJson(renderingArtifact.artifact_json, "rendering artifact"),
        )
      : undefined;
    const claimLedger = planning?.success && planning.data.plan
      ? redactRecoveryEvidenceLedger(planning.data.plan.evidence)
      : undefined;
    const evidence = claimLedger ? evaluateEvidence(claimLedger) : undefined;
    if (claimLedger) sourceUrls.push(...claimLedger.sources.map((source) => source.url));

    if (
      target.status === "delivered"
      && rendering?.success
      && rendering.data.outcome === "delivered"
      && renderingProvider
    ) {
      const delivery = rendering.data;
      const urls = [
        delivery.result.editorUrl,
        delivery.result.exportUrl,
        delivery.verification.url,
      ].filter((value): value is string => Boolean(value))
        .map(sanitizeArtifactReceiptUrl);
      return {
        targetId: target.id,
        outcome: "delivered" as const,
        evidenceCoverage: evidence
          ? {
              supportedFactualClaims: evidence.coverage.supportedFactualClaims,
              factualClaims: evidence.coverage.factualClaims,
              ratio: evidence.coverage.ratio,
            }
          : undefined,
        claimLedger,
        unsupportedFactualClaimIds: evidence?.unsupportedFactualClaimIds ?? [],
        readiness: delivery.readiness,
        artifact: {
          providerId: renderingProvider.providerId,
          presentationId: delivery.result.presentationId,
          urls,
          sha256: delivery.verification.sha256,
          byteLength: delivery.verification.byteLength,
          ...(delivery.verification.contentType
            ? { contentType: delivery.verification.contentType }
            : {}),
          verifiedAt: delivery.verification.verifiedAt,
          contentVerification: delivery.verification.contentVerification,
          visualProfile: delivery.verification.visualProfile,
          ...(delivery.result.usage ? { usage: delivery.result.usage } : {}),
        },
      };
    }

    const renderingFailure = rendering?.success && rendering.data.outcome !== "delivered"
      ? rendering.data
      : undefined;
    const planningFailure = planning?.success && planning.data.outcome !== "ready"
      ? planning.data
      : undefined;
    const outcome = input.terminalState !== "cancelled"
      && (renderingFailure?.outcome === "blocked"
        || planningFailure?.outcome === "blocked"
        || target.status === "blocked")
      ? "blocked" as const
      : "failed" as const;
    return {
      targetId: target.id,
      outcome,
      ...(evidence
        ? {
            evidenceCoverage: {
              supportedFactualClaims: evidence.coverage.supportedFactualClaims,
              factualClaims: evidence.coverage.factualClaims,
              ratio: evidence.coverage.ratio,
            },
          }
        : {}),
      ...(claimLedger ? { claimLedger } : {}),
      unsupportedFactualClaimIds: evidence?.unsupportedFactualClaimIds ?? [],
      readiness: renderingFailure?.readiness
        ?? (planning?.success ? planning.data.readiness : undefined)
        ?? {
          requiredSlideFieldsPresent: false,
          ctaPresent: false,
          evidenceGatePassed: false,
          artifactReadable: false,
          providerProvenancePresent: false,
          visualProfileVerified: false,
        },
      errorCode: input.terminalState === "cancelled"
        ? "run_cancelled"
        : renderingFailure?.errorCode ?? planningFailure?.errorCode ?? "terminal_failure",
    };
  });

  const receipt = parseRunReceipt({
    schemaVersion: 1,
    runId: input.runId,
    createdAt: input.timestamp,
    commitSha: contract?.commitSha ?? null,
    evidenceContract: {
      ledgerSchemaVersion: EVIDENCE_LEDGER_SCHEMA_VERSION,
      rubricVersion: EVIDENCE_RUBRIC_VERSION,
    },
    configurationNames: contract?.configurationNames ?? [],
    providers: buildRecoveryProviderReceipts(contract, checkpoints),
    sourceUrls: [...new Set(sourceUrls)].sort(),
    attempts: attempts.map((attempt) => ({
      attemptId: attempt.id,
      attemptNumber: Number(attempt.attempt_number),
      status: attempt.status,
      startedAt: attempt.started_at,
      ...(attempt.finished_at ? { finishedAt: attempt.finished_at } : {}),
    })),
    stageTimings: aggregateRecoveryStageTimings(checkpoints),
    terminalState: input.terminalState,
    targets: targetReceipts,
  });
  await transaction.run(
    `INSERT INTO run_artifacts (
       id, run_id, target_id, idempotency_key, artifact_type, artifact_json, created_at
     ) VALUES (?, ?, NULL, 'run-receipt-v1', 'run_receipt', ?, ?)
     ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET
       target_id = NULL,
       artifact_type = excluded.artifact_type,
       artifact_json = excluded.artifact_json`,
    [randomUUID(), input.runId, JSON.stringify(receipt), input.timestamp],
  );
}

async function completeWithinTransaction(
  transaction: DbSession,
  jobRow: RunJobRow,
  lease: RunLease,
  terminalState: TerminalRunState,
  timestamp: string,
  error?: string,
  options: {
    persistFallbackReceipt: boolean;
    attemptStatus?: RunAttemptStatus;
  } = { persistFallbackReceipt: true },
) {
  const currentState = parseRunState(jobRow.state);
  const resolvedTerminalState = terminalState === "failed"
    ? await deriveFailureTerminalState(transaction, lease.runId)
    : terminalState;
  const resolvedError = resolvedTerminalState === "delivered"
    ? null
    : error
      ?? jobRow.last_error
      ?? (resolvedTerminalState === "cancelled" ? "Run cancelled." : null);

  const updated = await transaction.execute(
    `UPDATE run_jobs
     SET state = ?,
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_error = ?,
         state_changed_at = ?,
         state_changed_by_attempt_id = ?,
         terminal_at = ?,
         updated_at = ?
     WHERE run_id = ?
       AND current_attempt_id = ?
       AND lease_owner = ?
       AND lease_expires_at > ?
       AND state = ?
     RETURNING *`,
    [
      resolvedTerminalState,
      resolvedError,
      timestamp,
      lease.attemptId,
      timestamp,
      timestamp,
      lease.runId,
      lease.attemptId,
      lease.leaseOwner,
      timestamp,
      currentState,
    ],
  ) as RunJobRow | undefined;

  if (!updated) return null;

  await mirrorRunState(
    transaction,
    lease.runId,
    resolvedTerminalState,
    timestamp,
    resolvedError,
  );
  if (resolvedTerminalState === "cancelled") {
    await revokeCancelledRunDelivery(
      transaction,
      lease.runId,
      timestamp,
      resolvedError ?? "Run cancelled.",
    );
  } else if (terminalState === "failed") {
    await failUnfinishedRunTargetProjections(
      transaction,
      lease.runId,
      timestamp,
      resolvedError ?? "Run failed.",
    );
  }

  const updatedAttempt = await transaction.execute(
    `UPDATE run_attempts
     SET status = ?, finished_at = ?, final_state = ?, last_error = ?
     WHERE id = ? AND run_id = ? AND lease_owner = ? AND status = 'running'
     RETURNING id`,
    [
      options.attemptStatus ?? terminalAttemptStatus(resolvedTerminalState),
      timestamp,
      resolvedTerminalState,
      resolvedError,
      lease.attemptId,
      lease.runId,
      lease.leaseOwner,
    ],
  );

  if (!updatedAttempt) {
    throw new Error(`Run attempt ${lease.attemptId} disappeared during terminal completion.`);
  }

  if (options.persistFallbackReceipt) {
    await persistRecoveredTerminalReceipt(transaction, {
      runId: lease.runId,
      terminalState: resolvedTerminalState,
      timestamp,
    });
  }

  await recordTransition(transaction, {
    runId: lease.runId,
    attemptId: lease.attemptId,
    fromState: currentState,
    toState: resolvedTerminalState,
    reason: "terminal_completion",
    timestamp,
  });

  return mapRunJob(updated);
}

async function terminalizeExpiredExhaustedJob(
  transaction: DbSession,
  jobRow: RunJobRow,
  timestamp: string,
) {
  if (!jobRow.current_attempt_id) {
    throw new Error(`Run job ${jobRow.run_id} exhausted attempts without an attributable attempt.`);
  }

  const currentState = parseRunState(jobRow.state);
  const terminalState: TerminalRunState = jobRow.cancel_requested_at ? "cancelled" : "failed";
  const error = terminalState === "cancelled"
    ? "Run cancelled after its final lease expired."
    : "Run exhausted its maximum attempts after a lease expired.";
  const resolvedTerminalState = terminalState === "failed"
    ? await deriveFailureTerminalState(transaction, String(jobRow.run_id))
    : terminalState;
  const resolvedError = resolvedTerminalState === "delivered" ? null : error;

  const updated = await transaction.execute(
    `UPDATE run_jobs
     SET state = ?,
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_error = ?,
         state_changed_at = ?,
         state_changed_by_attempt_id = ?,
         terminal_at = ?,
         updated_at = ?
     WHERE run_id = ?
       AND state = ?
       AND current_attempt_id = ?
       AND attempt_count >= max_attempts
       AND lease_owner IS ?
       AND lease_expires_at IS ?
       AND lease_expires_at <= ?
     RETURNING run_id`,
    [
      resolvedTerminalState,
      resolvedError,
      timestamp,
      jobRow.current_attempt_id,
      timestamp,
      timestamp,
      jobRow.run_id,
      currentState,
      jobRow.current_attempt_id,
      jobRow.lease_owner,
      jobRow.lease_expires_at,
      timestamp,
    ],
  );

  if (!updated) return false;

  await mirrorRunState(
    transaction,
    String(jobRow.run_id),
    resolvedTerminalState,
    timestamp,
    resolvedError,
  );
  if (resolvedTerminalState === "cancelled") {
    await revokeCancelledRunDelivery(
      transaction,
      String(jobRow.run_id),
      timestamp,
      resolvedError ?? "Run cancelled.",
    );
  } else {
    await failUnfinishedRunTargetProjections(
      transaction,
      String(jobRow.run_id),
      timestamp,
      resolvedError ?? "Run failed.",
    );
  }

  const attempt = await transaction.execute(
    `UPDATE run_attempts
     SET status = ?, finished_at = ?, final_state = ?, last_error = ?
     WHERE id = ? AND run_id = ? AND status = 'running'
     RETURNING id`,
    [
      "expired",
      timestamp,
      resolvedTerminalState,
      resolvedError,
      jobRow.current_attempt_id,
      jobRow.run_id,
    ],
  );
  if (!attempt) {
    throw new Error(`Run attempt ${jobRow.current_attempt_id} disappeared during exhaustion.`);
  }


  await persistRecoveredTerminalReceipt(transaction, {
    runId: String(jobRow.run_id),
    terminalState: resolvedTerminalState,
    timestamp,
  });

  await recordTransition(transaction, {
    runId: jobRow.run_id,
    attemptId: jobRow.current_attempt_id,
    fromState: currentState,
    toState: resolvedTerminalState,
    reason: "attempts_exhausted",
    timestamp,
  });
  return true;
}

async function claimWithinTransaction(
  transaction: DbSession,
  runId: string,
  options: ClaimRunJobOptions,
  now: Date,
): Promise<ClaimedRunJob | "exhausted" | null> {
  const timestamp = now.toISOString();
  const candidate = await transaction.execute(
    `SELECT * FROM run_jobs
     WHERE run_id = ?
       AND state IN (${ACTIVE_STATE_SQL})
       AND next_attempt_at <= ?
       AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)
     LIMIT 1`,
    [runId, timestamp, timestamp],
  ) as RunJobRow | undefined;

  if (!candidate) return null;

  if (Number(candidate.attempt_count) >= Number(candidate.max_attempts)) {
    const terminalized = await terminalizeExpiredExhaustedJob(transaction, candidate, timestamp);
    return terminalized ? "exhausted" : null;
  }

  const previousAttemptId = candidate.current_attempt_id;
  const attemptId = randomUUID();
  const leaseExpiresAt = addMilliseconds(now, options.leaseDurationMs);
  const updated = await transaction.execute(
    `UPDATE run_jobs
     SET attempt_count = attempt_count + 1,
         current_attempt_id = ?,
         lease_owner = ?,
         lease_expires_at = ?,
         updated_at = ?
     WHERE run_id = ?
       AND state IN (${ACTIVE_STATE_SQL})
       AND attempt_count = ?
       AND current_attempt_id IS ?
       AND lease_owner IS ?
       AND lease_expires_at IS ?
       AND next_attempt_at <= ?
       AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)
     RETURNING *`,
    [
      attemptId,
      options.leaseOwner,
      leaseExpiresAt,
      timestamp,
      runId,
      Number(candidate.attempt_count),
      candidate.current_attempt_id,
      candidate.lease_owner,
      candidate.lease_expires_at,
      timestamp,
      timestamp,
    ],
  ) as RunJobRow | undefined;

  if (!updated) return null;

  if (previousAttemptId) {
    const expired = await transaction.execute(
      `UPDATE run_attempts
       SET status = 'expired', finished_at = ?, final_state = ?,
           last_error = 'Lease expired before completion.'
       WHERE id = ? AND run_id = ? AND status = 'running'
       RETURNING id`,
      [timestamp, candidate.state, previousAttemptId, runId],
    );
    if (!expired) {
      throw new Error(`Run attempt ${previousAttemptId} disappeared during lease recovery.`);
    }
  }

  const attemptRow = await transaction.execute(
    `INSERT INTO run_attempts (
       id, run_id, attempt_number, lease_owner, status, reclaimed_from_attempt_id,
       started_at, heartbeat_at, lease_expires_at
     ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)
     RETURNING *`,
    [
      attemptId,
      runId,
      Number(updated.attempt_count),
      options.leaseOwner,
      previousAttemptId,
      timestamp,
      timestamp,
      leaseExpiresAt,
    ],
  ) as RunAttemptRow | undefined;

  if (!attemptRow) {
    throw new Error(`Failed to persist attempt ${attemptId} for run ${runId}.`);
  }

  return {
    job: mapRunJob(updated),
    attempt: mapRunAttempt(attemptRow),
    lease: { runId, attemptId, leaseOwner: options.leaseOwner },
  };
}

export async function enqueueRunJob(
  runId: string,
  options: EnqueueRunJobOptions = {},
): Promise<RunJob> {
  assertNonEmpty(runId, "runId");
  const now = toDate(options.now);
  const timestamp = now.toISOString();
  const nextAttemptAt = toIso(options.nextAttemptAt ?? now);
  const maxAttempts = validateMaxAttempts(options.maxAttempts);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const inserted = await transaction.execute(
      `INSERT INTO run_jobs (
         run_id, state, attempt_count, max_attempts, next_attempt_at,
         state_changed_at, created_at, updated_at
       ) VALUES (?, 'queued', 0, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO NOTHING
       RETURNING *`,
      [runId, maxAttempts, nextAttemptAt, timestamp, timestamp, timestamp],
    ) as RunJobRow | undefined;

    if (inserted) return mapRunJob(inserted);

    const existing = await findJob(transaction, runId);
    if (!existing) {
      throw new Error(`Run job ${runId} could not be created or loaded.`);
    }
    return mapRunJob(existing);
  });
}

export async function getRunJob(runId: string): Promise<RunJob | null> {
  assertNonEmpty(runId, "runId");
  const db = await getDb();
  const row = await findJob(db, runId);
  return row ? mapRunJob(row) : null;
}

export async function claimRunJob(
  runId: string,
  options: ClaimRunJobOptions,
): Promise<ClaimedRunJob | null> {
  assertNonEmpty(runId, "runId");
  assertNonEmpty(options.leaseOwner, "leaseOwner");
  validateLeaseDuration(options.leaseDurationMs);
  const now = toDate(options.now);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const result = await claimWithinTransaction(transaction, runId, options, now);
    return result === "exhausted" ? null : result;
  });
}

export async function claimNextRunJob(
  options: ClaimRunJobOptions,
): Promise<ClaimedRunJob | null> {
  assertNonEmpty(options.leaseOwner, "leaseOwner");
  validateLeaseDuration(options.leaseDurationMs);
  const now = toDate(options.now);
  const timestamp = now.toISOString();
  const db = await getDb();

  return db.transaction(async (transaction) => {
    for (let scanned = 0; scanned < MAX_EXHAUSTED_JOBS_PER_CLAIM; scanned += 1) {
      const candidate = await transaction.execute(
        `SELECT run_id FROM run_jobs
         WHERE state IN (${ACTIVE_STATE_SQL})
           AND next_attempt_at <= ?
           AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)
         ORDER BY next_attempt_at ASC, created_at ASC, run_id ASC
         LIMIT 1`,
        [timestamp, timestamp],
      ) as { run_id: string } | undefined;

      if (!candidate) return null;
      const result = await claimWithinTransaction(
        transaction,
        String(candidate.run_id),
        options,
        now,
      );
      if (result === "exhausted") continue;
      return result;
    }
    return null;
  });
}

export async function heartbeatRunJob(
  lease: RunLease,
  leaseDurationMs: number,
  options: LeaseMutationOptions = {},
): Promise<RunJob | null> {
  validateLease(lease);
  validateLeaseDuration(leaseDurationMs);
  const now = toDate(options.now);
  const timestamp = now.toISOString();
  const leaseExpiresAt = addMilliseconds(now, leaseDurationMs);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const updated = await transaction.execute(
      `UPDATE run_jobs
       SET lease_expires_at = ?, updated_at = ?
       WHERE run_id = ?
         AND current_attempt_id = ?
         AND lease_owner = ?
         AND lease_expires_at > ?
         AND state IN (${ACTIVE_STATE_SQL})
       RETURNING *`,
      [
        leaseExpiresAt,
        timestamp,
        lease.runId,
        lease.attemptId,
        lease.leaseOwner,
        timestamp,
      ],
    ) as RunJobRow | undefined;

    if (!updated) return null;

    const attempt = await transaction.execute(
      `UPDATE run_attempts
       SET heartbeat_at = ?, lease_expires_at = ?
       WHERE id = ? AND run_id = ? AND lease_owner = ? AND status = 'running'
       RETURNING id`,
      [timestamp, leaseExpiresAt, lease.attemptId, lease.runId, lease.leaseOwner],
    );
    if (!attempt) {
      throw new Error(`Run attempt ${lease.attemptId} disappeared during heartbeat.`);
    }
    return mapRunJob(updated);
  });
}

export async function transitionRunJob(
  lease: RunLease,
  nextState: ActiveRunState,
  options: LeaseMutationOptions = {},
): Promise<RunJob | null> {
  validateLease(lease);
  if (!activeRunStateSet.has(nextState)) {
    throw new RangeError(`Use completeRunJob for terminal state ${nextState}.`);
  }
  const timestamp = toIso(options.now);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (!owned || owned.cancel_requested_at) return null;

    const currentState = parseRunState(owned.state) as ActiveRunState;
    if (nextActiveState[currentState] !== nextState) {
      throw new RangeError(`Invalid durable run transition: ${currentState} -> ${nextState}.`);
    }

    const updated = await transaction.execute(
      `UPDATE run_jobs
       SET state = ?, state_changed_at = ?, state_changed_by_attempt_id = ?, updated_at = ?
       WHERE run_id = ?
         AND current_attempt_id = ?
         AND lease_owner = ?
         AND lease_expires_at > ?
         AND state = ?
         AND cancel_requested_at IS NULL
       RETURNING *`,
      [
        nextState,
        timestamp,
        lease.attemptId,
        timestamp,
        lease.runId,
        lease.attemptId,
        lease.leaseOwner,
        timestamp,
        currentState,
      ],
    ) as RunJobRow | undefined;
    if (!updated) return null;

    await mirrorRunState(transaction, lease.runId, nextState, timestamp, null);

    await recordTransition(transaction, {
      runId: lease.runId,
      attemptId: lease.attemptId,
      fromState: currentState,
      toState: nextState,
      reason: "stage_transition",
      timestamp,
    });
    return mapRunJob(updated);
  });
}

async function insertOrReplayCheckpoint(
  transaction: DbSession,
  lease: RunLease,
  input: {
    checkpointKey: string;
    stage: DurableRunState;
    metadataJson: string | null;
    timestamp: string;
  },
): Promise<{ row: RunCheckpointRow; created: boolean }> {
  const existing = await transaction.execute(
    `SELECT * FROM run_checkpoints WHERE run_id = ? AND checkpoint_key = ? LIMIT 1`,
    [lease.runId, input.checkpointKey],
  ) as RunCheckpointRow | undefined;
  if (existing) {
    if (existing.stage !== input.stage) {
      throw new Error(
        `Checkpoint ${input.checkpointKey} already records stage ${existing.stage}, not ${input.stage}.`,
      );
    }
    return { row: existing, created: false };
  }

  const inserted = await transaction.execute(
    `INSERT INTO run_checkpoints (
       id, run_id, checkpoint_key, stage, attempt_id, metadata_json, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, checkpoint_key) DO NOTHING
     RETURNING *`,
    [
      randomUUID(),
      lease.runId,
      input.checkpointKey,
      input.stage,
      lease.attemptId,
      input.metadataJson,
      input.timestamp,
    ],
  ) as RunCheckpointRow | undefined;
  if (inserted) return { row: inserted, created: true };

  const replayed = await transaction.execute(
    `SELECT * FROM run_checkpoints WHERE run_id = ? AND checkpoint_key = ? LIMIT 1`,
    [lease.runId, input.checkpointKey],
  ) as RunCheckpointRow | undefined;
  if (!replayed) {
    throw new Error(`Checkpoint ${input.checkpointKey} was not persisted.`);
  }
  if (replayed.stage !== input.stage) {
    throw new Error(
      `Checkpoint ${input.checkpointKey} already records stage ${replayed.stage}, not ${input.stage}.`,
    );
  }
  return { row: replayed, created: false };
}

export async function completeRunCheckpoint(
  lease: RunLease,
  options: CompleteCheckpointOptions,
): Promise<CompleteCheckpointResult | null> {
  validateLease(lease);
  assertNonEmpty(options.checkpointKey, "checkpointKey");
  if (!isDurableRunState(options.stage)) {
    throw new RangeError(`${options.stage} is not a durable run state.`);
  }
  const timestamp = toIso(options.now);
  const metadataJson = options.metadata === undefined ? null : JSON.stringify(options.metadata);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (!owned || owned.cancel_requested_at) return null;

    const currentState = parseRunState(owned.state);
    if (currentState !== options.stage) {
      throw new RangeError(
        `Checkpoint ${options.checkpointKey} cannot complete ${options.stage} while the job is ${currentState}.`,
      );
    }

    const persisted = await insertOrReplayCheckpoint(transaction, lease, {
      checkpointKey: options.checkpointKey,
      stage: options.stage,
      metadataJson,
      timestamp,
    });
    return {
      checkpoint: mapRunCheckpoint(persisted.row),
      created: persisted.created,
    };
  });
}

/**
 * Atomically commits a target's authoritative checkpoint, artifact mirror, and
 * query projection under the current unexpired lease. Replays repair the
 * mirror/projection from the first committed checkpoint instead of trusting
 * new caller metadata.
 */
export async function commitRunTargetCheckpoint(
  lease: RunLease,
  options: CommitRunTargetCheckpointOptions,
): Promise<CompleteCheckpointResult | null> {
  validateLease(lease);
  assertNonEmpty(options.checkpointKey, "checkpointKey");
  assertNonEmpty(options.targetId, "targetId");
  const timestamp = toIso(options.now);
  const metadataJson = JSON.stringify(options.metadata);
  if (metadataJson === undefined) {
    throw new RangeError("Target checkpoint metadata must be JSON serializable.");
  }
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (!owned || owned.cancel_requested_at) return null;
    if (parseRunState(owned.state) !== options.stage) {
      throw new RangeError(
        `Checkpoint ${options.checkpointKey} cannot complete ${options.stage} while the job is ${owned.state}.`,
      );
    }

    const target = await transaction.execute(
      "SELECT id FROM run_targets WHERE id = ? AND run_id = ? LIMIT 1",
      [options.targetId, lease.runId],
    );
    if (!target) {
      throw new Error(`Run target ${options.targetId} does not belong to run ${lease.runId}.`);
    }

    const persisted = await insertOrReplayCheckpoint(transaction, lease, {
      checkpointKey: options.checkpointKey,
      stage: options.stage,
      metadataJson,
      timestamp,
    });
    if (persisted.row.metadata_json === null) {
      throw new Error(`Target checkpoint ${options.checkpointKey} has no metadata.`);
    }
    const committedMetadata = JSON.parse(persisted.row.metadata_json) as unknown;
    const projection = targetStageProjection(options.stage, committedMetadata);

    await transaction.run(
      `INSERT INTO run_artifacts (
         id, run_id, target_id, idempotency_key, artifact_type, artifact_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET
         target_id = excluded.target_id,
         artifact_type = excluded.artifact_type,
         artifact_json = excluded.artifact_json`,
      [
        randomUUID(),
        lease.runId,
        options.targetId,
        options.checkpointKey,
        projection.artifactType,
        persisted.row.metadata_json,
        persisted.row.completed_at,
      ],
    );

    const projected = await transaction.execute(
      `UPDATE run_targets
       SET status = ?,
           crawl_provider = CASE WHEN ? = 1 THEN ? ELSE crawl_provider END,
           last_error = ?,
           updated_at = ?
       WHERE id = ? AND run_id = ?
       RETURNING id`,
      [
        projection.status,
        projection.setCrawlProvider ? 1 : 0,
        projection.crawlProvider,
        projection.lastError,
        timestamp,
        options.targetId,
        lease.runId,
      ],
    );
    if (!projected) {
      throw new Error(`Run target ${options.targetId} disappeared during checkpoint commit.`);
    }

    return {
      checkpoint: mapRunCheckpoint(persisted.row),
      created: persisted.created,
    };
  });
}

/** Fence an intermediate target status projection to the current stage lease. */
export async function projectRunTargetForLease(
  lease: RunLease,
  options: ProjectRunTargetOptions,
): Promise<boolean> {
  validateLease(lease);
  assertNonEmpty(options.targetId, "targetId");
  assertNonEmpty(options.status, "status");
  const timestamp = toIso(options.now);
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (
      !owned
      || owned.cancel_requested_at
      || parseRunState(owned.state) !== options.stage
    ) {
      return false;
    }
    const existing = await transaction.execute(
      `SELECT status, crawl_provider, last_error
       FROM run_targets WHERE id = ? AND run_id = ? LIMIT 1`,
      [options.targetId, lease.runId],
    ) as {
      status: string;
      crawl_provider: string | null;
      last_error: string | null;
    } | undefined;
    if (!existing) {
      throw new Error(`Run target ${options.targetId} does not belong to run ${lease.runId}.`);
    }
    await transaction.run(
      `UPDATE run_targets
       SET status = ?, crawl_provider = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND run_id = ?`,
      [
        options.status,
        options.crawlProvider === undefined
          ? existing.crawl_provider
          : options.crawlProvider,
        options.lastError === undefined ? existing.last_error : options.lastError,
        timestamp,
        options.targetId,
        lease.runId,
      ],
    );
    return true;
  });
}

/** Atomically bind the seller brief checkpoint, artifact, and run projection. */
export async function completeSellerBriefCheckpoint(
  lease: RunLease,
  options: CompleteSellerBriefCheckpointOptions,
): Promise<CompleteCheckpointResult | null> {
  validateLease(lease);
  assertNonEmpty(options.checkpointKey, "checkpointKey");
  const timestamp = toIso(options.now);
  const metadataJson = JSON.stringify(options.metadata);
  if (metadataJson === undefined) {
    throw new RangeError("Seller brief checkpoint metadata must be JSON serializable.");
  }
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (
      !owned
      || owned.cancel_requested_at
      || parseRunState(owned.state) !== "enriching"
    ) {
      return null;
    }
    const persisted = await insertOrReplayCheckpoint(transaction, lease, {
      checkpointKey: options.checkpointKey,
      stage: "enriching",
      metadataJson,
      timestamp,
    });
    if (persisted.row.metadata_json === null) {
      throw new Error(`Seller brief checkpoint ${options.checkpointKey} has no metadata.`);
    }
    const committedMetadata = requiredMetadataRecord(
      JSON.parse(persisted.row.metadata_json) as unknown,
    );
    if (!committedMetadata.sellerBrief || typeof committedMetadata.sellerBrief !== "object") {
      throw new Error("Seller brief checkpoint metadata is invalid.");
    }

    await transaction.run(
      `INSERT INTO run_artifacts (
         id, run_id, target_id, idempotency_key, artifact_type, artifact_json, created_at
       ) VALUES (?, ?, NULL, ?, 'seller_brief', ?, ?)
       ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET
         target_id = NULL,
         artifact_type = excluded.artifact_type,
         artifact_json = excluded.artifact_json`,
      [
        randomUUID(),
        lease.runId,
        options.checkpointKey,
        persisted.row.metadata_json,
        persisted.row.completed_at,
      ],
    );
    const projected = await transaction.execute(
      `UPDATE runs
       SET seller_brief_json = ?, last_error = NULL, updated_at = ?
       WHERE id = ?
       RETURNING id`,
      [JSON.stringify(committedMetadata.sellerBrief), timestamp, lease.runId],
    );
    if (!projected) {
      throw new Error(`Run ${lease.runId} disappeared during seller brief commit.`);
    }
    return {
      checkpoint: mapRunCheckpoint(persisted.row),
      created: persisted.created,
    };
  });
}

export async function requestRunCancellation(
  runId: string,
  options: LeaseMutationOptions = {},
): Promise<RunJob | null> {
  assertNonEmpty(runId, "runId");
  const timestamp = toIso(options.now);
  const db = await getDb();

  const updated = await db.execute(
    `UPDATE run_jobs
     SET cancel_requested_at = COALESCE(cancel_requested_at, ?),
         next_attempt_at = CASE WHEN next_attempt_at > ? THEN ? ELSE next_attempt_at END,
         updated_at = ?
     WHERE run_id = ? AND state IN (${ACTIVE_STATE_SQL})
     RETURNING *`,
    [timestamp, timestamp, timestamp, timestamp, runId],
  ) as RunJobRow | undefined;

  if (updated) return mapRunJob(updated);
  const existing = await findJob(db, runId);
  return existing && existing.state === "cancelled" ? mapRunJob(existing) : null;
}

export async function releaseRunJobForRetry(
  lease: RunLease,
  options: ReleaseRunJobOptions,
): Promise<ReleaseRunJobResult | null> {
  validateLease(lease);
  const now = toDate(options.now);
  const timestamp = now.toISOString();
  const retryAt = addMilliseconds(now, boundedRetryDelay(options.retryDelayMs));
  const error = options.error ?? null;
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (!owned || owned.cancel_requested_at) return null;

    if (Number(owned.attempt_count) >= Number(owned.max_attempts)) {
      const terminal = await completeWithinTransaction(
        transaction,
        owned,
        lease,
        "failed",
        timestamp,
        error ?? "Run exhausted its maximum attempts.",
      );
      return terminal ? { job: terminal, exhausted: true } : null;
    }

    const updated = await transaction.execute(
      `UPDATE run_jobs
       SET current_attempt_id = NULL,
           lease_owner = NULL,
           lease_expires_at = NULL,
           next_attempt_at = ?,
           last_error = ?,
           updated_at = ?
       WHERE run_id = ?
         AND current_attempt_id = ?
         AND lease_owner = ?
         AND lease_expires_at > ?
         AND state = ?
       RETURNING *`,
      [
        retryAt,
        error,
        timestamp,
        lease.runId,
        lease.attemptId,
        lease.leaseOwner,
        timestamp,
        owned.state,
      ],
    ) as RunJobRow | undefined;
    if (!updated) return null;

    await mirrorRunState(
      transaction,
      lease.runId,
      parseRunState(String(owned.state)),
      timestamp,
      error,
    );

    const attempt = await transaction.execute(
      `UPDATE run_attempts
       SET status = 'released', finished_at = ?, retry_at = ?, final_state = ?, last_error = ?
       WHERE id = ? AND run_id = ? AND lease_owner = ? AND status = 'running'
       RETURNING id`,
      [
        timestamp,
        retryAt,
        owned.state,
        error,
        lease.attemptId,
        lease.runId,
        lease.leaseOwner,
      ],
    );
    if (!attempt) {
      throw new Error(`Run attempt ${lease.attemptId} disappeared during retry release.`);
    }
    return { job: mapRunJob(updated), exhausted: false };
  });
}

export async function completeRunJob(
  lease: RunLease,
  terminalState: TerminalRunState,
  options: CompleteRunJobOptions = {},
): Promise<RunJob | null> {
  validateLease(lease);
  if (!terminalRunStateSet.has(terminalState)) {
    throw new RangeError(`${terminalState} is not a terminal durable run state.`);
  }
  const timestamp = toIso(options.now);
  if (options.terminalArtifact) {
    assertNonEmpty(options.terminalArtifact.idempotencyKey, "terminalArtifact.idempotencyKey");
    assertNonEmpty(options.terminalArtifact.artifactType, "terminalArtifact.artifactType");
  }
  const terminalArtifactJson = options.terminalArtifact
    ? JSON.stringify(options.terminalArtifact.artifactJson)
    : null;
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const owned = await findOwnedActiveJob(transaction, lease, timestamp);
    if (!owned) return null;
    if (owned.cancel_requested_at && terminalState !== "cancelled") return null;
    if (terminalState === "delivered" && owned.state !== "rendering") {
      throw new RangeError(`A delivered run must complete from rendering, not ${owned.state}.`);
    }
    const completed = await completeWithinTransaction(
      transaction,
      owned,
      lease,
      terminalState,
      timestamp,
      options.error,
      { persistFallbackReceipt: !options.terminalArtifact },
    );
    if (!completed) return null;

    if (options.terminalArtifact && terminalArtifactJson !== null) {
      await transaction.run(
        `INSERT INTO run_artifacts (
           id, run_id, idempotency_key, artifact_type, artifact_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO UPDATE SET
           artifact_type = excluded.artifact_type,
           artifact_json = excluded.artifact_json`,
        [
          randomUUID(),
          lease.runId,
          options.terminalArtifact.idempotencyKey,
          options.terminalArtifact.artifactType,
          terminalArtifactJson,
          timestamp,
        ],
      );
    }
    return completed;
  });
}

export async function listRunAttempts(runId: string): Promise<RunAttempt[]> {
  assertNonEmpty(runId, "runId");
  const db = await getDb();
  const rows = await db.executeAll(
    "SELECT * FROM run_attempts WHERE run_id = ? ORDER BY attempt_number ASC",
    [runId],
  ) as unknown as RunAttemptRow[];
  return rows.map(mapRunAttempt);
}

export async function listRunCheckpoints(runId: string): Promise<RunCheckpoint[]> {
  assertNonEmpty(runId, "runId");
  const db = await getDb();
  const rows = await db.executeAll(
    "SELECT * FROM run_checkpoints WHERE run_id = ? ORDER BY completed_at ASC, checkpoint_key ASC",
    [runId],
  ) as unknown as RunCheckpointRow[];
  return rows.map(mapRunCheckpoint);
}

export async function listRunJobTransitions(runId: string): Promise<RunJobTransition[]> {
  assertNonEmpty(runId, "runId");
  const db = await getDb();
  const rows = await db.executeAll(
    "SELECT * FROM run_job_transitions WHERE run_id = ? ORDER BY created_at ASC, id ASC",
    [runId],
  ) as unknown as RunJobTransitionRow[];
  return rows.map(mapRunJobTransition);
}
