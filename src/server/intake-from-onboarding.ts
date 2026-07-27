import type { QuestionnaireDraft, SellerContextDraft } from "@/src/domain/onboarding";
import type { IntakeRun } from "@/src/domain/schemas";
import { RICH_STATIC_VISUAL_PROFILE } from "@/src/domain/visual-profile";

type RunConfiguration = Pick<IntakeRun, "sellerContext" | "questionnaire">;

/**
 * Convert saved drafts into a run candidate without inventing business facts.
 * Empty required facts deliberately remain empty so the canonical IntakeRun
 * schema can abstain with a field-level validation error before admission.
 */
export function buildOnboardingRunConfiguration(
  seller: SellerContextDraft,
  questionnaire: QuestionnaireDraft,
): RunConfiguration {
  const sellerWebsiteUrl = seller.websiteUrl?.trim()
    ? (/^https?:\/\//iu.test(seller.websiteUrl)
        ? seller.websiteUrl
        : `https://${seller.websiteUrl}`)
    : undefined;
  const configuredOutput = questionnaire.outputFormat as string | undefined;

  return {
    sellerContext: {
      websiteUrl: sellerWebsiteUrl,
      companyName: seller.companyName || undefined,
      offerSummary: seller.offerSummary ?? "",
      services: seller.services ?? [],
      differentiators: seller.differentiators ?? [],
      targetCustomer: seller.targetCustomer ?? "",
      desiredOutcome: seller.desiredOutcome ?? "",
      proofPoints: seller.proofPoints ?? [],
      constraints: seller.constraints ?? [],
    },
    questionnaire: {
      archetype: questionnaire.archetype ?? "cold_outreach",
      audience: questionnaire.audience ?? "",
      objective: questionnaire.objective ?? "",
      callToAction: questionnaire.callToAction ?? "",
      outputFormat: configuredOutput === "presenton_editor"
        ? "pptx"
        : (questionnaire.outputFormat ?? "pptx"),
      desiredCardCount: questionnaire.desiredCardCount ?? 8,
      tone: questionnaire.tone ?? "consultative",
      visualStyle: questionnaire.visualStyle ?? "auto",
      // v0.1 is visually rich through audited native vector layouts. Generated
      // or remotely fetched media stays outside the attested artifact profile.
      imagePolicy: RICH_STATIC_VISUAL_PROFILE.imagePolicy,
      mustInclude: questionnaire.mustInclude ?? [],
      mustAvoid: questionnaire.mustAvoid ?? [],
      extraInstructions: questionnaire.extraInstructions || undefined,
      customArchetypePrompt: questionnaire.customArchetypePrompt || undefined,
      customTone: questionnaire.customTone || undefined,
      customVisualStyle: questionnaire.customVisualStyle || undefined,
      visualContentTypes: [...RICH_STATIC_VISUAL_PROFILE.visualContentTypes],
      visualDensity: RICH_STATIC_VISUAL_PROFILE.visualDensity,
      optionalReview: false,
      allowUserApprovedCrawlException: false,
    },
  };
}
