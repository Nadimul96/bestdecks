import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const {
  createRunWithOptions,
  getOwnedRunState,
  preflightRunAdmission,
  RunAdmissionError,
} = await import("./repository");
const { getDb } = await import("./db");

function input(websiteUrl = "https://target.example.test", targetCount = 1) {
  return {
    sellerContext: {
      websiteUrl: "https://seller.example.test",
      companyName: "Seller",
      offerSummary: "Evidence-backed proposals",
      services: ["Research"],
      differentiators: ["Retained evidence"],
      targetCustomer: "Revenue teams",
      desiredOutcome: "Book a meeting",
      proofPoints: [],
      constraints: [],
    },
    questionnaire: {
      archetype: "cold_outreach" as const,
      audience: "Revenue leader",
      objective: "Book a meeting",
      callToAction: "Book a meeting",
      outputFormat: "pptx" as const,
      desiredCardCount: 6,
      tone: "consultative" as const,
      visualStyle: "auto" as const,
      imagePolicy: "never" as const,
      mustInclude: [],
      mustAvoid: [],
      visualContentTypes: [],
      visualDensity: "rich" as const,
      optionalReview: false,
      allowUserApprovedCrawlException: false,
    },
    targets: Array.from({ length: targetCount }, (_, index) => ({
      websiteUrl: targetCount === 1 ? websiteUrl : `https://target-${index}.example.test`,
    })),
  };
}

test("run admission returns the original run for an exact idempotent replay", async () => {
  const userId = "admission-idempotent-user";
  const idempotencyKey = "admission-idempotent-0001";
  const first = await createRunWithOptions(input(), userId, { idempotencyKey });
  const replay = await createRunWithOptions(input(), userId, { idempotencyKey });

  assert.equal(replay, first);
  const row = await (await getDb()).execute(
    "SELECT COUNT(*) AS count FROM runs WHERE user_id = ?",
    [userId],
  ) as { count: number | bigint } | undefined;
  assert.equal(Number(row?.count), 1);
  assert.deepEqual(await getOwnedRunState(first, userId), {
    id: first,
    status: "queued",
    deliveryFormat: "pptx",
  });
});

test("preflight returns an exact replay before external target validation", async () => {
  const userId = "admission-preflight-replay-user";
  const idempotencyKey = "admission-preflight-replay-0001";
  const runId = await createRunWithOptions(input(), userId, { idempotencyKey });

  const result = await preflightRunAdmission(input(), userId, idempotencyKey);
  assert.deepEqual(result.replay, { runId, state: "queued" });
});

test("reference admission rejects non-PPTX runs before reserving or enqueueing work", async () => {
  const userId = "admission-output-boundary-user";
  const unsupported = {
    ...input(),
    questionnaire: {
      ...input().questionnaire,
      outputFormat: "pdf" as const,
    },
  };

  await assert.rejects(
    preflightRunAdmission(unsupported, userId, "admission-output-boundary-0001"),
    /requires PPTX output/u,
  );
  await assert.rejects(
    createRunWithOptions(unsupported, userId, {
      idempotencyKey: "admission-output-boundary-0001",
    }),
    /requires PPTX output/u,
  );

  const db = await getDb();
  const runCount = await db.execute(
    "SELECT COUNT(*) AS count FROM runs WHERE user_id = ?",
    [userId],
  ) as { count: number | bigint } | undefined;
  const rateReservation = await db.execute(
    "SELECT request_count FROM run_admission_rate_limits WHERE user_id = ?",
    [userId],
  );
  assert.equal(Number(runCount?.count), 0);
  assert.equal(rateReservation, undefined);
});

test("reference admission rejects unverified visual-asset generation before work is reserved", async () => {
  const userId = "admission-visual-boundary-user";
  const unsupported = {
    ...input(),
    questionnaire: {
      ...input().questionnaire,
      imagePolicy: "always" as const,
    },
  };

  await assert.rejects(
    preflightRunAdmission(unsupported, userId, "admission-visual-boundary-0001"),
    /rich-static vector profile/u,
  );
  await assert.rejects(
    createRunWithOptions(unsupported, userId, {
      idempotencyKey: "admission-visual-boundary-0001",
    }),
    /rich-static vector profile/u,
  );

  const db = await getDb();
  const runCount = await db.execute(
    "SELECT COUNT(*) AS count FROM runs WHERE user_id = ?",
    [userId],
  ) as { count: number | bigint } | undefined;
  const rateReservation = await db.execute(
    "SELECT request_count FROM run_admission_rate_limits WHERE user_id = ?",
    [userId],
  );
  assert.equal(Number(runCount?.count), 0);
  assert.equal(rateReservation, undefined);
});

test("preflight rate-limits authenticated admission attempts before DNS work", async () => {
  const userId = "admission-request-rate-user";
  const windowStart = new Date("2026-07-13T12:00:00.000Z");
  for (let index = 0; index < 30; index += 1) {
    await preflightRunAdmission(
      input(),
      userId,
      `admission-request-rate-${index.toString().padStart(4, "0")}`,
      { now: windowStart },
    );
  }

  await assert.rejects(
    preflightRunAdmission(input(), userId, "admission-request-rate-0030", {
      now: windowStart,
    }),
    (error: unknown) =>
      error instanceof RunAdmissionError && error.code === "request_rate_limit",
  );

  await preflightRunAdmission(input(), userId, "admission-request-rate-reset", {
    now: new Date("2026-07-13T13:00:00.000Z"),
  });
});

test("run admission rejects reuse of a key for different input", async () => {
  const userId = "admission-conflict-user";
  const idempotencyKey = "admission-conflict-0001";
  await createRunWithOptions(input(), userId, { idempotencyKey });

  await assert.rejects(
    createRunWithOptions(input("https://different.example.test"), userId, { idempotencyKey }),
    (error: unknown) =>
      error instanceof RunAdmissionError && error.code === "idempotency_conflict",
  );
});

test("run admission caps active paid work per tenant", async () => {
  const userId = "admission-active-limit-user";
  for (let index = 0; index < 3; index += 1) {
    await createRunWithOptions(input(`https://target-${index}.example.test`), userId, {
      idempotencyKey: `admission-active-${index.toString().padStart(4, "0")}`,
    });
  }

  await assert.rejects(
    createRunWithOptions(input("https://fourth.example.test"), userId, {
      idempotencyKey: "admission-active-0004",
    }),
    (error: unknown) =>
      error instanceof RunAdmissionError && error.code === "active_run_limit",
  );
});

test("run admission caps active target volume per tenant", async () => {
  const userId = "admission-target-limit-user";
  await createRunWithOptions(input(undefined, 100), userId, {
    idempotencyKey: "admission-targets-0100",
  });

  await assert.rejects(
    createRunWithOptions(input("https://extra.example.test"), userId, {
      idempotencyKey: "admission-targets-0101",
    }),
    (error: unknown) =>
      error instanceof RunAdmissionError && error.code === "active_run_limit",
  );
});
