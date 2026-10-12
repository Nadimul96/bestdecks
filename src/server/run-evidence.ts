import { projectClaimLedger, type ClaimLedgerView } from "@/src/domain/claim-ledger-view";
import { getDb } from "@/src/server/db";
import { shareCheckpointKey } from "@/src/server/shareable-deck-contract";

export interface TargetEvidence {
  targetId: string;
  companyName: string;
  websiteUrl: string;
  status: string;
  /** "ready" passed the gate; "blocked" did not; null means no plan exists yet. */
  planningOutcome: "ready" | "blocked" | null;
  ledger: ClaimLedgerView | null;
}

const MAX_TARGETS = 100;

/**
 * Per-target claim ledgers for one run, read from committed planning
 * checkpoints only. Returns null when the run does not belong to the user.
 */
export async function getRunEvidence(runId: string, userId: string): Promise<TargetEvidence[] | null> {
  const db = await getDb();
  const run = await db.execute(
    "SELECT user_id FROM runs WHERE id = ? LIMIT 1",
    [runId],
  ) as { user_id: string | null } | undefined;
  if (!run || run.user_id !== userId) return null;

  const targets = await db.executeAll(
    `SELECT id, website_url, company_name, status
     FROM run_targets
     WHERE run_id = ?
     ORDER BY target_ordinal ASC, id ASC
     LIMIT ?`,
    [runId, MAX_TARGETS],
  ) as unknown as Array<{ id: string; website_url: string; company_name: string | null; status: string }>;
  if (targets.length === 0) return [];

  const keys = targets.map((target) => shareCheckpointKey(target.id, "planning"));
  const checkpoints = await db.executeAll(
    `SELECT checkpoint_key, metadata_json
     FROM run_checkpoints
     WHERE run_id = ? AND stage = 'planning' AND checkpoint_key IN (${keys.map(() => "?").join(",")})`,
    [runId, ...keys],
  ) as unknown as Array<{ checkpoint_key: string; metadata_json: string | null }>;
  const byKey = new Map(checkpoints.map((row) => [row.checkpoint_key, parseJson(row.metadata_json)]));

  return targets.map((target) => {
    const planning = byKey.get(shareCheckpointKey(target.id, "planning")) as
      | { outcome?: unknown; plan?: { evidence?: unknown } }
      | undefined;
    const outcome = planning?.outcome === "ready" || planning?.outcome === "blocked"
      ? planning.outcome
      : null;
    return {
      targetId: target.id,
      companyName: target.company_name ?? "",
      websiteUrl: target.website_url,
      status: target.status,
      planningOutcome: outcome,
      ledger: planning?.plan?.evidence ? projectClaimLedger(planning.plan.evidence) : null,
    };
  });
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
