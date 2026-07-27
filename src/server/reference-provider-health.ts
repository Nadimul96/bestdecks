import {
  uncheckedProviderHealth,
  type ProviderHealth,
} from "@/src/domain/provider-observability";
import {
  CLOUDFLARE_CRAWLER_METADATA,
  CloudflareCrawler,
} from "@/src/integrations/cloudflare";
import {
  ALAI_DECK_PROVIDER_METADATA,
  AlaiDeckProvider,
} from "@/src/integrations/alai";
import {
  DEEPCRAWL_CRAWLER_METADATA,
  DeepcrawlCrawler,
} from "@/src/integrations/deepcrawl";
import {
  GEMINI_IMAGE_PROVIDER_METADATA,
  GeminiImageProvider,
} from "@/src/integrations/gemini";
import {
  PERPLEXITY_ENRICHMENT_METADATA,
  PerplexityEnrichmentProvider,
} from "@/src/integrations/perplexity";
import {
  PresentonDeckProvider,
  presentonProviderMetadata,
} from "@/src/integrations/presenton";
import {
  PLUS_AI_DECK_PROVIDER_METADATA,
  PlusAiDeckProvider,
} from "@/src/integrations/plusai";
import {
  AiBriefBuilder,
  GEMINI_BRIEF_BUILDER_METADATA,
} from "@/src/server/ai-brief-builder";
import {
  GEMINI_SLIDE_PLANNER_METADATA,
  SlidePlanner,
} from "@/src/server/slide-planner";

export interface ReferenceProviderConfiguration {
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  perplexityApiKey?: string;
  geminiApiKey?: string;
  presentonBaseUrl?: string;
  presentonApiKey?: string;
  presentonAuthUsername?: string;
  presentonAuthPassword?: string;
  presentonTemplate?: string;
  allowPrivateProviderUrls?: boolean;
}

export interface ExperimentalProviderConfiguration {
  deepcrawlApiKey?: string;
  alaiApiKey?: string;
  plusAiApiKey?: string;
  geminiApiKey?: string;
}

export interface ReferenceProviderStatus {
  stage: "crawling" | "enriching" | "planning" | "asset_generation" | "rendering";
  providerId: string;
  modelId: string | null;
  contractVersion: number;
  health: ProviderHealth;
}

