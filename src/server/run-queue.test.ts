import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { parseRunReceipt } from "@/src/domain/run-receipt";
import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";

process.env.APP_SECRETS_KEY = "1".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");
const {
  MAX_RETRY_DELAY_MS,
  RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY,
  claimRunJob,
  commitRunTargetCheckpoint,
  completeRunCheckpoint,
  completeRunJob,
  enqueueRunJob,
  getRunJob,
  heartbeatRunJob,
  listRunAttempts,
  listRunCheckpoints,
  listRunJobTransitions,
  projectRunTargetForLease,
  releaseRunJobForRetry,
  requestRunCancellation,
  transitionRunJob,
} = await import("./run-queue");

const BASE_TIME = Date.parse("2026-07-13T12:00:00.000Z");
const LEASE_MS = 60_000;

function at(offsetMs: number) {
  return new Date(BASE_TIME + offsetMs);
}

function richStaticVisualProfileFixture(slideCount: number) {
  const layoutIds = selectRichStaticLayoutIds(slideCount);
  return {
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds,
    measuredRichness: {
      slideCount,
      vectorShapeCount: slideCount * 2,
      styledTextRunCount: slideCount,
      slidesWithBackground: slideCount,
      slidesWithVectorAccents: slideCount,
      distinctLayoutSignatures: new Set(layoutIds).size,
      distinctPaletteColors: 3,
    },
  };
}

