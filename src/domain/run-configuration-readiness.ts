import { runQuestionnaireSchema, sellerContextSchema } from "@/src/domain/schemas";

export interface RunConfigurationReadiness {
  ready: boolean;
  sellerReady: boolean;
  questionnaireReady: boolean;
  missingSellerFields: string[];
  missingQuestionnaireFields: string[];
}

function issueFields(
  issues: Array<{ path: PropertyKey[] }>,
): string[] {
  return [...new Set(
    issues.map((issue) => String(issue.path.at(-1) ?? "configuration")),
  )].sort();
}

/**
 * One readiness decision shared by API projections and setup UI. The same
 * canonical schemas used by run admission decide whether saved facts suffice.
 */
export function evaluateRunConfigurationReadiness(
  sellerContext: unknown,
  questionnaire: unknown,
): RunConfigurationReadiness {
  const seller = sellerContextSchema.safeParse(sellerContext);
  const settings = runQuestionnaireSchema.safeParse(questionnaire);
  const sellerReady = seller.success;
  const questionnaireReady = settings.success;

  return {
    ready: sellerReady && questionnaireReady,
    sellerReady,
    questionnaireReady,
    missingSellerFields: seller.success ? [] : issueFields(seller.error.issues),
    missingQuestionnaireFields: settings.success ? [] : issueFields(settings.error.issues),
  };
}
