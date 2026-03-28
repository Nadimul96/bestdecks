import { buildRunPlan } from "../domain/pipeline";
import type { IntakeRun } from "../domain/schemas";
import { crawlWithFallback } from "../integrations/providers";
import type {
  CompanyBrief,
  CrawlPage,
  CrawlProvider,
  EnrichmentProvider,
  ImageProvider,
  PresentonProvider,
  SellerDiscoveryResult,
} from "../integrations/providers";
import type { CommunityIntelProvider, CommunityIntelResult } from "../integrations/community-intel";

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
    communityIntel?: CommunityIntelResult;
  }): Promise<CompanyBrief>;
}

export interface ProposalOrchestratorDependencies {
  primaryCrawler: CrawlProvider;
  fallbackCrawler: CrawlProvider;
  enrichmentProvider: EnrichmentProvider;
  communityIntelProvider?: CommunityIntelProvider;
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
        const crawlRequest = buildCrawlRequest(
          target.websiteUrl,
          input.questionnaire.allowUserApprovedCrawlException,
        );

        // Run crawl, enrichment, and community intel in parallel — all independent
        const crawlPromise = crawlWithFallback(
          crawlRequest,
          this.dependencies.primaryCrawler,
          this.dependencies.fallbackCrawler,
        );
        const enrichmentPromise = this.dependencies.enrichmentProvider.enrichCompany({
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
        // Community intel is optional — runs in parallel but failures are non-blocking
        const communityIntelPromise = this.dependencies.communityIntelProvider
          ? this.dependencies.communityIntelProvider.gatherCommunityInsights({
              industry: target.companyName ?? target.websiteUrl,
              companyName: target.companyName,
              websiteUrl: target.websiteUrl,
              sellerOffer: sellerBrief.positioningSummary,
            }).catch((err) => {
              console.warn("[orchestrator] Community intel failed (non-blocking):", err);
              return undefined;
            })
          : Promise.resolve(undefined);

        const [crawlResult, enrichment, communityIntel] = await Promise.all([
          crawlPromise,
          enrichmentPromise,
          communityIntelPromise,
        ]);
        const relevantCrawl = narrowCrawlResult(target.websiteUrl, crawlResult);

        const companyBrief = await this.dependencies.companyBriefBuilder.buildCompanyBrief({
          target,
          sellerBrief,
          crawlMarkdown: relevantCrawl.pages
            .map((page) => page.markdown)
            .filter((value): value is string => Boolean(value))
            .join("\n\n---\n\n"),
          sourceUrls: [
            ...relevantCrawl.discoveredUrls,
            ...enrichment.evidence.map((item) => item.url),
          ],
          enrichmentSummary: enrichment.synthesizedSummary,
          communityIntel: communityIntel ?? undefined,
        });

        return { target, crawlResult: relevantCrawl, enrichment, companyBrief };
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

function buildCrawlRequest(
  websiteUrl: string,
  userApprovedException: boolean,
) {
  const normalizedPath = normalizePathname(websiteUrl);
  const scopedPath = normalizedPath !== "/";

  return {
    websiteUrl,
    maxPages: scopedPath ? 5 : 10,
    maxDepth: scopedPath ? 1 : 2,
    source: scopedPath ? "links" as const : "all" as const,
    requestedFormats: ["markdown"] as Array<"markdown">,
    includePatterns: undefined,
    excludePatterns: undefined,
    userApprovedException,
  };
}

function narrowCrawlResult<T extends { pages: CrawlPage[]; discoveredUrls: string[] }>(
  targetUrl: string,
  crawlResult: T,
): T {
  const normalizedPath = normalizePathname(targetUrl);
  if (normalizedPath === "/") {
    return crawlResult;
  }

  const pages = crawlResult.pages.filter((page) => isRelevantUrl(targetUrl, page.url));
  const discoveredUrls = crawlResult.discoveredUrls.filter((url) => isRelevantUrl(targetUrl, url));

  if (pages.length === 0 && discoveredUrls.length === 0) {
    return crawlResult;
  }

  return {
    ...crawlResult,
    pages: pages.length > 0 ? pages : crawlResult.pages,
    discoveredUrls: discoveredUrls.length > 0 ? discoveredUrls : crawlResult.discoveredUrls,
  };
}

function normalizePathname(url: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return pathname === "" ? "/" : pathname;
  } catch {
    return "/";
  }
}

function isRelevantUrl(targetUrl: string, candidateUrl: string) {
  try {
    const target = new URL(targetUrl);
    const candidate = new URL(candidateUrl);
    if (target.hostname !== candidate.hostname) {
      return false;
    }

    const targetPath = normalizePathname(targetUrl);
    const candidatePath = normalizePathname(candidateUrl);
    return candidatePath === targetPath || candidatePath.startsWith(`${targetPath}/`);
  } catch {
    return false;
  }
}
