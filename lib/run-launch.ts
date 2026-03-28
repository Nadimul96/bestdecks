import type { RunDetail } from "@/lib/workspace-types";

const RECENT_DISPATCH_WINDOW_MS = 30_000;
const recentDispatches = new Map<string, number>();

function pruneRecentDispatches(now: number) {
  for (const [runId, timestamp] of recentDispatches.entries()) {
    if (now - timestamp >= RECENT_DISPATCH_WINDOW_MS) {
      recentDispatches.delete(runId);
    }
  }
}

export function dispatchRunStart(runId: string) {
  const now = Date.now();
  pruneRecentDispatches(now);

  const lastDispatchAt = recentDispatches.get(runId);
  if (lastDispatchAt && now - lastDispatchAt < RECENT_DISPATCH_WINDOW_MS) {
    return false;
  }

  recentDispatches.set(runId, now);

  const url = `/api/runs/${runId}/launch`;

  void fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  }).then((response) => {
    if (!response.ok) {
      recentDispatches.delete(runId);
      console.error(`[run-launch] Failed to dispatch run ${runId}: HTTP ${response.status}`);
    }
  }).catch((error) => {
    recentDispatches.delete(runId);
    console.error(`[run-launch] Failed to dispatch run ${runId}:`, error);
  });

  return true;
}

export function hasRecentRunStartAttempt(runId: string) {
  const now = Date.now();
  pruneRecentDispatches(now);

  const lastDispatchAt = recentDispatches.get(runId);
  return typeof lastDispatchAt === "number" &&
    now - lastDispatchAt < RECENT_DISPATCH_WINDOW_MS;
}

type LaunchableRun = Pick<RunDetail, "status" | "targets" | "events">;

const STARTED_STAGES = new Set([
  "run_started",
  "seller_brief",
  "crawl",
  "company_brief",
  "image_strategy",
  "slide_planning",
  "delivery",
  "target_failed",
  "run_finished",
  "run_failed",
  "timeout",
]);

export function shouldAutoStartRun(run: LaunchableRun | null | undefined) {
  if (!run || run.status !== "queued" || run.targets.length === 0) {
    return false;
  }

  if (run.targets.some((target) => target.status !== "queued")) {
    return false;
  }

  const stages = new Set(
    run.events.map((event) => event.stage).filter((stage): stage is string => Boolean(stage)),
  );

  if (!stages.has("run_created")) {
    return false;
  }

  return !Array.from(STARTED_STAGES).some((stage) => stages.has(stage));
}
