import type { IntakeRun } from "@/src/domain/schemas";
import type {
  CompanyBrief,
  ProviderCallOptions,
  SellerDiscoveryResult,
} from "@/src/integrations/providers";

export interface SellerBriefBuilder {
  buildSellerBrief(input: IntakeRun["sellerContext"]): Promise<SellerDiscoveryResult>;
}

export interface CompanyBriefBuilder {
  buildCompanyBrief(input: {
    target: IntakeRun["targets"][number];
    sellerBrief: SellerDiscoveryResult;
    crawlMarkdown: string;
    crawlEvidence?: Array<{ url: string; text: string }>;
    sourceUrls: string[];
    enrichmentSummary: string;
    sourceEvidence?: Array<{ title: string; url: string; snippet: string }>;
  }, options?: ProviderCallOptions): Promise<CompanyBrief>;
}

export class LocalSellerBriefBuilder implements SellerBriefBuilder {
  public async buildSellerBrief(
    input: IntakeRun["sellerContext"],
  ): Promise<SellerDiscoveryResult> {
    const fallbackSummary = [
      input.companyName ? `${input.companyName} offers ${input.offerSummary}.` : input.offerSummary,
      `Services: ${input.services.join(", ")}.`,
      `Differentiators: ${input.differentiators.join(", ")}.`,
      `Target customer: ${input.targetCustomer}.`,
      `Desired outcome: ${input.desiredOutcome}.`,
    ].join(" ");

    return {
      positioningSummary: fallbackSummary,
      offerSummary: input.offerSummary,
      proofPoints: input.proofPoints,
      preferredAngles: input.differentiators,
    };
  }
}
