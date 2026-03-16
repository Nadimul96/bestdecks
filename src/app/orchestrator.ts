import { buildRunPlan } from "../domain/pipeline";
import type { IntakeRun } from "../domain/schemas";
import { crawlWithFallback } from "../integrations/providers";
import type {
  CompanyBrief,
  CrawlProvider,
  EnrichmentProvider,
  ImageProvider,
  PresentonProvider,
  SellerDiscoveryResult,
} from "../integrations/providers";

export interface SellerBriefBuilder {
  buildSellerBrief(input: IntakeRun["sellerContext"]): Promise<SellerDiscoveryResult>;
}

export interface CompanyBriefBuilder {
  buildCompanyBrief(input: {
    target: IntakeRun["targets"][number];
    sellerBrief: SellerDiscoveryResult;
    crawlMarkdown: string;
    sourceUrls: string[];
    enrichmentSummary: string;
  }): Promise<CompanyBrief>;
}

export interface ProposalOrchestratorDependencies {
  primaryCrawler: CrawlProvider;
  fallbackCrawler: CrawlProvider;
  enrichmentProvider: EnrichmentProvider;
  imageProvider?: ImageProvider;
  presentonProvider?: PresentonProvider;
  sellerBriefBuilder: SellerBriefBuilder;
  companyBriefBuilder: CompanyBriefBuilder;
}

export class ProposalOrchestrator {
  private readonly dependencies: ProposalOrchestratorDependencies;

  public constructor(dependencies: ProposalOrchestratorDependencies) {
    this.dependencies = dependencies;
  }

  public async prepareRun(input: IntakeRun) {
    const plan = buildRunPlan(input);
    const sellerBrief = await this.dependencies.sellerBriefBuilder.buildSellerBrief(
      input.sellerContext,
    );

    const preparedCompanies: Array<{
      target: IntakeRun["targets"][number];
      crawlResult: Awaited<ReturnType<typeof crawlWithFallback>>;
      enrichment: Awaited<ReturnType<EnrichmentProvider["enrichCompany"]>>;
      companyBrief: CompanyBrief;
    }> = [];
    const failedCompanies: Array<{
      target: IntakeRun["targets"][number];
      stage: "crawl_or_enrichment";
      message: string;
    }> = [];

    // Process all targets concurrently for maximum speed
    const targetResults = await Promise.allSettled(
      input.targets.map(async (target) => {
        // Run crawl and enrichment in parallel — they're independent
        const [crawlResult, enrichment] = await Promise.all([
          crawlWithFallback(
            {
              websiteUrl: target.websiteUrl,
              maxPages: 10,
              maxDepth: 2,
              source: "all",
              requestedFormats: ["markdown"],
              includePatterns: undefined,
              excludePatterns: undefined,
              userApprovedException:
                input.questionnaire.allowUserApprovedCrawlException,
            },
            this.dependencies.primaryCrawler,
            this.dependencies.fallbackCrawler,
          ),
          this.dependencies.enrichmentProvider.enrichCompany({
            websiteUrl: target.websiteUrl,
            companyName: target.companyName,
            sellerPositioningSummary: sellerBrief.positioningSummary,
            requestedSignals: [
              "industry",
              "locale",
              "recent activity",
              "buyer signals",
              "observable proof points",
            ],
          }),
        ]);

        const companyBrief = await this.dependencies.companyBriefBuilder.buildCompanyBrief({
          target,
          sellerBrief,
          crawlMarkdown: crawlResult.pages
            .map((page) => page.markdown)
            .filter((value): value is string => Boolean(value))
            .join("\n\n---\n\n"),
          sourceUrls: [
            ...crawlResult.discoveredUrls,
            ...enrichment.evidence.map((item) => item.url),
          ],
          enrichmentSummary: enrichment.synthesizedSummary,
        });

        return { target, crawlResult, enrichment, companyBrief };
      }),
    );

    for (let i = 0; i < targetResults.length; i++) {
      const result = targetResults[i];
      if (result.status === "fulfilled") {
        preparedCompanies.push(result.value);
      } else {
        failedCompanies.push({
          target: input.targets[i],
          stage: "crawl_or_enrichment",
          message:
            result.reason instanceof Error
              ? result.reason.message
              : "Target preparation failed for an unknown reason.",
        });
      }
    }

    return {
      plan,
      sellerBrief,
      preparedCompanies,
      failedCompanies,
    };
  }
}
