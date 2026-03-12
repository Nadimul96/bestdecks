import { loadEnv } from "../config/env";
import { CloudflareCrawler } from "../integrations/cloudflare";
import { GeminiImageProvider } from "../integrations/gemini";
import { PerplexityEnrichmentProvider } from "../integrations/perplexity";
import { PresentonDeckProvider } from "../integrations/presenton";

export class MissingConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MissingConfigurationError";
  }
}

export function createCloudflareCrawlerFromEnv() {
  const env = loadEnv();
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new MissingConfigurationError(
      "Cloudflare requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
    );
  }

  return new CloudflareCrawler({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  });
}

export function createPerplexityEnrichmentFromEnv() {
  const env = loadEnv();
  if (!env.PERPLEXITY_API_KEY) {
    throw new MissingConfigurationError("Perplexity requires PERPLEXITY_API_KEY.");
  }

  return new PerplexityEnrichmentProvider(env.PERPLEXITY_API_KEY);
}

export function createGeminiImageProviderFromEnv() {
  const env = loadEnv();
  if (!env.GEMINI_API_KEY) {
    throw new MissingConfigurationError("Gemini requires GEMINI_API_KEY.");
  }

  return new GeminiImageProvider(env.GEMINI_API_KEY);
}

export function createPresentonProviderFromEnv() {
  const env = loadEnv();
  if (!env.PRESENTON_BASE_URL) {
    throw new MissingConfigurationError("Presenton requires PRESENTON_BASE_URL.");
  }

  return new PresentonDeckProvider({
    baseUrl: env.PRESENTON_BASE_URL,
    apiKey: env.PRESENTON_API_KEY,
    defaultTemplate: env.PRESENTON_TEMPLATE,
  });
}