function configurationPasses(construct: () => unknown) {
  try {
    construct();
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the reference adapters locally. Constructors perform no provider
 * requests, and the returned objects contain no configuration values.
 */
export function buildReferenceProviderStatuses(
  configuration: ReferenceProviderConfiguration,
): ReferenceProviderStatus[] {
  const cloudflareConfigured = configurationPasses(() => new CloudflareCrawler({
    accountId: configuration.cloudflareAccountId ?? "",
    apiToken: configuration.cloudflareApiToken ?? "",
  }));
  const perplexityConfigured = configurationPasses(() =>
    new PerplexityEnrichmentProvider(configuration.perplexityApiKey ?? "")
  );
  const briefConfigured = configurationPasses(() =>
    new AiBriefBuilder(configuration.geminiApiKey ?? "")
  );
  const planningConfigured = configurationPasses(() =>
    new SlidePlanner(configuration.geminiApiKey ?? "")
  );
  const presentonConfigured = configurationPasses(() => new PresentonDeckProvider({
    baseUrl: configuration.presentonBaseUrl ?? "",
    apiKey: configuration.presentonApiKey,
    basicAuthUsername: configuration.presentonAuthUsername,
    basicAuthPassword: configuration.presentonAuthPassword,
    defaultTemplate: configuration.presentonTemplate,
    allowPrivateNetwork: configuration.allowPrivateProviderUrls,
  }));

  return [
    {
      stage: "crawling",
      providerId: CLOUDFLARE_CRAWLER_METADATA.providerId,
      modelId: CLOUDFLARE_CRAWLER_METADATA.modelId,
      contractVersion: CLOUDFLARE_CRAWLER_METADATA.contractVersion,
      health: uncheckedProviderHealth(cloudflareConfigured),
    },
    {
      stage: "enriching",
      providerId: PERPLEXITY_ENRICHMENT_METADATA.providerId,
      modelId: PERPLEXITY_ENRICHMENT_METADATA.defaultModelId,
      contractVersion: PERPLEXITY_ENRICHMENT_METADATA.contractVersion,
      health: uncheckedProviderHealth(perplexityConfigured),
    },
    {
      stage: "enriching",
      providerId: GEMINI_BRIEF_BUILDER_METADATA.providerId,
      modelId: GEMINI_BRIEF_BUILDER_METADATA.defaultModelId,
      contractVersion: GEMINI_BRIEF_BUILDER_METADATA.contractVersion,
      health: uncheckedProviderHealth(briefConfigured),
    },
    {
      stage: "planning",
      providerId: GEMINI_SLIDE_PLANNER_METADATA.providerId,
      modelId: GEMINI_SLIDE_PLANNER_METADATA.defaultModelId,
      contractVersion: GEMINI_SLIDE_PLANNER_METADATA.contractVersion,
      health: uncheckedProviderHealth(planningConfigured),
    },
    {
      stage: "rendering",
      providerId: presentonProviderMetadata.providerId,
      modelId: presentonProviderMetadata.modelId,
      contractVersion: presentonProviderMetadata.contractVersion,
      health: uncheckedProviderHealth(presentonConfigured),
    },
  ];
}

/**
 * Constructor-only status for adapters outside the durable reference path.
 * This does not activate them and deliberately retains no reachability or
 * live-smoke claim.
 */
export function buildExperimentalProviderStatuses(
  configuration: ExperimentalProviderConfiguration,
): ReferenceProviderStatus[] {
  const deepcrawlConfigured = configurationPasses(() => new DeepcrawlCrawler({
    apiKey: configuration.deepcrawlApiKey ?? "",
  }));
  const alaiConfigured = configurationPasses(() => new AlaiDeckProvider({
    apiKey: configuration.alaiApiKey ?? "",
  }));
  const plusAiConfigured = configurationPasses(() => new PlusAiDeckProvider({
    apiKey: configuration.plusAiApiKey ?? "",
  }));
  const geminiImageConfigured = configurationPasses(() => new GeminiImageProvider(
    configuration.geminiApiKey ?? "",
  ));

  return [
    {
      stage: "crawling",
      providerId: DEEPCRAWL_CRAWLER_METADATA.providerId,
      modelId: DEEPCRAWL_CRAWLER_METADATA.modelId,
      contractVersion: DEEPCRAWL_CRAWLER_METADATA.contractVersion,
      health: uncheckedProviderHealth(deepcrawlConfigured),
    },
    {
      stage: "asset_generation",
      providerId: GEMINI_IMAGE_PROVIDER_METADATA.providerId,
      modelId: GEMINI_IMAGE_PROVIDER_METADATA.modelId,
      contractVersion: GEMINI_IMAGE_PROVIDER_METADATA.contractVersion,
      health: uncheckedProviderHealth(geminiImageConfigured),
    },
    {
      stage: "rendering",
      providerId: ALAI_DECK_PROVIDER_METADATA.providerId,
      modelId: ALAI_DECK_PROVIDER_METADATA.modelId,
      contractVersion: ALAI_DECK_PROVIDER_METADATA.contractVersion,
      health: uncheckedProviderHealth(alaiConfigured),
    },
    {
      stage: "rendering",
      providerId: PLUS_AI_DECK_PROVIDER_METADATA.providerId,
      modelId: PLUS_AI_DECK_PROVIDER_METADATA.modelId,
      contractVersion: PLUS_AI_DECK_PROVIDER_METADATA.contractVersion,
      health: uncheckedProviderHealth(plusAiConfigured),
    },
  ];
}

export function buildAllProviderStatuses(
  configuration: ReferenceProviderConfiguration & ExperimentalProviderConfiguration,
) {
  return [
    ...buildReferenceProviderStatuses(configuration),
    ...buildExperimentalProviderStatuses(configuration),
  ];
}