async function seedRun() {
  const db = await getDb();
  const runId = randomUUID();
  const timestamp = at(0).toISOString();
  await db.run(
    `INSERT INTO runs (
       id, status, seller_context_json, questionnaire_json, target_count,
       delivery_format, review_gate_enabled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [runId, "queued", "{}", "{}", 1, "pptx", 0, timestamp, timestamp],
  );
  await db.run(
    `INSERT INTO run_targets (
       id, run_id, target_ordinal, website_url, status, created_at, updated_at
     ) VALUES (?, ?, 0, 'https://example.com', 'queued', ?, ?)`,
    [randomUUID(), runId, timestamp, timestamp],
  );
  return runId;
}

async function seedTarget(runId: string) {
  const db = await getDb();
  const existing = await db.execute(
    "SELECT id FROM run_targets WHERE run_id = ? ORDER BY target_ordinal ASC LIMIT 1",
    [runId],
  ) as unknown as { id: string } | undefined;
  if (existing) return existing.id;
  const targetId = randomUUID();
  const timestamp = at(0).toISOString();
  await db.run(
    `INSERT INTO run_targets (
       id, run_id, target_ordinal, website_url, status, created_at, updated_at
     ) VALUES (?, ?, 0, 'https://example.com', 'queued', ?, ?)`,
    [targetId, runId, timestamp, timestamp],
  );
  return targetId;
}

async function receiptForRun(runId: string) {
  const db = await getDb();
  const row = await db.execute(
    `SELECT artifact_json FROM run_artifacts
     WHERE run_id = ? AND idempotency_key = 'run-receipt-v1'
     LIMIT 1`,
    [runId],
  ) as unknown as { artifact_json: string } | undefined;
  assert.ok(row);
  return parseRunReceipt(JSON.parse(row.artifact_json));
}

type Claim = NonNullable<Awaited<ReturnType<typeof claimRunJob>>>;

async function failClaim(claim: Claim, offsetMs: number, error = "Test terminal failure") {
  const completed = await completeRunJob(claim.lease, "failed", {
    now: at(offsetMs),
    error,
  });
  assert.equal(completed?.state, "failed");
  return completed;
}

test("enqueue is idempotent for a run", async () => {
  const runId = await seedRun();
  const first = await enqueueRunJob(runId, { now: at(0), maxAttempts: 3 });
  const replay = await enqueueRunJob(runId, {
    now: at(10_000),
    nextAttemptAt: at(20_000),
    maxAttempts: 9,
  });

  assert.equal(replay.runId, first.runId);
  assert.equal(replay.createdAt, first.createdAt);
  assert.equal(replay.nextAttemptAt, first.nextAttemptAt);
  assert.equal(replay.maxAttempts, 3);

  const db = await getDb();
  const count = await db.execute(
    "SELECT COUNT(*) AS count FROM run_jobs WHERE run_id = ?",
    [runId],
  ) as { count: number | bigint } | undefined;
  assert.equal(Number(count?.count), 1);

  const claim = await claimRunJob(runId, {
    leaseOwner: "idempotency-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);
  await failClaim(claim, 1_000);
});

test("atomic claims grant one active lease and exclude competitors", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });

  const [workerA, workerB] = await Promise.all([
    claimRunJob(runId, {
      leaseOwner: "worker-a",
      leaseDurationMs: LEASE_MS,
      now: at(0),
    }),
    claimRunJob(runId, {
      leaseOwner: "worker-b",
      leaseDurationMs: LEASE_MS,
      now: at(0),
    }),
  ]);

  assert.equal(Number(Boolean(workerA)) + Number(Boolean(workerB)), 1);
  const winner = workerA ?? workerB;
  assert.ok(winner);

  const excluded = await claimRunJob(runId, {
    leaseOwner: "worker-c",
    leaseDurationMs: LEASE_MS,
    now: at(1_000),
  });
  assert.equal(excluded, null);
  await failClaim(winner, 2_000);
});

test("an expired lease is reclaimed as a new attributed attempt", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0), maxAttempts: 3 });

  const first = await claimRunJob(runId, {
    leaseOwner: "crashed-worker",
    leaseDurationMs: 1_000,
    now: at(0),
  });
  assert.ok(first);

  const tooEarly = await claimRunJob(runId, {
    leaseOwner: "recovery-worker",
    leaseDurationMs: LEASE_MS,
    now: at(999),
  });
  assert.equal(tooEarly, null);

  const recovered = await claimRunJob(runId, {
    leaseOwner: "recovery-worker",
    leaseDurationMs: LEASE_MS,
    now: at(1_000),
  });
  assert.ok(recovered);
  assert.equal(recovered.attempt.attemptNumber, 2);
  assert.equal(recovered.attempt.reclaimedFromAttemptId, first.attempt.id);

  const attempts = await listRunAttempts(runId);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.status, "expired");
  assert.equal(attempts[0]?.finalState, "queued");
  assert.equal(attempts[1]?.status, "running");
  await failClaim(recovered, 2_000);
});

test("lease mutations use owner-and-attempt compare-and-swap", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "rightful-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);

  const forgedLease = { ...claim.lease, leaseOwner: "wrong-worker" };
  assert.equal(await heartbeatRunJob(forgedLease, LEASE_MS, { now: at(1_000) }), null);
  assert.equal(await transitionRunJob(forgedLease, "crawling", { now: at(1_000) }), null);
  assert.equal(
    await completeRunCheckpoint(forgedLease, {
      checkpointKey: "forged-checkpoint",
      stage: "queued",
      now: at(1_000),
    }),
    null,
  );
  assert.equal(
    await releaseRunJobForRetry(forgedLease, { retryDelayMs: 1_000, now: at(1_000) }),
    null,
  );
  assert.equal(await completeRunJob(forgedLease, "failed", { now: at(1_000) }), null);

  const unchanged = await getRunJob(runId);
  assert.equal(unchanged?.state, "queued");
  assert.equal(unchanged?.leaseOwner, "rightful-worker");
  await failClaim(claim, 2_000);
});

test("checkpoints survive retries and replay idempotently with original attempt binding", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });
  const first = await claimRunJob(runId, {
    leaseOwner: "checkpoint-worker-1",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(first);

  const crawling = await transitionRunJob(first.lease, "crawling", { now: at(1_000) });
  assert.equal(crawling?.state, "crawling");
  const recorded = await completeRunCheckpoint(first.lease, {
    checkpointKey: "crawl:target-1",
    stage: "crawling",
    metadata: { pages: 3 },
    now: at(2_000),
  });
  assert.equal(recorded?.created, true);
  assert.equal(recorded?.checkpoint.attemptId, first.attempt.id);

  const released = await releaseRunJobForRetry(first.lease, {
    retryDelayMs: 1_000,
    error: "Transient provider failure",
    now: at(3_000),
  });
  assert.equal(released?.exhausted, false);

  const beforeRetry = await claimRunJob(runId, {
    leaseOwner: "checkpoint-worker-2",
    leaseDurationMs: LEASE_MS,
    now: at(3_999),
  });
  assert.equal(beforeRetry, null);
  const second = await claimRunJob(runId, {
    leaseOwner: "checkpoint-worker-2",
    leaseDurationMs: LEASE_MS,
    now: at(4_000),
  });
  assert.ok(second);

  const replay = await completeRunCheckpoint(second.lease, {
    checkpointKey: "crawl:target-1",
    stage: "crawling",
    metadata: { pages: 999 },
    now: at(5_000),
  });
  assert.equal(replay?.created, false);
  assert.equal(replay?.checkpoint.attemptId, first.attempt.id);
  assert.deepEqual(replay?.checkpoint.metadata, { pages: 3 });

  const checkpoints = await listRunCheckpoints(runId);
  assert.equal(checkpoints.length, 1);
  await failClaim(second, 6_000);
});

test("cancellation is cooperative, observable on heartbeat, and terminal", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "cancellation-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);

  const requested = await requestRunCancellation(runId, { now: at(1_000) });
  assert.equal(requested?.cancelRequestedAt, at(1_000).toISOString());
  assert.equal(
    await completeRunCheckpoint(claim.lease, {
      checkpointKey: "cancelled-dispatch",
      stage: "queued",
      metadata: { reserved: true },
      now: at(1_500),
    }),
    null,
  );
  const heartbeat = await heartbeatRunJob(claim.lease, LEASE_MS, { now: at(2_000) });
  assert.equal(heartbeat?.cancelRequestedAt, at(1_000).toISOString());
  assert.equal(await transitionRunJob(claim.lease, "crawling", { now: at(3_000) }), null);
  assert.equal(await completeRunJob(claim.lease, "failed", { now: at(3_000) }), null);

  const cancelled = await completeRunJob(claim.lease, "cancelled", { now: at(4_000) });
  assert.equal(cancelled?.state, "cancelled");
  assert.equal(cancelled?.terminalAt, at(4_000).toISOString());
  const replay = await requestRunCancellation(runId, { now: at(5_000) });
  assert.equal(replay?.cancelRequestedAt, at(1_000).toISOString());
  assert.equal((await listRunCheckpoints(runId)).length, 0);
});

test("cancelling a released job makes it immediately claimable", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });
  const first = await claimRunJob(runId, {
    leaseOwner: "cancel-backoff-worker-1",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(first);
  const released = await releaseRunJobForRetry(first.lease, {
    retryDelayMs: MAX_RETRY_DELAY_MS,
    now: at(1_000),
  });
  assert.equal(released?.job.nextAttemptAt, at(1_000 + MAX_RETRY_DELAY_MS).toISOString());

  const requested = await requestRunCancellation(runId, { now: at(2_000) });
  assert.equal(requested?.nextAttemptAt, at(2_000).toISOString());
  const cancellationClaim = await claimRunJob(runId, {
    leaseOwner: "cancel-backoff-worker-2",
    leaseDurationMs: LEASE_MS,
    now: at(2_000),
  });
  assert.ok(cancellationClaim);
  const cancelled = await completeRunJob(cancellationClaim.lease, "cancelled", {
    now: at(3_000),
  });
  assert.equal(cancelled?.state, "cancelled");
  assert.equal((await receiptForRun(runId)).terminalState, "cancelled");
});

test("retry scheduling is bounded and maximum-attempt exhaustion is terminal", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0), maxAttempts: 3 });
  const first = await claimRunJob(runId, {
    leaseOwner: "retry-worker-1",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(first);

  const releasedAt = 1_000;
  const released = await releaseRunJobForRetry(first.lease, {
    retryDelayMs: MAX_RETRY_DELAY_MS + 999_999,
    now: at(releasedAt),
  });
  assert.equal(released?.exhausted, false);
  assert.equal(
    released?.job.nextAttemptAt,
    at(releasedAt + MAX_RETRY_DELAY_MS).toISOString(),
  );

  const beforeBoundary = await claimRunJob(runId, {
    leaseOwner: "retry-worker-2",
    leaseDurationMs: LEASE_MS,
    now: at(releasedAt + MAX_RETRY_DELAY_MS - 1),
  });
  assert.equal(beforeBoundary, null);
  const second = await claimRunJob(runId, {
    leaseOwner: "retry-worker-2",
    leaseDurationMs: LEASE_MS,
    now: at(releasedAt + MAX_RETRY_DELAY_MS),
  });
  assert.ok(second);
  await completeRunJob(second.lease, "failed", {
    now: at(releasedAt + MAX_RETRY_DELAY_MS + 1),
  });

  const exhaustedRunId = await seedRun();
  await enqueueRunJob(exhaustedRunId, { now: at(0), maxAttempts: 1 });
  const onlyAttempt = await claimRunJob(exhaustedRunId, {
    leaseOwner: "final-attempt-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(onlyAttempt);
  const exhausted = await releaseRunJobForRetry(onlyAttempt.lease, {
    retryDelayMs: 1_000,
    error: "Final retryable failure",
    now: at(1_000),
  });
  assert.equal(exhausted?.exhausted, true);
  assert.equal(exhausted?.job.state, "failed");
  assert.equal((await receiptForRun(exhaustedRunId)).terminalState, "failed");
  assert.equal(
    await claimRunJob(exhaustedRunId, {
      leaseOwner: "too-late-worker",
      leaseDurationMs: LEASE_MS,
      now: at(2_000),
    }),
    null,
  );
});

test("a crashed final attempt becomes terminal instead of being reclaimed", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0), maxAttempts: 1 });
  const claim = await claimRunJob(runId, {
    leaseOwner: "crashed-final-worker",
    leaseDurationMs: 1_000,
    now: at(0),
  });
  assert.ok(claim);

  const reclaimed = await claimRunJob(runId, {
    leaseOwner: "recovery-after-exhaustion",
    leaseDurationMs: LEASE_MS,
    now: at(1_000),
  });
  assert.equal(reclaimed, null);

  const terminal = await getRunJob(runId);
  assert.equal(terminal?.state, "failed");
  assert.equal(terminal?.stateChangedByAttemptId, claim.attempt.id);
  assert.equal(terminal?.terminalAt, at(1_000).toISOString());

  const attempts = await listRunAttempts(runId);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.status, "expired");
  assert.equal(attempts[0]?.finalState, "failed");

  const db = await getDb();
  const target = await db.execute(
    "SELECT status, last_error FROM run_targets WHERE run_id = ? LIMIT 1",
    [runId],
  ) as unknown as { status: string; last_error: string | null };
  assert.deepEqual(target, {
    status: "failed",
    last_error: "Run exhausted its maximum attempts after a lease expired.",
  });
  const receipt = await receiptForRun(runId);
  assert.equal(receipt.terminalState, "failed");
  assert.equal(receipt.targets[0]?.outcome, "failed");
  assert.equal(receipt.targets[0]?.errorCode, "terminal_failure");

  const transitions = await listRunJobTransitions(runId);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.attemptId, claim.attempt.id);
  assert.equal(transitions[0]?.reason, "attempts_exhausted");
});

test("ordered state transitions retain timestamp and attempt evidence through delivery", async () => {
  const runId = await seedRun();
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "delivery-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);

  const states = ["crawling", "enriching", "brief_ready", "planning", "rendering"] as const;
  for (const [index, state] of states.entries()) {
    const changed = await transitionRunJob(claim.lease, state, { now: at(index + 1) });
    assert.equal(changed?.state, state);
    assert.equal(changed?.stateChangedAt, at(index + 1).toISOString());
    assert.equal(changed?.stateChangedByAttemptId, claim.attempt.id);
  }

  const delivered = await completeRunJob(claim.lease, "delivered", {
    now: at(6),
    terminalArtifact: {
      idempotencyKey: "run-receipt-v1",
      artifactType: "run_receipt",
      artifactJson: { schemaVersion: 1, terminalState: "delivered" },
    },
  });
  assert.equal(delivered?.state, "delivered");
  assert.equal(delivered?.terminalAt, at(6).toISOString());
  assert.equal(delivered?.stateChangedByAttemptId, claim.attempt.id);

  const transitions = await listRunJobTransitions(runId);
  assert.deepEqual(
    transitions.map((transition) => [transition.fromState, transition.toState]),
    [
      ["queued", "crawling"],
      ["crawling", "enriching"],
      ["enriching", "brief_ready"],
      ["brief_ready", "planning"],
      ["planning", "rendering"],
      ["rendering", "delivered"],
    ],
  );
  assert.ok(transitions.every((transition) => transition.attemptId === claim.attempt.id));
  assert.ok(transitions.every((transition) => Boolean(transition.createdAt)));

  const db = await getDb();
  const receipt = await db.execute(
    `SELECT artifact_json FROM run_artifacts
     WHERE run_id = ? AND idempotency_key = ?`,
    [runId, "run-receipt-v1"],
  ) as { artifact_json: string } | undefined;
  assert.deepEqual(JSON.parse(receipt?.artifact_json ?? "null"), {
    schemaVersion: 1,
    terminalState: "delivered",
  });

  const attempts = await listRunAttempts(runId);
  assert.equal(attempts[0]?.status, "completed");
  assert.equal(attempts[0]?.finalState, "delivered");
  assert.equal(
    await claimRunJob(runId, {
      leaseOwner: "post-terminal-worker",
      leaseDurationMs: LEASE_MS,
      now: at(100_000),
    }),
    null,
  );
});

test("recovered delivery receipts preserve the verified rich-static profile", async () => {
  const runId = await seedRun();
  const targetId = await seedTarget(runId);
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "rich-static-recovery-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);

  await completeRunCheckpoint(claim.lease, {
    checkpointKey: RUN_EXECUTION_CONTRACT_CHECKPOINT_KEY,
    stage: "queued",
    metadata: {
      schemaVersion: 1,
      commitSha: "abcdef1234567",
      configurationNames: ["presenton.base_url"],
      providers: [
        { stage: "crawling", providerId: "cloudflare.crawl", modelId: null, contractVersion: 1 },
        { stage: "enriching", providerId: "perplexity.enrich", modelId: "sonar", contractVersion: 1 },
        { stage: "enriching", providerId: "gemini.brief", modelId: "gemini", contractVersion: 1 },
        { stage: "planning", providerId: "gemini.plan", modelId: "gemini", contractVersion: 1 },
        { stage: "rendering", providerId: "presenton.render", modelId: null, contractVersion: 1 },
      ],
      recordedAt: at(0).toISOString(),
    },
    now: at(1),
  });

  for (const [index, state] of [
    "crawling",
    "enriching",
    "brief_ready",
    "planning",
  ].entries()) {
    assert.ok(await transitionRunJob(
      claim.lease,
      state as "crawling" | "enriching" | "brief_ready" | "planning",
      { now: at(index + 2) },
    ));
  }

  const evidence = {
    sources: [],
    claims: [{
      id: "claim-1",
      text: "Book a working session.",
      claimClass: "seller_claim" as const,
      supportStatus: "seller_supplied" as const,
      citedSourceIds: [],
    }],
  };
  assert.ok(await commitRunTargetCheckpoint(claim.lease, {
    checkpointKey: `target:${targetId}:planning:v1`,
    stage: "planning",
    targetId,
    metadata: {
      outcome: "ready",
      plan: { evidence },
      readiness: {
        requiredSlideFieldsPresent: true,
        ctaPresent: true,
        evidenceGatePassed: true,
        artifactReadable: false,
        providerProvenancePresent: true,
        visualProfileVerified: false,
      },
      timing: {
        startedAt: at(5).toISOString(),
        completedAt: at(6).toISOString(),
        durationMs: 1,
      },
    },
    now: at(6),
  }));
  assert.ok(await transitionRunJob(claim.lease, "rendering", { now: at(7) }));

  const visualProfile = richStaticVisualProfileFixture(1);
  assert.ok(await commitRunTargetCheckpoint(claim.lease, {
    checkpointKey: `target:${targetId}:rendering:v1`,
    stage: "rendering",
    targetId,
    metadata: {
      outcome: "delivered",
      result: {
        presentationId: "presentation-1",
        exportUrl: "https://renderer.example.test/export/presentation-1.pptx",
      },
      verification: {
        url: "https://renderer.example.test/export/presentation-1.pptx",
        sha256: "a".repeat(64),
        byteLength: 2_048,
        verifiedAt: at(8).toISOString(),
        contentVerification: {
          method: "pptx_ooxml_rich_static_v2",
          sha256: "b".repeat(64),
          slideCount: 1,
        },
        visualProfile,
      },
      readiness: {
        requiredSlideFieldsPresent: true,
        ctaPresent: true,
        evidenceGatePassed: true,
        artifactReadable: true,
        providerProvenancePresent: true,
        visualProfileVerified: true,
      },
      timing: {
        startedAt: at(7).toISOString(),
        completedAt: at(8).toISOString(),
        durationMs: 1,
      },
    },
    now: at(8),
  }));

  assert.equal(
    (await completeRunJob(claim.lease, "delivered", { now: at(9) }))?.state,
    "delivered",
  );
  const receipt = await receiptForRun(runId);
  assert.deepEqual(receipt.targets[0]?.artifact?.visualProfile, visualProfile);
  assert.equal(receipt.targets[0]?.readiness.visualProfileVerified, true);
});

test("target checkpoint commit atomically binds checkpoint, artifact, and projection", async () => {
  const runId = await seedRun();
  const targetId = await seedTarget(runId);
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "atomic-target-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);
  assert.equal(
    (await transitionRunJob(claim.lease, "crawling", { now: at(1_000) }))?.state,
    "crawling",
  );

  const metadata = {
    outcome: "succeeded",
    crawlResult: { pages: [] },
    timing: { startedAt: at(1_000).toISOString(), completedAt: at(2_000).toISOString() },
  };
  const committed = await commitRunTargetCheckpoint(claim.lease, {
    checkpointKey: `target:${targetId}:crawl`,
    stage: "crawling",
    targetId,
    metadata,
    now: at(2_000),
  });
  assert.equal(committed?.created, true);

  const db = await getDb();
  const target = await db.execute(
    "SELECT status, crawl_provider, last_error FROM run_targets WHERE id = ?",
    [targetId],
  ) as unknown as { status: string; crawl_provider: string | null; last_error: string | null };
  const artifact = await db.execute(
    `SELECT target_id, artifact_type, artifact_json FROM run_artifacts
     WHERE run_id = ? AND idempotency_key = ?`,
    [runId, `target:${targetId}:crawl`],
  ) as unknown as { target_id: string; artifact_type: string; artifact_json: string };
  assert.deepEqual(target, {
    status: "crawled",
    crawl_provider: "cloudflare",
    last_error: null,
  });
  assert.equal(artifact.target_id, targetId);
  assert.equal(artifact.artifact_type, "crawl_result");
  assert.deepEqual(JSON.parse(artifact.artifact_json), metadata);
});

test("expired and cancelled leases mutate no target completion rows", async () => {
  const runId = await seedRun();
  const targetId = await seedTarget(runId);
  await enqueueRunJob(runId, { now: at(0) });
  const expired = await claimRunJob(runId, {
    leaseOwner: "expired-target-worker",
    leaseDurationMs: 1_000,
    now: at(0),
  });
  assert.ok(expired);
  await transitionRunJob(expired.lease, "crawling", { now: at(100) });
  const recovered = await claimRunJob(runId, {
    leaseOwner: "recovered-target-worker",
    leaseDurationMs: LEASE_MS,
    now: at(1_000),
  });
  assert.ok(recovered);

  const failedMetadata = {
    outcome: "failed",
    errorCode: "must_not_commit",
    timing: { startedAt: at(100).toISOString(), completedAt: at(1_100).toISOString() },
  };
  assert.equal(await commitRunTargetCheckpoint(expired.lease, {
    checkpointKey: `target:${targetId}:crawl`,
    stage: "crawling",
    targetId,
    metadata: failedMetadata,
    now: at(1_100),
  }), null);
  assert.equal(await projectRunTargetForLease(expired.lease, {
    stage: "crawling",
    targetId,
    status: "failed",
    now: at(1_100),
  }), false);

  await requestRunCancellation(runId, { now: at(1_200) });
  assert.equal(await commitRunTargetCheckpoint(recovered.lease, {
    checkpointKey: `target:${targetId}:crawl`,
    stage: "crawling",
    targetId,
    metadata: failedMetadata,
    now: at(1_300),
  }), null);

  const db = await getDb();
  const counts = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM run_checkpoints WHERE run_id = ?) AS checkpoints,
       (SELECT COUNT(*) FROM run_artifacts WHERE run_id = ?) AS artifacts`,
    [runId, runId],
  ) as unknown as { checkpoints: number | bigint; artifacts: number | bigint };
  const target = await db.execute(
    "SELECT status FROM run_targets WHERE id = ?",
    [targetId],
  ) as unknown as { status: string };
  assert.equal(Number(counts.checkpoints), 0);
  assert.equal(Number(counts.artifacts), 0);
  assert.equal(target.status, "queued");
  const cancelled = await completeRunJob(recovered.lease, "cancelled", { now: at(1_400) });
  assert.equal(cancelled?.state, "cancelled");
});

