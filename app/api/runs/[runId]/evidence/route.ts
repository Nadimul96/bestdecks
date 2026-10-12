import { getSession } from "@/src/server/auth";
import { privateJson } from "@/src/server/private-json";
import { getRunEvidence } from "@/src/server/run-evidence";

export const dynamic = "force-dynamic";

/** GET /api/runs/:runId/evidence: the claim ledger the delivery gate evaluated, per target. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return privateJson({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await context.params;
  if (!runId || runId.length > 512) return privateJson({ error: "Run not found." }, { status: 404 });

  let targets;
  try {
    targets = await getRunEvidence(runId, session.user.id);
  } catch {
    return privateJson({ error: "Evidence is unavailable." }, { status: 500 });
  }
  if (!targets) return privateJson({ error: "Run not found." }, { status: 404 });
  return privateJson({ targets });
}
