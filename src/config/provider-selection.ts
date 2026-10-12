/**
 * Which crawl and research adapters the reference worker uses.
 *
 * New installs default to the free path (built-in crawler + first-party site
 * research, which needs only a Gemini key). An install that predates these
 * settings and already has Cloudflare or Perplexity credentials keeps using
 * them until it sets the variables explicitly, so upgrading changes nothing.
 */

export const CRAWL_PROVIDERS = ["builtin", "cloudflare"] as const;
export const RESEARCH_PROVIDERS = ["site", "perplexity"] as const;

export type CrawlProviderChoice = (typeof CRAWL_PROVIDERS)[number];
export type ResearchProviderChoice = (typeof RESEARCH_PROVIDERS)[number];

export type SelectionReason = "explicit" | "existing_credentials" | "free_default";

export interface ProviderSelectionInput {
  crawlProvider?: CrawlProviderChoice;
  researchProvider?: ResearchProviderChoice;
  cloudflareConfigured: boolean;
  perplexityConfigured: boolean;
}

export interface ProviderSelection {
  crawl: { provider: CrawlProviderChoice; reason: SelectionReason };
  research: { provider: ResearchProviderChoice; reason: SelectionReason };
}

export function selectReferenceProviders(input: ProviderSelectionInput): ProviderSelection {
  return {
    crawl: input.crawlProvider
      ? { provider: input.crawlProvider, reason: "explicit" }
      : input.cloudflareConfigured
        ? { provider: "cloudflare", reason: "existing_credentials" }
        : { provider: "builtin", reason: "free_default" },
    research: input.researchProvider
      ? { provider: input.researchProvider, reason: "explicit" }
      : input.perplexityConfigured
        ? { provider: "perplexity", reason: "existing_credentials" }
        : { provider: "site", reason: "free_default" },
  };
}

/** Selection from resolved integration settings (env or tenant records). */
export function selectionFromConfiguration(configuration: {
  crawlProvider?: CrawlProviderChoice;
  researchProvider?: ResearchProviderChoice;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  perplexityApiKey?: string;
}): ProviderSelection {
  return selectReferenceProviders({
    crawlProvider: configuration.crawlProvider,
    researchProvider: configuration.researchProvider,
    // A partial Cloudflare configuration still signals intent: select it so
    // the missing half is reported instead of silently switching crawlers.
    cloudflareConfigured: Boolean(configuration.cloudflareAccountId || configuration.cloudflareApiToken),
    perplexityConfigured: Boolean(configuration.perplexityApiKey),
  });
}
