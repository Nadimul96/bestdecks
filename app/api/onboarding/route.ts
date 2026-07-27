import { saveOnboarding, getOnboarding } from "@/src/server/repository";
import { getSession } from "@/src/server/auth";
import {
  createOnboardingPostHandler,
  privateOnboardingJson,
  withOnboardingReadiness,
} from "@/src/server/onboarding-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return privateOnboardingJson({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  return privateOnboardingJson(
    withOnboardingReadiness(await getOnboarding(userId)),
  );
}

export const POST = createOnboardingPostHandler({
  getSession,
  saveOnboarding,
  getOnboarding,
});
