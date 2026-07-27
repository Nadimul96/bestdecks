import { z } from "zod";

import { requestText, sleep } from "./http";
import {
  invalidProviderConfiguration,
  normalizeProviderTransportError,
  parseProviderJson,
  ProviderAdapterError,
  providerErrorFromStatus,
  type ProviderAdapterMetadata,
} from "./provider-contract";
import {
  reportProviderObservability,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ProviderCallOptions,
} from "./providers";

const DEFAULT_MODEL_ID = "gemini-3.1-flash-image-preview";

export const GEMINI_IMAGE_PROVIDER_METADATA = {
  providerId: "google.gemini.image-generation",
  apiVersion: "v1beta",
  modelId: DEFAULT_MODEL_ID,
  contractVersion: 1,
  capabilities: {
    imageGeneration: true,
    responseModalities: ["Image"],
    inlineBase64Assets: true,
    aspectRatios: ["16:9"],
    usageMetadata: true,
  },
  releaseStatus: "experimental",
} as const satisfies ProviderAdapterMetadata;

const DISPLAY_NAME = "Gemini image generation";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_INLINE_BASE64_CHARS = 24 * 1024 * 1024;
const IMAGE_COUNT = 3;

const UsageCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const GeminiUsageMetadataSchema = z.object({
  promptTokenCount: UsageCountSchema.optional(),
  cachedContentTokenCount: UsageCountSchema.optional(),
  candidatesTokenCount: UsageCountSchema.optional(),
  toolUsePromptTokenCount: UsageCountSchema.optional(),
  thoughtsTokenCount: UsageCountSchema.optional(),
  totalTokenCount: UsageCountSchema.optional(),
}).strict();

const InlineBase64Schema = z.string().min(1).max(MAX_INLINE_BASE64_CHARS)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/u);
const ImageMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
const GeminiResponsePartSchema = z.object({
  text: z.string().max(100_000).optional(),
  inlineData: z.object({
    mimeType: ImageMimeTypeSchema,
    data: InlineBase64Schema,
  }).strict().optional(),
  inline_data: z.object({
    mime_type: ImageMimeTypeSchema,
    data: InlineBase64Schema,
  }).strict().optional(),
}).strict().refine(
  (part) => !(part.inlineData && part.inline_data),
  "Gemini image parts cannot contain two inline payload shapes.",
);

const GeminiGenerateContentResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(GeminiResponsePartSchema).max(32),
    }).strict(),
  }).strict()).max(8).optional(),
  usageMetadata: GeminiUsageMetadataSchema.optional(),
}).strict();

const GeminiImageConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(8_192),
  model: z.literal(DEFAULT_MODEL_ID),
  requestTimeoutMs: z.number().int().min(100).max(300_000),
  maxRetries: z.number().int().min(0).max(5),
  retryBaseDelayMs: z.number().int().min(0).max(30_000),
}).strict();

const ImageRequestBoundarySchema = z.object({
  industry: z.string().trim().min(1).max(2_000),
  offer: z.string().trim().min(1).max(10_000),
  locale: z.string().trim().min(1).max(1_000).optional(),
  sellerPositioningSummary: z.string().trim().min(1).max(20_000),
  objective: z.string().trim().min(1).max(5_000),
  visualStyle: z.string().trim().min(1).max(1_000),
}).strict();

const VisualContentTypesSchema = z.array(
  z.string().trim().min(1).max(100),
).max(10).optional();

export interface GeminiImageProviderOptions {
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

interface GeneratedImageCallResult {
  assetUrls: string[];
}

export class GeminiImageProvider implements ImageProvider {
  public readonly name = "gemini" as const;
  public readonly providerId = GEMINI_IMAGE_PROVIDER_METADATA.providerId;
  public readonly modelId: string;
  public readonly capabilities = GEMINI_IMAGE_PROVIDER_METADATA.capabilities;
  public readonly contractVersion = GEMINI_IMAGE_PROVIDER_METADATA.contractVersion;

  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private visualContentTypes?: string[];

  public constructor(
    apiKey: string,
    model = DEFAULT_MODEL_ID,
    options: GeminiImageProviderOptions = {},
  ) {
    const parsed = GeminiImageConfigSchema.safeParse({
      apiKey,
      model,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    });
    if (!parsed.success) {
      throw invalidProviderConfiguration(this.providerId, DISPLAY_NAME);
    }

    this.apiKey = parsed.data.apiKey;
    this.modelId = parsed.data.model;
    this.requestTimeoutMs = parsed.data.requestTimeoutMs;
    this.maxRetries = parsed.data.maxRetries;
    this.retryBaseDelayMs = parsed.data.retryBaseDelayMs;
  }

