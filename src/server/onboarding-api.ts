import {
  onboardingPayloadSchema,
  type OnboardingPayload,
} from "@/src/domain/onboarding";
import { evaluateRunConfigurationReadiness } from "@/src/domain/run-configuration-readiness";
import { IntegrationArchiveQuotaExceededError } from "@/src/server/integration-archive-policy";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";
import type { getOnboarding } from "@/src/server/repository";
import { IntegrationSettingsValidationError } from "@/src/server/settings";
import { privateJson } from "@/src/server/private-json";

export const privateOnboardingJson = privateJson;

export function withOnboardingReadiness<
  T extends Awaited<ReturnType<typeof getOnboarding>>,
>(onboarding: T) {
  return {
    ...onboarding,
    readiness: evaluateRunConfigurationReadiness(
      onboarding.sellerContext,
      onboarding.questionnaire,
    ),
  };
}

interface OnboardingPostDependencies {
  getSession(): Promise<{ user: { id: string } } | null>;
  saveOnboarding(payload: OnboardingPayload, userId: string): Promise<void>;
  getOnboarding(userId: string): ReturnType<typeof getOnboarding>;
}

/** Build the route handler behind an injectable boundary for contract tests. */
export function createOnboardingPostHandler(
  dependencies: OnboardingPostDependencies,
) {
  return async function handleOnboardingPost(request: Request) {
    const session = await dependencies.getSession();
    if (!session?.user) {
      return privateOnboardingJson({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    try {
      const parsed = onboardingPayloadSchema.safeParse(await readBoundedJson(request));
      if (!parsed.success) {
        return privateOnboardingJson(
          { error: "Onboarding payload is invalid." },
          { status: 400 },
        );
      }
      await dependencies.saveOnboarding(parsed.data, userId);
      const onboarding = withOnboardingReadiness(
        await dependencies.getOnboarding(userId),
      );
      return privateOnboardingJson({
        ok: true,
        onboarding,
        readiness: onboarding.readiness,
      });
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return privateOnboardingJson(
          { error: "Request body is too large." },
          { status: 413 },
        );
      }
      if (error instanceof IntegrationSettingsValidationError) {
        return privateOnboardingJson(
          {
            error: "Integration settings are invalid.",
            code: error.code,
            provider: error.provider,
          },
          { status: 400 },
        );
      }
      if (error instanceof IntegrationArchiveQuotaExceededError) {
        return privateOnboardingJson(
          {
            error: "Integration settings archive limit reached.",
            code: error.code,
          },
          {
            status: 429,
            headers: { "Retry-After": String(error.retryAfterSeconds) },
          },
        );
      }
      return privateOnboardingJson(
        { error: "Unable to save onboarding state." },
        { status: 500 },
      );
    }
  };
}
