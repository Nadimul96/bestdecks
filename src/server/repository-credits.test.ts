import test from "node:test";
import assert from "node:assert/strict";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const {
  createRun,
  decodeRunEventCursor,
  getRun,
  getOwnedRunState,
  getRunPipelineDetail,
  updateRun,
  addArtifact,
  addRunEvent,
  updateRunTarget,
  listDeliveryDecks,
} = await import("./repository");
const { getDb } = await import("./db");

let fixtureSequence = 0;

function nextUserId(label: string) {
  fixtureSequence += 1;
  return `${label}-${fixtureSequence}`;
}

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
    outputFormat: "pptx" as const,
    desiredCardCount: 8,
    tone: "consultative" as const,
    visualStyle: "premium_modern" as const,
    imagePolicy: "never" as const,
    visualContentTypes: [],
    visualDensity: "rich" as const,
    mustInclude: [],
    mustAvoid: [],
    optionalReview: false,
    allowUserApprovedCrawlException: false,
  },
  targets: [
    { websiteUrl: "https://acme.com", companyName: "Acme" },
  ],
};

function deliveredPresentationArtifact() {
  const timestamp = "2026-07-13T12:00:00.000Z";
  const url = "https://renderer.example.test/decks/fixture.pptx?private=fixture";
  return {
    outcome: "delivered",
    result: {
      presentationId: "presentation-fixture",
      exportUrl: url,
    },
    verification: {
      url,
      sha256: "a".repeat(64),
      byteLength: 1_024,
      verifiedAt: timestamp,
    },
    readiness: {
      requiredSlideFieldsPresent: true,
      ctaPresent: true,
      evidenceGatePassed: true,
      artifactReadable: true,
      providerProvenancePresent: true,
    },
    timing: {
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
    },
  };
}

function readySlidePlanArtifact() {
  return {
    outcome: "ready",
    evidenceEvaluation: {
      coverage: {
        supportedFactualClaims: 2,
        factualClaims: 2,
        ratio: 1,
        percent: 100,
      },
      unsupportedFactualClaimIds: [],
    },
  };
}

// ── Create and Get Run ─────────────────────────────

test("createRun persists run with targets and initial event", async () => {
  const userId = nextUserId("create-run");
  const runId = await createRun(validInput, userId);
  assert.ok(runId);

  const run = await getRun(runId, userId);
  assert.ok(run);
  assert.equal(run.status, "queued");
  assert.equal(run.targetCount, 1);
  assert.equal(run.deliveryFormat, "pptx");
  assert.equal(run.reviewGateEnabled, false);
  assert.equal((run.targets as unknown[]).length, 1);
  assert.ok(run.events.length >= 1); // At least the run_created event
});

test("getRun returns null for nonexistent run", async () => {
  const run = await getRun(
    nextUserId("nonexistent-run"),
    nextUserId("nonexistent-user"),
  );
  assert.equal(run, null);
});

test("pipeline detail excludes artifacts and paginates a bounded event projection", async () => {
  const userId = nextUserId("pipeline-detail");
  const runId = await createRun(validInput, userId);
  await addArtifact(runId, {
    artifactType: "crawl_result",
    artifactJson: { markdown: "x".repeat(600_000) },
  });

  const db = await getDb();
  for (const [index, stage] of ["one", "two", "three"].entries()) {
    await db.run(
      `INSERT INTO run_events (
         id, run_id, stage, level, message, created_at
       ) VALUES (?, ?, ?, 'info', ?, ?)`,
      [
        `pipeline-event-${index + 1}`,
        runId,
        stage,
        `event ${index + 1}`,
        `2099-07-13T12:00:0${index + 1}.000Z`,
      ],
    );
  }

  const firstPage = await getRunPipelineDetail(runId, userId, { eventLimit: 2 });
  assert.ok(firstPage);
  assert.equal("artifacts" in firstPage, false);
  assert.equal("questionnaire" in firstPage, false);
  assert.equal(firstPage.targets.length, 1);
  assert.deepEqual(
    Object.keys(firstPage.targets[0]!).sort(),
    [
      "company_name",
      "crawl_provider",
      "created_at",
      "id",
      "last_error",
      "status",
      "website_url",
    ],
  );
  assert.deepEqual(firstPage.events.map((event) => event.stage), ["two", "three"]);
  assert.equal(firstPage.eventPage.hasMore, true);
  assert.ok(firstPage.eventPage.nextCursor);

  const secondPage = await getRunPipelineDetail(runId, userId, {
    eventLimit: 2,
    eventCursor: decodeRunEventCursor(firstPage.eventPage.nextCursor),
  });
  assert.ok(secondPage);
  assert.ok(secondPage.events.some((event) => event.stage === "one"));
  assert.equal(await getRunPipelineDetail(runId, "different-owner"), null);
  assert.equal((await getOwnedRunState(runId, userId))?.id, runId);
  assert.equal(await getOwnedRunState(runId, "different-owner"), undefined);
});

