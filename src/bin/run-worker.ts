import { setTimeout as delay } from "node:timers/promises";

import { runNextReferenceJob } from "@/src/server/run-executor";

const IDLE_POLL_MS = 2_000;

async function main() {
  const runOnce = process.argv.includes("--once");
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    const result = await runNextReferenceJob();
    if (runOnce) return;
    if (result === "idle" && !stopping) {
      await delay(IDLE_POLL_MS);
    }
  } while (!stopping);
}

main().catch((error) => {
  console.error("Reference worker stopped after an unrecoverable process error.", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
});
