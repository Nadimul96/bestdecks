import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { parseRunReceipt } from "@/src/domain/run-receipt";

const artifactRoot = process.env.BESTDECKS_TEST_ARTIFACT_ROOT
  ?? join(tmpdir(), "bestdecks-retained-test-artifacts");
mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
const retainedDirectory = mkdtempSync(join(artifactRoot, "run-executor-process-"));
const databasePath = join(retainedDirectory, "worker-restart.sqlite");
const callLogPath = join(retainedDirectory, "provider-calls.jsonl");
const fixturePath = resolve("src/server/fixtures/run-executor-process-child.ts");

process.env.APP_SECRETS_KEY = "8".repeat(32);
process.env.LOCAL_DB_PATH = databasePath;
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "b".repeat(32);
process.env.SEED_ADMIN_ON_STARTUP = "0";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { createRun, getRun } = await import("./repository");
const { getDb } = await import("./db");

interface FixtureProcess {
  child: ChildProcessWithoutNullStreams;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output(): { stdout: string; stderr: string };
  waitForOutput(marker: string): Promise<void>;
}

function spawnFixture(phase: "phase1" | "phase2"): FixtureProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    LOCAL_DB_PATH: databasePath,
    BESTDECKS_PROCESS_TEST_PHASE: phase,
    BESTDECKS_PROCESS_TEST_CALL_LOG: callLogPath,
  };
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fixturePath],
    {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 20_000,
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolvePromise, rejectPromise) => {
      child.once("error", rejectPromise);
      child.once("exit", (code, signal) => resolvePromise({ code, signal }));
    },
  );
  const waitForOutput = (marker: string) => {
    if (stdout.includes(marker)) return Promise.resolve();
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const cleanup = () => {
        child.stdout.off("data", handleData);
        child.off("exit", handleExit);
      };
      const handleData = () => {
        if (!stdout.includes(marker)) return;
        cleanup();
        resolvePromise();
      };
      const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        rejectPromise(new Error(
          `Fixture exited before ${marker} (code=${code}, signal=${signal}). `
          + `stdout=${stdout.trim()} stderr=${stderr.trim()}`,
        ));
      };
      child.stdout.on("data", handleData);
      child.once("exit", handleExit);
    });
  };
  return {
    child,
    exited,
    output: () => ({ stdout, stderr }),
    waitForOutput,
  };
}

function input() {
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
    targets: [{
      websiteUrl: "https://process-target.example.com",
      companyName: "Process Target",
    }],
  };
}

async function waitUntilAfter(isoTimestamp: string) {
  const delayMs = Date.parse(isoTimestamp) - Date.now() + 25;
  if (delayMs > 0) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, delayMs));
  }
}

test("a new worker process resumes the durable crawl job after its predecessor crashes", {
  timeout: 30_000,
}, async () => {
  const owner = "process-restart-owner";
  const runId = await createRun(input(), owner);
  const phase1 = spawnFixture("phase1");
  await phase1.waitForOutput("PHASE1_BLOCKED durable-process-crawl-job-1\n");

  const db = await getDb();
  const phase1Checkpoints = await db.executeAll(
    `SELECT checkpoint_key
     FROM run_checkpoints
     WHERE run_id = ?
     ORDER BY checkpoint_key ASC`,
    [runId],
  ) as unknown as Array<{ checkpoint_key: string }>;
  assert.equal(
    phase1Checkpoints.filter(({ checkpoint_key }) => checkpoint_key.endsWith(":crawl-dispatch:v1"))
      .length,
    1,
  );
  assert.equal(
    phase1Checkpoints.filter(({ checkpoint_key }) => checkpoint_key.endsWith(":crawl-job:v1"))
      .length,
    1,
  );
  assert.equal(
    phase1Checkpoints.some(({ checkpoint_key }) => checkpoint_key.endsWith(":crawl-response:v1")),
    false,
  );

  assert.equal(phase1.child.kill("SIGKILL"), true);
  const phase1Exit = await phase1.exited;
  assert.equal(phase1Exit.signal, "SIGKILL");
  const crashedJob = await db.execute(
    `SELECT lease_owner, lease_expires_at
     FROM run_jobs
     WHERE run_id = ?`,
    [runId],
  ) as unknown as { lease_owner: string | null; lease_expires_at: string | null };
  assert.equal(crashedJob.lease_owner, "process-fixture-phase1");
  assert.ok(crashedJob.lease_expires_at);
  await waitUntilAfter(crashedJob.lease_expires_at);

  const phase2 = spawnFixture("phase2");
  await phase2.waitForOutput("PHASE2_DONE\n");
  const phase2Exit = await phase2.exited;
  const phase2Output = phase2.output();
  assert.deepEqual(phase2Exit, { code: 0, signal: null }, phase2Output.stderr);

  const calls = readFileSync(callLogPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as {
      event: string;
      phase: string;
      jobId?: string;
    });
  const starts = calls.filter(({ event }) => event === "crawl_start");
  const resumes = calls.filter(({ event }) => event === "crawl_resume");
  assert.equal(starts.length, 1);
  assert.deepEqual(
    resumes.map(({ phase, jobId }) => [phase, jobId]),
    [
      ["phase1", "durable-process-crawl-job-1"],
      ["phase2", "durable-process-crawl-job-1"],
    ],
  );

  const run = await getRun(runId, owner);
  assert.ok(run);
  assert.equal(run.status, "delivered");
  const receiptArtifact = (run.artifacts as Array<{
    artifact_type: string;
    artifact_json: unknown;
  }>).find(({ artifact_type }) => artifact_type === "run_receipt");
  assert.ok(receiptArtifact);
  const receipt = parseRunReceipt(receiptArtifact.artifact_json);
  assert.equal(receipt.terminalState, "delivered");
  assert.equal(receipt.targets[0]?.artifact?.sha256, "d".repeat(64));

  const activeJobs = await db.execute(
    `SELECT COUNT(*) AS count
     FROM run_jobs
     WHERE state IN ('queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering')`,
  ) as unknown as { count: number | bigint };
  assert.equal(Number(activeJobs.count), 0);
  const terminalJob = await db.execute(
    `SELECT state, lease_owner, lease_expires_at
     FROM run_jobs
     WHERE run_id = ?`,
    [runId],
  ) as unknown as {
    state: string;
    lease_owner: string | null;
    lease_expires_at: string | null;
  };
  assert.deepEqual(terminalJob, {
    state: "delivered",
    lease_owner: null,
    lease_expires_at: null,
  });
  const attempts = await db.executeAll(
    `SELECT status, final_state
     FROM run_attempts
     WHERE run_id = ?
     ORDER BY attempt_number ASC`,
    [runId],
  ) as unknown as Array<{ status: string; final_state: string | null }>;
  assert.deepEqual(attempts, [
    { status: "expired", final_state: "crawling" },
    { status: "completed", final_state: "delivered" },
  ]);
});