test("updateRun changes status and lastError", async () => {
  const userId = nextUserId("update-run");
  const runId = await createRun(validInput, userId);

  await updateRun(runId, { status: "planning", lastError: null });
  let run = await getRun(runId, userId);
  assert.equal(run?.status, "planning");
  assert.equal(run?.lastError, undefined);

  await updateRun(runId, { status: "failed", lastError: "Something broke" });
  run = await getRun(runId, userId);
  assert.equal(run?.status, "failed");
  assert.equal(run?.lastError, "Something broke");
});

test("updateRun throws for nonexistent run", async () => {
  await assert.rejects(
    () => updateRun(nextUserId("missing-run"), { status: "planning" }),
    /not found/i,
  );
});

// ── Artifacts and Events ─────────────────────────────

test("addArtifact and addRunEvent persist and appear in getRun", async () => {
  const userId = nextUserId("artifact-event");
  const runId = await createRun(validInput, userId);

  await addArtifact(runId, {
    artifactType: "test_artifact",
    artifactJson: { test: true },
  });

  await addRunEvent(runId, {
    level: "info",
    stage: "test_stage",
    message: "Test event",
  });

  const run = await getRun(runId, userId);
  assert.ok(run);

  const artifacts = run.artifacts as unknown as Array<{
    artifact_type: string;
    artifact_json: { test: boolean };
  }>;
  const testArtifact = artifacts.find((a) => a.artifact_type === "test_artifact");
  assert.ok(testArtifact);
  assert.equal(testArtifact.artifact_json.test, true);

  const events = run.events as unknown as Array<{ stage: string; message: string }>;
  const testEvent = events.find((e) => e.stage === "test_stage");
  assert.ok(testEvent);
  assert.equal(testEvent.message, "Test event");
});

test("artifact and event idempotency keys prevent duplicate side effects", async () => {
  const userId = nextUserId("idempotency");
  const runId = await createRun(validInput, userId);

  await addArtifact(runId, {
    idempotencyKey: "planning-output",
    artifactType: "slide_plan",
    artifactJson: { revision: 1 },
  });
  await addArtifact(runId, {
    idempotencyKey: "planning-output",
    artifactType: "slide_plan",
    artifactJson: { revision: 2 },
  });
  await addRunEvent(runId, {
    idempotencyKey: "planning-complete",
    level: "info",
    stage: "planning",
    message: "Planning completed once",
  });
  await addRunEvent(runId, {
    idempotencyKey: "planning-complete",
    level: "info",
    stage: "planning",
    message: "Duplicate replay",
  });

  const run = await getRun(runId, userId);
  assert.ok(run);
  const artifacts = run.artifacts as unknown as Array<{
    idempotency_key: string | null;
    artifact_json: { revision?: number };
  }>;
  const events = run.events as unknown as Array<{
    idempotency_key: string | null;
    message: string;
  }>;
  const matchingArtifacts = artifacts.filter(
    ({ idempotency_key }) => idempotency_key === "planning-output",
  );
  const matchingEvents = events.filter(
    ({ idempotency_key }) => idempotency_key === "planning-complete",
  );
  assert.equal(matchingArtifacts.length, 1);
  assert.equal(matchingArtifacts[0]?.artifact_json.revision, 2);
  assert.deepEqual(matchingEvents.map(({ message }) => message), ["Planning completed once"]);
});

