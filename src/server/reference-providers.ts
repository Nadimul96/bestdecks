import type { ProviderSelection } from "@/src/config/provider-selection";
import {
  BUILTIN_CRAWLER_METADATA,
  BuiltinCrawler,
} from "@/src/integrations/builtin-crawler";
import {
  CLOUDFLARE_CRAWLER_METADATA,
  CloudflareCrawler,
} from "@/src/integrations/cloudflare";
import {
  PERPLEXITY_ENRICHMENT_METADATA,
  PerplexityEnrichmentProvider,
} from "@/src/integrations/perplexity";
import type {
  EnrichmentProvider,
  ResumableCrawlProvider,
} from "@/src/integrations/providers";
import {
  SITE_RESEARCH_METADATA,
  SiteResearchProvider,
} from "@/src/integrations/site-research";

/** Provider IDs a persisted crawl checkpoint may name. */
export const CRAWL_PROVIDER_IDS = [
  BUILTIN_CRAWLER_METADATA.providerId,
  CLOUDFLARE_CRAWLER_METADATA.providerId,
] as const;

export interface CrawlAndResearchCredentials {
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  perplexityApiKey?: string;
  geminiApiKey?: string;
}

interface StageProvenance {
  stage: "crawling" | "enriching";
  providerId: string;
  modelId: string | null;
  contractVersion: number;
}

export type CrawlAndResearchProviders =
  | {
      ok: true;
      crawler: ResumableCrawlProvider;
      enrichmentProvider: EnrichmentProvider;
      configurationNames: string[];
      provenance: StageProvenance[];
    }
  | { ok: false; missing: "cloudflare" | "perplexity" | "gemini" };

/**
 * Construct the selected crawl and research adapters. Returns the missing
 * component instead of throwing so the worker can report it in its own
 * non-retryable configuration error.
 */
export function createCrawlAndResearchProviders(
  selection: ProviderSelection,
  credentials: CrawlAndResearchCredentials,
): CrawlAndResearchProviders {
  const configurationNames: string[] = [];
  let crawler: ResumableCrawlProvider;
  let crawlProvenance: StageProvenance;
  if (selection.crawl.provider === "cloudflare") {
    if (!credentials.cloudflareAccountId || !credentials.cloudflareApiToken) {
      return { ok: false, missing: "cloudflare" };
    }
    crawler = new CloudflareCrawler({
      accountId: credentials.cloudflareAccountId,
      apiToken: credentials.cloudflareApiToken,
    });
    configurationNames.push("cloudflare.account_id", "cloudflare.api_token");
    crawlProvenance = {
      stage: "crawling",
      providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
      modelId: CLOUDFLARE_CRAWLER_METADATA.modelId,
      contractVersion: CLOUDFLARE_CRAWLER_METADATA.contractVersion,
    };
  } else {
    crawler = new BuiltinCrawler();
    configurationNames.push("crawl.builtin");
    crawlProvenance = {
      stage: "crawling",
      providerId: BUILTIN_CRAWLER_METADATA.providerId,
      modelId: BUILTIN_CRAWLER_METADATA.modelId,
      contractVersion: BUILTIN_CRAWLER_METADATA.contractVersion,
    };
  }

  let enrichmentProvider: EnrichmentProvider;
  let researchProvenance: StageProvenance;
  if (selection.research.provider === "perplexity") {
    if (!credentials.perplexityApiKey) return { ok: false, missing: "perplexity" };
    enrichmentProvider = new PerplexityEnrichmentProvider(credentials.perplexityApiKey);
    configurationNames.push("perplexity.api_key");
    researchProvenance = {
      stage: "enriching",
      providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
      modelId: enrichmentProvider.modelId,
      contractVersion: PERPLEXITY_ENRICHMENT_METADATA.contractVersion,
    };
  } else {
    if (!credentials.geminiApiKey) return { ok: false, missing: "gemini" };
    enrichmentProvider = new SiteResearchProvider(credentials.geminiApiKey);
    configurationNames.push("research.site");
    researchProvenance = {
      stage: "enriching",
      providerId: SITE_RESEARCH_METADATA.providerId,
      modelId: enrichmentProvider.modelId,
      contractVersion: SITE_RESEARCH_METADATA.contractVersion,
    };
  }

  return {
    ok: true,
    crawler,
    enrichmentProvider,
    configurationNames,
    provenance: [crawlProvenance, researchProvenance],
  };
}
