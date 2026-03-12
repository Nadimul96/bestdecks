import type {
  CompanyRow,
  DeliveryFormat,
  IntakeRun,
  RunQuestionnaire,
  SellerContext,
} from "./schemas";

export const pipelineStageOrder = [
  "seller_discovery",
  "target_crawl",
  "target_enrichment",
  "company_brief",
  "deck_strategy",
  "image_strategy",
  "presentation_generation",
  "delivery",
] as const;

export type PipelineStage = (typeof pipelineStageOrder)[number];

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "partially_completed";

export type CompanyJobStatus =
  | "queued"
  | "crawling"
  | "enriching"
  | "brief_ready"
  | "deck_ready"
  | "delivered"
  | "blocked"
  | "failed";

export interface StagePlanItem {
  stage: PipelineStage;
  reason: string;
  required: boolean;
}

export interface CompanyJobPlan {
  websiteUrl: string;
  companyName?: string;
  stages: StagePlanItem[];
}

export interface RunPlan {
  sellerContext: SellerContext;
  questionnaire: RunQuestionnaire;
  deliveryFormat: DeliveryFormat;
  companyJobs: CompanyJobPlan[];
  reviewGateEnabled: boolean;
}

function buildStageList(questionnaire: RunQuestionnaire, sellerContext: SellerContext) {
  return pipelineStageOrder.map<StagePlanItem>((stage) => {
    switch (stage) {
      case "seller_discovery":
        return {
          stage,
          reason: sellerContext.websiteUrl
            ? "Seller website is available and should be crawled before target analysis."
            : "Seller website is missing, so typed seller context becomes the primary source.",
          required: true,
        };
      case "target_crawl":
        return {
          stage,
          reason:
            "Each target company must be crawled so the system can build a grounded company understanding layer.",
          required: true,
        };
      case "target_enrichment":
        return {
          stage,
          reason:
            "External research augments the crawl with recent or missing facts for stronger personalization.",
          required: true,
        };
      case "company_brief":
        return {
          stage,
          reason:
            "Raw crawl and search evidence must be collapsed into a concise, citation-backed company brief.",
          required: true,
        };
      case "deck_strategy":
        return {
          stage,
          reason:
            "The normalized questionnaire and seller context must be converted into a deterministic deck brief.",
          required: true,
        };
      case "image_strategy":
        return {
          stage,
          reason:
            questionnaire.imagePolicy === "never"
              ? "Image generation is disabled, but the system should still decide how to use existing assets."
              : "The system should decide whether generated imagery will improve the presentation.",
          required: true,
        };
      case "presentation_generation":
        return {
          stage,
          reason:
            "The presentation engine should receive a condensed brief, not raw research material.",
          required: true,
        };
      case "delivery":
        return {
          stage,
          reason: `Run output must be delivered as ${questionnaire.outputFormat}.`,
          required: true,
        };
    }
  });
}

export function buildRunPlan(input: IntakeRun): RunPlan {
  const sharedStages = buildStageList(input.questionnaire, input.sellerContext);

  return {
    sellerContext: input.sellerContext,
    questionnaire: input.questionnaire,
    deliveryFormat: input.questionnaire.outputFormat,
    reviewGateEnabled: input.questionnaire.optionalReview,
    companyJobs: input.targets.map<CompanyJobPlan>((target: CompanyRow) => ({
      websiteUrl: target.websiteUrl,
      companyName: target.companyName,
      stages: sharedStages,
    })),
  };
}

export function summarizePlan(plan: RunPlan) {
  return {
    deliveryFormat: plan.deliveryFormat,
    companyCount: plan.companyJobs.length,
    reviewGateEnabled: plan.reviewGateEnabled,
    sellerDiscoveryMode: plan.sellerContext.websiteUrl ? "crawl" : "typed_context_only",
  };
}