  public setVisualContentTypes(types?: string[]): void {
    const parsed = VisualContentTypesSchema.safeParse(types);
    if (!parsed.success) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "configuration",
        "configuration",
        false,
      );
    }
    this.visualContentTypes = parsed.data;
  }

  /**
   * Three independently billable image requests are intentional. Failed or
   * indeterminate calls are never replayed except after an explicit 429.
   */
  public async generateSupportingAssets(
    request: ImageGenerationRequest,
    options: ProviderCallOptions = {},
  ): Promise<ImageGenerationResult> {
    if (options.signal?.aborted) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "generate",
        "aborted",
        false,
      );
    }

    const parsedRequest = ImageRequestBoundarySchema.safeParse({
      industry: request.companyBrief.industry,
      offer: request.companyBrief.offer,
      locale: request.companyBrief.locale,
      sellerPositioningSummary: request.sellerPositioningSummary,
      objective: request.objective,
      visualStyle: request.visualStyle,
    });
    if (!parsedRequest.success) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "generate",
        "client_request",
        false,
      );
    }

    const imagePromises = Array.from(
      { length: IMAGE_COUNT },
      () => this.generateSingleImage(parsedRequest.data, options),
    );
    const results = await Promise.allSettled(imagePromises);
    const assetUrls = results
      .filter((result): result is PromiseFulfilledResult<GeneratedImageCallResult> =>
        result.status === "fulfilled"
      )
      .flatMap((result) => result.value.assetUrls);

    if (assetUrls.length === 0) {
      const firstRejection = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      throw normalizeProviderTransportError({
        error: firstRejection?.reason,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "generate",
        signal: options.signal,
      });
    }

    return {
      assetUrls,
      rationale:
        `Generated ${assetUrls.length} supporting image(s). `
        + "Upload data URLs to operator-owned storage before renderer use.",
    };
  }

  private async generateSingleImage(
    request: z.infer<typeof ImageRequestBoundarySchema>,
    options: ProviderCallOptions,
  ): Promise<GeneratedImageCallResult> {
    const body = {
      contents: [{
        role: "user",
        parts: [{
          text: [
            "Create one polished supporting image for a modern sales presentation.",
            "",
            "AESTHETIC DIRECTION:",
            "- Editorial or documentary rather than glossy stock photography",
            "- Warm neutrals, earthy tones, or a restrained dark palette",
            "- Natural lighting and clear composition",
            "- For abstract concepts: rounded geometry and organic shapes",
            "",
            "CONTEXT:",
            `Target company industry: ${request.industry}`,
            `Target company offer: ${request.offer}`,
            request.locale ? `Locale cues: ${request.locale}` : "",
            `Seller positioning summary: ${request.sellerPositioningSummary}`,
            `Presentation objective: ${request.objective}`,
            `Visual style: ${request.visualStyle}`,
            this.visualContentTypes?.length
              ? `PREFERRED CONTENT TYPES: ${this.visualContentTypes.join(", ")}.`
              : "",
            "STRICT RULES: No logos, text overlays, UI screenshots, watermarks, or generic stock-photo poses.",
          ].filter(Boolean).join("\n"),
        }],
      }],
      generationConfig: {
        responseModalities: ["Image"],
        imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
      },
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Awaited<ReturnType<typeof requestText>>;
      try {
        response = await requestText(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": this.apiKey },
            body,
            signal: options.signal,
            timeoutMs: this.requestTimeoutMs,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          },
        );
      } catch (error) {
        // Network and timeout outcomes may already have consumed provider work.
        throw normalizeProviderTransportError({
          error,
          providerId: this.providerId,
          displayName: DISPLAY_NAME,
          operation: "generate",
          signal: options.signal,
        });
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        try {
          await sleep(
            Math.min(this.retryBaseDelayMs * 2 ** attempt, 30_000),
            options.signal,
          );
        } catch (error) {
          throw normalizeProviderTransportError({
            error,
            providerId: this.providerId,
            displayName: DISPLAY_NAME,
            operation: "generate",
            signal: options.signal,
          });
        }
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw providerErrorFromStatus(
          this.providerId,
          DISPLAY_NAME,
          "generate",
          response.status,
        );
      }

      const parsed = parseProviderJson({
        text: response.text,
        schema: GeminiGenerateContentResponseSchema,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "generate",
      });
      const parts = parsed.candidates?.flatMap((candidate) => candidate.content.parts) ?? [];
      const assetUrls = parts.flatMap((part) => {
        const inline = part.inlineData
          ? { mimeType: part.inlineData.mimeType, data: part.inlineData.data }
          : part.inline_data
            ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data }
            : undefined;
        return inline ? [`data:${inline.mimeType};base64,${inline.data}`] : [];
      });
      if (assetUrls.length === 0) {
        throw new ProviderAdapterError(
          this.providerId,
          DISPLAY_NAME,
          "generate",
          "empty_response",
          false,
        );
      }

      const usage = normalizeGeminiUsage(parsed.usageMetadata);
      reportProviderObservability(options, usage.length > 0 ? { usage } : undefined);
      return { assetUrls };
    }

    throw new ProviderAdapterError(
      this.providerId,
      DISPLAY_NAME,
      "generate",
      "rate_limited",
      true,
      429,
    );
  }
}

function normalizeGeminiUsage(
  usage: z.infer<typeof GeminiUsageMetadataSchema> | undefined,
) {
  if (!usage) return [];
  return [
    metric("input_tokens", usage.promptTokenCount),
    metric("cached_input_tokens", usage.cachedContentTokenCount),
    metric("output_tokens", usage.candidatesTokenCount),
    metric("tool_tokens", usage.toolUsePromptTokenCount),
    metric("reasoning_tokens", usage.thoughtsTokenCount),
    metric("total_tokens", usage.totalTokenCount),
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function metric(metricName: string, amount: number | undefined) {
  return amount === undefined
    ? undefined
    : { metric: metricName, unit: "tokens", amount };
}