test("target checkpoint replay repairs projections from first-writer metadata", async () => {
  const runId = await seedRun();
  const targetId = await seedTarget(runId);
  const key = `target:${targetId}:crawl`;
  await enqueueRunJob(runId, { now: at(0) });
  const first = await claimRunJob(runId, {
    leaseOwner: "projection-writer-1",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(first);
  await transitionRunJob(first.lease, "crawling", { now: at(1_000) });
  const originalMetadata = {
    outcome: "succeeded",
    crawlResult: { pages: [{ url: "https://example.com" }] },
    timing: { startedAt: at(1_000).toISOString(), completedAt: at(2_000).toISOString() },
  };
  await commitRunTargetCheckpoint(first.lease, {
    checkpointKey: key,
    stage: "crawling",
    targetId,
    metadata: originalMetadata,
    now: at(2_000),
  });
  await releaseRunJobForRetry(first.lease, { retryDelayMs: 1_000, now: at(3_000) });

  const db = await getDb();
  await db.run(
    "UPDATE run_targets SET status = 'failed', crawl_provider = NULL, last_error = 'stale' WHERE id = ?",
    [targetId],
  );
  await db.run(
    `UPDATE run_artifacts SET artifact_type = 'tampered', artifact_json = '{}'
     WHERE run_id = ? AND idempotency_key = ?`,
    [runId, key],
  );

  const replay = await claimRunJob(runId, {
    leaseOwner: "projection-writer-2",
    leaseDurationMs: LEASE_MS,
    now: at(4_000),
  });
  assert.ok(replay);
  const repaired = await commitRunTargetCheckpoint(replay.lease, {
    checkpointKey: key,
    stage: "crawling",
    targetId,
    metadata: {
      outcome: "failed",
      errorCode: "new_caller_must_not_win",
      timing: { startedAt: at(4_000).toISOString(), completedAt: at(5_000).toISOString() },
    },
    now: at(5_000),
  });
  assert.equal(repaired?.created, false);
  assert.deepEqual(repaired?.checkpoint.metadata, originalMetadata);

  const target = await db.execute(
    "SELECT status, crawl_provider, last_error FROM run_targets WHERE id = ?",
    [targetId],
  ) as unknown as { status: string; crawl_provider: string | null; last_error: string | null };
  const artifact = await db.execute(
    `SELECT artifact_type, artifact_json FROM run_artifacts
     WHERE run_id = ? AND idempotency_key = ?`,
    [runId, key],
  ) as unknown as { artifact_type: string; artifact_json: string };
  assert.deepEqual(target, {
    status: "crawled",
    crawl_provider: "cloudflare",
    last_error: null,
  });
  assert.equal(artifact.artifact_type, "crawl_result");
  assert.deepEqual(JSON.parse(artifact.artifact_json), originalMetadata);
  await failClaim(replay, 6_000);
});

test("run cancellation atomically revokes completed target and public share projections", async () => {
  const runId = await seedRun();
  const targetId = await seedTarget(runId);
  await enqueueRunJob(runId, { now: at(0) });
  const claim = await claimRunJob(runId, {
    leaseOwner: "cancel-after-render-worker",
    leaseDurationMs: LEASE_MS,
    now: at(0),
  });
  assert.ok(claim);
  for (const [index, state] of [
    "crawling",
    "enriching",
    "brief_ready",
    "planning",
    "rendering",
  ].entries()) {
    assert.ok(await transitionRunJob(
      claim.lease,
      state as "crawling" | "enriching" | "brief_ready" | "planning" | "rendering",
      { now: at(index + 1) },
    ));
  }
  await commitRunTargetCheckpoint(claim.lease, {
    checkpointKey: `target:${targetId}:rendering`,
    stage: "rendering",
    targetId,
    metadata: { outcome: "delivered" },
    now: at(10),
  });
  const db = await getDb();
  await db.run(
    `INSERT INTO shareable_decks (
       id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
     ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
    [
      randomUUID(),
      "A".repeat(24),
      runId,
      targetId,
      "owner-fixture",
      at(100_000).toISOString(),
      at(10).toISOString(),
    ],
  );

  await requestRunCancellation(runId, { now: at(20) });
  const cancelled = await completeRunJob(claim.lease, "cancelled", { now: at(30) });
  assert.equal(cancelled?.state, "cancelled");

  const target = await db.execute(
    "SELECT status, last_error FROM run_targets WHERE id = ?",
    [targetId],
  ) as unknown as { status: string; last_error: string | null };
  const share = await db.execute(
    "SELECT is_active FROM shareable_decks WHERE run_id = ?",
    [runId],
  ) as unknown as { is_active: number | bigint };
  assert.equal(target.status, "cancelled");
  assert.equal(target.last_error, "Run cancelled.");
  assert.equal(Number(share.is_active), 0);
});
