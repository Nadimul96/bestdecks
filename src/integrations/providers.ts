import type { DeliveryFormat, ImagePolicy } from "../domain/schemas";
import type {
  DeckArchetype,
  Tone,
  VisualStyle,
} from "../domain/schemas";

export type CrawlProviderName = "cloudflare" | "deepcrawl";

export interface CrawlPage {
  url: string;
  title?: string;
  html?: string;
  markdown?: string;
  statusCode?: number;
}

export interface CrawlRequest {
  websiteUrl: string;
  maxPages?: number;
  maxDepth?: number;
  source?: "all" | "sitemaps" | "links";
  render?: boolean;
  maxAgeSeconds?: number;
  modifiedSinceUnixSeconds?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  includeExternalLinks?: boolean;
  includeSubdomains?: boolean;
  rejectResourceTypes?: string[];
  requestedFormats: Array<"html" | "markdown" | "json">;
  userApprovedException?: boolean;
}

export interface CrawlResult {
  provider: CrawlProviderName;
  pages: CrawlPage[];
  blockedUrls: string[];
  discoveredUrls: string[];
  rawJobId?: string;
  status?: string;
}

export interface CrawlProvider {
  name: CrawlProviderName;
  crawlSite(request: CrawlRequest): Promise<CrawlResult>;
}

export interface SellerDiscoveryInput {
  sellerWebsiteUrl?: string;
  offerSummary: string;
  services: string[];
  differentiators: string[];
  targetCustomer: string;
  desiredOutcome: string;
}

export interface SellerDiscoveryResult {
  positioningSummary: string;
  offerSummary: string;
  proofPoints: string[];
  preferredAngles: string[];
}

export interface EnrichmentRequest {
  websiteUrl: string;
  companyName?: string;
  sellerPositioningSummary: string;
  requestedSignals: string[];
}

export interface EnrichmentEvidence {
  title: string;
  url: string;
  snippet: string;
}

export interface EnrichmentResult {
  synthesizedSummary: string;
  evidence: EnrichmentEvidence[];
  confidence: "low" | "medium" | "high";
}

export interface EnrichmentProvider {
  name: "perplexity";
  enrichCompany(request: EnrichmentRequest): Promise<EnrichmentResult>;
}

export interface CompanyBrief {
  websiteUrl: string;
  companyName?: string;
  industry: string;
  offer: string;
  locale?: string;
  likelyBuyer?: string;
  whyNow?: string;
  painPoints: string[];
  proofPoints: string[];
  pitchAngles: string[];
  sourceUrls: string[];
}

export interface DeckGenerationInput {
  companyBrief: CompanyBrief;
  sellerPositioningSummary: string;
  archetype: DeckArchetype;
  objective: string;
  audience: string;
  cardCount: number;
  callToAction: string;
  tone: Tone;
  visualStyle: VisualStyle;
  mustInclude: string[];
  mustAvoid: string[];
  outputFormat: DeliveryFormat;
  imagePolicy: ImagePolicy;
}

export interface ImageGenerationRequest {
  companyBrief: CompanyBrief;
  sellerPositioningSummary: string;
  visualStyle: string;
  objective: string;
}

export interface ImageGenerationResult {
  assetUrls: string[];
  rationale: string;
}

export interface ImageProvider {
  name: "gemini";
  generateSupportingAssets(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResult>;
}

export interface PresentonResult {
  presentationId: string;
  editorUrl?: string;
  exportUrl?: string;
  rawPath?: string;
}

export type DeckProviderName = "presenton" | "plusai";

export interface DeckProvider {
  name: DeckProviderName;
  createDeck(
    input: DeckGenerationInput,
    imageUrls?: string[],
  ): Promise<PresentonResult>;
}

/** @deprecated Use DeckProvider instead */
export type PresentonProvider = DeckProvider;

export class UnconfiguredCloudflareCrawler implements CrawlProvider {
  public readonly name = "cloudflare" as const;

  public async crawlSite(_request: CrawlRequest): Promise<CrawlResult> {
    throw new Error("Cloudflare crawler is not configured.");
  }
}

export class UnconfiguredDeepcrawlCrawler implements CrawlProvider {
  public readonly name = "deepcrawl" as const;

  public async crawlSite(_request: CrawlRequest): Promise<CrawlResult> {
    throw new Error("Deepcrawl fallback crawler is not configured.");
  }
}

export async function crawlWithFallback(
  request: CrawlRequest,
  primary: CrawlProvider,
  fallback: CrawlProvider,
): Promise<CrawlResult> {
  try {
    return await primary.crawlSite(request);
  } catch (error) {
    if (request.userApprovedException && primary.name === "cloudflare") {
      return fallback.crawlSite(request);
    }

    if (error instanceof Error) {
      return fallback.crawlSite(request);
    }

    throw error;
  }
}
