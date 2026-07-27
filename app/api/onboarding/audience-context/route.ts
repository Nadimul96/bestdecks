import { getSession } from "@/src/server/auth";
import { privateJson } from "@/src/server/private-json";
import { getAudienceContext } from "@/src/server/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/audience-context
 * Returns saved audience context (industry, size, pain points, must-include/avoid)
 * extracted during the website crawl. Used by run-settings autofill.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getAudienceContext(session.user.id);
    return privateJson(data ?? {});
  } catch {
    return privateJson({});
  }
}
