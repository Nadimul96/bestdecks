import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "bestdecks-credits-"));
process.env.APP_SECRETS_KEY = "unit-test-secret";
process.env.LOCAL_DB_PATH = join(tempDir, "credits-test.sqlite");
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");
const {
  deductCredits,
  refundCredits,
  getRunOwner,
  createRun,
  getRun,
  updateRun,
  addArtifact,
  addRunEvent,
  updateRunTarget,
  listDeliveryDecks,
} = await import("./repository");

const db = await getDb();

beforeEach(async () => {
  await db.run("DELETE FROM run_events");
  await db.run("DELETE FROM run_artifacts");
  await db.run("DELETE FROM run_targets");
  await db.run("DELETE FROM runs");
  await db.run("DELETE FROM user_credits");
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const validInput = {
  sellerContext: {
    websiteUrl: "https://bestdecks.co",
    companyName: "Bestdecks",
    offerSummary: "Research-backed decks.",
    services: ["Research"],
    differentiators: ["Evidence-first"],
    targetCustomer: "Founders",
    desiredOutcome: "Book meetings",
    proofPoints: [],
    constraints: [],
  },
  questionnaire: {
    archetype: "cold_outreach" as const,
    audience: "Founder",
    objective: "Book a call",
    callToAction: "Book a call",
    outputFormat: "bestdecks_editor" as const,
    desiredCardCount: 8,
    tone: "consultative" as const,
    visualStyle: "premium_modern" as const,
    imagePolicy: "auto" as const,
    visualContentTypes: [],
    visualDensity: "moderate" as const,
    mustInclude: [],
    mustAvoid: [],
    optionalReview: true,
    allowUserApprovedCrawlException: false,
  },
  targets: [
    { websiteUrl: "https://acme.com", companyName: "Acme" },
  ],
};

// ── Credit Operations ─────────────────────────────

test("deductCredits returns false when user has no credit row", async () => {
  const result = await deductCredits("no-such-user", 1);
  assert.equal(result, false);
});

test("deductCredits returns false when balance is insufficient", async () => {
  await db.run(
    `INSERT INTO user_credits (user_id, balance, total_earned) VALUES (?, ?, ?)`,
    ["user-low", 2, 10],
  );

  const result = await deductCredits("user-low", 5);
  assert.equal(result, false);

  // Balance should be unchanged
  const row = await db.execute(
    `SELECT balance FROM user_credits WHERE user_id = ?`,
    ["user-low"],
  ) as { balance: number } | undefined;
  assert.equal(row?.balance, 2);
});

test("deductCredits reduces balance and returns true when sufficient", async () => {
  await db.run(
    `INSERT INTO user_credits (user_id, balance, total_earned) VALUES (?, ?, ?)`,
    ["user-good", 10, 20],
  );

  const result = await deductCredits("user-good", 3);
  assert.equal(result, true);

  const row = await db.execute(
    `SELECT balance FROM user_credits WHERE user_id = ?`,
    ["user-good"],
  ) as { balance: number } | undefined;
  assert.equal(row?.balance, 7);
});

test("deductCredits allows deducting exact balance", async () => {
  await db.run(
    `INSERT INTO user_credits (user_id, balance, total_earned) VALUES (?, ?, ?)`,
    ["user-exact", 5, 5],
  );

  const result = await deductCredits("user-exact", 5);
  assert.equal(result, true);

  const row = await db.execute(
    `SELECT balance FROM user_credits WHERE user_id = ?`,
    ["user-exact"],
  ) as { balance: number } | undefined;
  assert.equal(row?.balance, 0);
});

test("refundCredits adds credits back to user", async () => {
  await db.run(
    `INSERT INTO user_credits (user_id, balance, total_earned) VALUES (?, ?, ?)`,
    ["user-refund", 3, 10],
  );

  await refundCredits("user-refund", 5);

  const row = await db.execute(
    `SELECT balance FROM user_credits WHERE user_id = ?`,
    ["user-refund"],
  ) as { balance: number } | undefined;
  assert.equal(row?.balance, 8);
});

// ── Run Owner ─────────────────────────────

test("getRunOwner returns userId and creditsCharged for an existing run", async () => {
  const runId = await createRun(validInput, "user-owner-test");

  const owner = await getRunOwner(runId);
  assert.equal(owner.userId, "user-owner-test");
  assert.equal(owner.creditsCharged, 1); // 1 target = 1 credit
});

test("getRunOwner returns null userId for runs without a user", async () => {
  const runId = await createRun(validInput);

  const owner = await getRunOwner(runId);
  assert.equal(owner.userId, null);
  assert.equal(owner.creditsCharged, 1);
});

test("getRunOwner returns defaults for nonexistent run", async () => {
  const owner = await getRunOwner("nonexistent-run-id");
  assert.equal(owner.userId, null);
  assert.equal(owner.creditsCharged, 0);
});

// ── Create and Get Run ─────────────────────────────

test("createRun persists run with targets and initial event", async () => {
  const runId = await createRun(validInput);
  assert.ok(runId);

  const run = await getRun(runId);
  assert.ok(run);
  assert.equal(run.status, "queued");
  assert.equal(run.targetCount, 1);
  assert.equal(run.deliveryFormat, "bestdecks_editor");
  assert.equal(run.reviewGateEnabled, true);
  assert.equal((run.targets as unknown[]).length, 1);
  assert.ok(run.events.length >= 1); // At least the run_created event
});

test("getRun returns null for nonexistent run", async () => {
  const run = await getRun("nonexistent");
  assert.equal(run, null);
});

test("updateRun changes status and lastError", async () => {
  const runId = await createRun(validInput);

  await updateRun(runId, { status: "running", lastError: null });
  let run = await getRun(runId);
  assert.equal(run?.status, "running");
  assert.equal(run?.lastError, undefined);

  await updateRun(runId, { status: "failed", lastError: "Something broke" });
  run = await getRun(runId);
  assert.equal(run?.status, "failed");
  assert.equal(run?.lastError, "Something broke");
});

test("updateRun throws for nonexistent run", async () => {
  await assert.rejects(
    () => updateRun("nope", { status: "running" }),
    /not found/i,
  );
});

// ── Artifacts and Events ─────────────────────────────

test("addArtifact and addRunEvent persist and appear in getRun", async () => {
  const runId = await createRun(validInput);

  await addArtifact(runId, {
    artifactType: "test_artifact",
    artifactJson: { test: true },
  });

  await addRunEvent(runId, {
    level: "info",
    stage: "test_stage",
    message: "Test event",
  });

  const run = await getRun(runId);
  assert.ok(run);

  const artifacts = run.artifacts as unknown as Array<{ artifact_type: string; artifact_json: { test: boolean } }>;
  const testArtifact = artifacts.find((a) => a.artifact_type === "test_artifact");
  assert.ok(testArtifact);
  assert.equal(testArtifact.artifact_json.test, true);

  const events = run.events as unknown as Array<{ stage: string; message: string }>;
  const testEvent = events.find((e) => e.stage === "test_stage");
  assert.ok(testEvent);
  assert.equal(testEvent.message, "Test event");
});

// ── updateRunTarget ─────────────────────────────

test("updateRunTarget changes target status", async () => {
  const runId = await createRun(validInput);
  const run = await getRun(runId);
  assert.ok(run);

  const targets = run.targets as unknown as Array<{ id: string; status: string }>;
  assert.equal(targets[0]?.status, "queued");

  await updateRunTarget(targets[0]!.id, { status: "processing" });

  const updated = await getRun(runId);
  const updatedTargets = updated!.targets as unknown as Array<{ id: string; status: string }>;
  assert.equal(updatedTargets[0]?.status, "processing");
});

test("updateRunTarget throws for nonexistent target", async () => {
  await assert.rejects(
    () => updateRunTarget("nonexistent-target", { status: "failed" }),
    /not found/i,
  );
});

// ── listDeliveryDecks ─────────────────────────────

test("listDeliveryDecks returns empty array when no runs exist", async () => {
  const decks = await listDeliveryDecks();
  assert.deepEqual(decks, []);
});

test("listDeliveryDecks returns targets for completed runs", async () => {
  const runId = await createRun(validInput);
  await updateRun(runId, { status: "completed" });

  const run = await getRun(runId);
  const targets = run!.targets as unknown as Array<{ id: string }>;
  await updateRunTarget(targets[0]!.id, { status: "delivered" });

  await addArtifact(runId, {
    targetId: targets[0]!.id,
    artifactType: "presentation_delivery",
    artifactJson: { provider: "plusai", url: "https://example.com/deck" },
  });

  const decks = await listDeliveryDecks();
  assert.ok(decks.length >= 1);

  const deck = decks.find((d) => d.runId === runId);
  assert.ok(deck);
  assert.equal(deck.status, "delivered");
  assert.equal(deck.websiteUrl, "https://acme.com");
  assert.equal(deck.format, "bestdecks_editor");
  assert.ok(deck.artifacts.length >= 1);
});

test("listDeliveryDecks excludes queued and failed-only runs", async () => {
  const queuedRunId = await createRun(validInput);
  // Leave status as queued (default)

  const failedRunId = await createRun({
    ...validInput,
    targets: [{ websiteUrl: "https://failed.com", companyName: "Failed" }],
  });
  await updateRun(failedRunId, { status: "failed" });

  const decks = await listDeliveryDecks();
  const runIds = decks.map((d) => d.runId);
  assert.ok(!runIds.includes(queuedRunId), "Should not include queued runs");
  assert.ok(!runIds.includes(failedRunId), "Should not include failed runs");
});