// ── updateRunTarget ─────────────────────────────

test("updateRunTarget changes target status", async () => {
  const userId = nextUserId("target-status");
  const runId = await createRun(validInput, userId);
  const run = await getRun(runId, userId);
  assert.ok(run);

  const targets = run.targets as unknown as Array<{ id: string; status: string }>;
  assert.equal(targets[0]?.status, "queued");

  await updateRunTarget(targets[0]!.id, { status: "processing" });

  const updated = await getRun(runId, userId);
  const updatedTargets = updated!.targets as unknown as Array<{ id: string; status: string }>;
  assert.equal(updatedTargets[0]?.status, "processing");
});

test("updateRunTarget throws for nonexistent target", async () => {
  await assert.rejects(
    () => updateRunTarget(nextUserId("missing-target"), { status: "failed" }),
    /not found/i,
  );
});

// ── listDeliveryDecks ─────────────────────────────

test("listDeliveryDecks returns empty array when no runs exist", async () => {
  const decks = await listDeliveryDecks(nextUserId("empty-delivery"));
  assert.deepEqual(decks, []);
});

test("listDeliveryDecks lists delivered targets but abstains on legacy evidence", async () => {
  const userId = nextUserId("completed-delivery");
  const runId = await createRun(validInput, userId);
  await updateRun(runId, { status: "delivered" });

  const run = await getRun(runId, userId);
  const targets = run!.targets as unknown as Array<{ id: string }>;
  await updateRunTarget(targets[0]!.id, { status: "delivered" });

  await addArtifact(runId, {
    targetId: targets[0]!.id,
    artifactType: "presentation_delivery",
    artifactJson: deliveredPresentationArtifact(),
  });
  await addArtifact(runId, {
    targetId: targets[0]!.id,
    artifactType: "slide_plan",
    artifactJson: readySlidePlanArtifact(),
  });

  const decks = await listDeliveryDecks(userId);
  assert.equal(decks.length, 1);

  const deck = decks.find((d) => d.runId === runId);
  assert.ok(deck);
  assert.equal(deck.status, "delivered");
  assert.equal(deck.websiteUrl, "https://acme.com/");
  assert.equal(deck.format, "pptx");
  assert.equal(deck.downloadAvailable, false);
  assert.equal(deck.evidence, undefined);
  assert.equal("artifacts" in deck, false);
  assert.equal(JSON.stringify(deck).includes("private=fixture"), false);
});

test("listDeliveryDecks abstains when delivery evidence is malformed", async () => {
  const userId = nextUserId("malformed-delivery");
  const runId = await createRun(validInput, userId);
  await updateRun(runId, { status: "delivered" });

  const run = await getRun(runId, userId);
  const target = (run!.targets as unknown as Array<{ id: string }>)[0]!;
  await updateRunTarget(target.id, { status: "delivered" });
  const db = await getDb();
  await db.run(
    `INSERT INTO run_artifacts (
       id, run_id, target_id, artifact_type, artifact_json, created_at
     ) VALUES (?, ?, ?, 'presentation_delivery', ?, ?)`,
    [
      nextUserId("corrupt-artifact"),
      runId,
      target.id,
      "{not-json",
      "2026-07-13T12:00:00.000Z",
    ],
  );

  const [deck] = await listDeliveryDecks(userId);
  assert.ok(deck);
  assert.equal(deck.downloadAvailable, false);
  assert.equal(deck.evidence, undefined);
});

test("listDeliveryDecks excludes queued and failed-only runs", async () => {
  const userId = nextUserId("excluded-delivery");
  const queuedRunId = await createRun(validInput, userId);
  // Leave status as queued (default)

  const failedRunId = await createRun(
    {
      ...validInput,
      targets: [{ websiteUrl: "https://failed.com", companyName: "Failed" }],
    },
    userId,
  );
  await updateRun(failedRunId, { status: "failed" });

  const decks = await listDeliveryDecks(userId);
  const runIds = decks.map((d) => d.runId);
  assert.ok(!runIds.includes(queuedRunId), "Should not include queued runs");
  assert.ok(!runIds.includes(failedRunId), "Should not include failed runs");
});
