import type { DeliveryFormat, ImagePolicy } from "../domain/schemas";
import {
  providerCallObservabilitySchema,
  type ProviderCallObservability,
} from "../domain/provider-observability";
import type {
  DeckArchetype,
  Tone,
  VisualStyle,
} from "../domain/schemas";
import type {
  RichStaticLayoutId,
  VisualProfileVerification,
} from "../domain/visual-profile";

export type CrawlProviderName = "cloudflare" | "deepcrawl";

export interface ProviderCallOptions {
  signal?: AbortSignal;
  /** Receives normalized, non-secret metadata after a successful provider call. */
  onObservability?: (observability: ProviderCallObservability) => void;
}

/**
 * Observability is best-effort instrumentation: a consumer callback must not
 * turn an already-billable successful call into a retryable provider failure.
 */
export function reportProviderObservability(
  options: ProviderCallOptions,
  observability: ProviderCallObservability | undefined,
) {
  if (!observability) return;
  const parsed = providerCallObservabilitySchema.parse(observability);
  try {
    options.onObservability?.(parsed);
  } catch {
    // Never replay a paid side effect because a local metrics sink failed.
  }
}

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
  crawlSite(request: CrawlRequest, options?: ProviderCallOptions): Promise<CrawlResult>;
}

export interface ResumableCrawlProvider extends CrawlProvider {
  startCrawl(request: CrawlRequest, options?: ProviderCallOptions): Promise<string>;
  resumeCrawl(
    jobId: string,
    request: CrawlRequest,
    options?: ProviderCallOptions,
  ): Promise<CrawlResult>;
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
  commonObjections?: Array<{ objection: string; response: string }>;
  pricingModel?: string;
  pricingContext?: string;
  bestCaseStudy?: { clientName: string; industry: string; results: string };
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
  enrichCompany(
    request: EnrichmentRequest,
    options?: ProviderCallOptions,
  ): Promise<EnrichmentResult>;
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
  /**
   * Verbatim target facts retained with the URL whose captured text contains
   * them. Slide planning may call a fact source-backed only through this
   * provenance list; `sourceUrls` alone is not evidence of entailment.
   */
  sourceClaims?: Array<{
    text: string;
    sourceUrl: string;
  }>;
  /** The single most compelling metric that quantifies this company's core challenge */
  anchorMetric?: string;
  /** A contrarian framing of their situation that competitors wouldn't use */
  contrarianAngle?: string;
  /** How solving one problem compounds: "fixing X enables Y, which unlocks Z" */
  compoundingLogic?: string;
}

export interface DeckGenerationInput {
  companyBrief: CompanyBrief;
  sellerPositioningSummary: string;
  archetype: DeckArchetype;
  customArchetypePrompt?: string;
  objective: string;
  audience: string;
  cardCount: number;
  callToAction: string;
  tone: Tone;
  customTone?: string;
  visualStyle: VisualStyle;
  customVisualStyle?: string;
  mustInclude: string[];
  mustAvoid: string[];
  outputFormat: DeliveryFormat;
  imagePolicy: ImagePolicy;
  visualContentTypes?: string[];
  visualDensity?: string;
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
    options?: ProviderCallOptions,
  ): Promise<ImageGenerationResult>;
}

export interface PresentonResult {
  presentationId: string;
  editorUrl?: string;
  exportUrl?: string;
  rawPath?: string;
  /** Google Slides presentation ID (if generated via Plus AI) */
  googleSlidesId?: string;
  /** Google Slides embed URL for in-browser preview */
  embedUrl?: string;
  /** Direct PDF export URL */
  pdfExportUrl?: string;
  /** Direct PPTX export URL */
  pptxExportUrl?: string;
  usage?: {
    unit: "credits";
    amount: number;
  };
}

export interface ArtifactVerification {
  url: string;
  sha256: string;
  /** Must not exceed MAX_DELIVERY_ARTIFACT_BYTES. */
  byteLength: number;
  contentType?: string;
  verifiedAt: string;
  contentVerification: {
    method: "pptx_ooxml_rich_static_v2";
    sha256: string;
    slideCount: number;
  };
  visualProfile: VisualProfileVerification;
}

export interface ArtifactVerificationOptions extends ProviderCallOptions {
  /** Exact evidence-gated visible text the renderer must preserve per slide. */
  expectedSlides: Array<{
    headline: string;
    bulletPoints: string[];
  }>;
  /** Exact closed-set layout request used for the render being verified. */
  layoutIds: RichStaticLayoutId[];
}

export type DeckProviderName = "presenton" | "plusai" | "alai";

export interface ExactVisibleSlide {
  headline: string;
  bulletPoints: string[];
}

export interface DeckCreateOptions extends ProviderCallOptions {
  /** A validated, evidence-gated slide plan to preserve during rendering. */
  slidePlanPrompt?: string;
  /** Exact per-slide Markdown for renderers that support structured input. */
  slidesMarkdown?: string[];
  /** Exact evidence-gated visible text for deterministic renderers. */
  exactSlides?: ExactVisibleSlide[];
  /** Exact locally selected layout IDs; provider-side auto-selection is forbidden. */
  layoutIds?: RichStaticLayoutId[];
  /** Stable across retries. Providers that support it can deduplicate side effects. */
  idempotencyKey?: string;
}

export interface DeckProvider {
  name: DeckProviderName;
  createDeck(
    input: DeckGenerationInput,
    imageUrls?: string[],
    options?: DeckCreateOptions,
  ): Promise<PresentonResult>;
  verifyArtifact?(
    result: PresentonResult,
    options: ArtifactVerificationOptions,
  ): Promise<ArtifactVerification>;
}

/** @deprecated Use DeckProvider instead */
export type PresentonProvider = DeckProvider;
