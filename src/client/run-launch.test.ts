import test from "node:test";
import assert from "node:assert/strict";

import { shouldAutoStartRun } from "@/lib/run-launch";

test("shouldAutoStartRun returns true for queued runs that never started", () => {
  const run = {
    status: "queued",
    targets: [{ status: "queued" }],
    events: [{ stage: "run_created" }],
  } as Parameters<typeof shouldAutoStartRun>[0];

  assert.equal(shouldAutoStartRun(run), true);
});

test("shouldAutoStartRun returns false once the pipeline has started", () => {
  const run = {
    status: "queued",
    targets: [{ status: "queued" }],
    events: [{ stage: "run_created" }, { stage: "run_started" }],
  } as Parameters<typeof shouldAutoStartRun>[0];

  assert.equal(shouldAutoStartRun(run), false);
});

test("shouldAutoStartRun returns false when a target already moved past queued", () => {
  const run = {
    status: "queued",
    targets: [{ status: "brief_ready" }],
    events: [{ stage: "run_created" }],
  } as Parameters<typeof shouldAutoStartRun>[0];

  assert.equal(shouldAutoStartRun(run), false);
});

test("shouldAutoStartRun returns false for non-queued runs", () => {
  const run = {
    status: "running",
    targets: [{ status: "queued" }],
    events: [{ stage: "run_created" }],
  } as Parameters<typeof shouldAutoStartRun>[0];

  assert.equal(shouldAutoStartRun(run), false);
});
