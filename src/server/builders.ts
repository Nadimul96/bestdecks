import type {
  CompanyBriefBuilder,
  SellerBriefBuilder,
} from "@/src/app/orchestrator";
import type { IntakeRun } from "@/src/domain/schemas";
import type { CompanyBrief, SellerDiscoveryResult } from "@/src/integrations/providers";
import { getSellerBriefMd } from "@/src/server/repository";

function firstNonEmptySentence(input: string) {
  return input
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
}

export class LocalSellerBriefBuilder implements SellerBriefBuilder {
  public async buildSellerBrief(
    input: IntakeRun["sellerContext"],
  ): Promise<SellerDiscoveryResult> {
    // If a comprehensive .md brief exists from onboarding, use it as the
    // positioning summary — it contains far richer context than the form fields.
    const sellerBriefMd = getSellerBriefMd();

    const fallbackSummary = [
      input.companyName ? `${input.companyName} offers ${input.offerSummary}.` : input.offerSummary,
      `Services: ${input.services.join(", ")}.`,
      `Differentiators: ${input.differentiators.join(", ")}.`,
      `Target customer: ${input.targetCustomer}.`,
      `Desired outcome: ${input.desiredOutcome}.`,
    ].join(" ");

    return {
      positioningSummary: sellerBriefMd ?? fallbackSummary,
      offerSummary: input.offerSummary,
      proofPoints: input.proofPoints,
      preferredAngles: input.differentiators,
    };
  }
}

export class LocalCompanyBriefBuilder implements CompanyBriefBuilder {
  public async buildCompanyBrief(input: {
    target: IntakeRun["targets"][number];
    sellerBrief: SellerDiscoveryResult;
    crawlMarkdown: string;
    sourceUrls: string[];
    enrichmentSummary: string;
  }): Promise<CompanyBrief> {
    const companyName =
      input.target.companyName ??
      new URL(input.target.websiteUrl).hostname.replace(/^www\./, "");
    const summarySentence =
      firstNonEmptySentence(input.enrichmentSummary) ??
      "Company summary inferred from website crawl and supporting research.";

    return {
      websiteUrl: input.target.websiteUrl,
      companyName,
      industry: "Research-backed target profile",
      offer: summarySentence,
      locale: input.enrichmentSummary.match(/\b[A-Z][a-z]+,\s?[A-Z]{2}\b/)?.[0],
      likelyBuyer: input.target.role ?? "Founder or growth leader",
      whyNow: firstNonEmptySentence(input.enrichmentSummary),
      painPoints: [
        "Needs a pitch that reflects current website evidence and business context.",
        "May have mismatches between site positioning and outbound messaging.",
        "Likely receives generic outreach that lacks company-specific relevance.",
      ],
      proofPoints: [
        ...input.sellerBrief.proofPoints,
        input.enrichmentSummary,
      ].slice(0, 5),
      pitchAngles: input.sellerBrief.preferredAngles.slice(0, 5),
      sourceUrls: input.sourceUrls.filter((value, index, all) => all.indexOf(value) === index),
    };
  }
}
