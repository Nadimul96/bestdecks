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

    const preparedCompanies = [];

    for (const target of input.targets) {
      const crawlResult = await crawlWithFallback(
        {
          websiteUrl: target.websiteUrl,
          maxPages: 100,
          maxDepth: 5,
          source: "all",
          requestedFormats: ["markdown"],
          includePatterns: undefined,
          excludePatterns: undefined,
          userApprovedException:
            input.questionnaire.allowUserApprovedCrawlException,
        },
        this.dependencies.primaryCrawler,
        this.dependencies.fallbackCrawler,
      );

      const enrichment = await this.dependencies.enrichmentProvider.enrichCompany({
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
      });

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

      preparedCompanies.push({
        target,
        crawlResult,
        enrichment,
        companyBrief,
      });
    }

    return {
      plan,
      sellerBrief,
      preparedCompanies,
    };
  }
}
