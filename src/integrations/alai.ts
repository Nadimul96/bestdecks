import { z } from "zod";

import {
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "../domain/deck";
import { requestText, sleep } from "./http";
import {
  invalidProviderConfiguration,
  normalizeDeckInputSourceUrls,
  normalizeProviderTransportError,
  parseProviderJson,
  ProviderAdapterError,
  providerErrorFromStatus,
  safeProviderOutputUrlSchema,
  type ProviderAdapterMetadata,
} from "./provider-contract";
import type {
  DeckGenerationInput,
  DeckCreateOptions,
  DeckProvider,
  PresentonResult,
  ProviderCallOptions,
} from "./providers";

const BASE_URL = "https://slides-api.getalai.com/api/v1";

export const ALAI_DECK_PROVIDER_METADATA = {
  providerId: "alai.slides.generation",
  apiVersion: "v1",
  modelId: null,
  contractVersion: 1,
  capabilities: {
    asynchronousGeneration: true,
    structuredPrompt: true,
    outputFormats: ["editor-link", "pdf", "ppt"],
    usageMetadata: false,
  },
  releaseStatus: "experimental",
} as const satisfies ProviderAdapterMetadata;

const DISPLAY_NAME = "Alai";

/** Optional pre-built prompt from the slide planner — bypasses the old generic prompt builder */
export interface AlaiCreateOptions extends DeckCreateOptions {
  /** If provided, this structured prompt is used instead of buildDeckInputText */
  slidePlanPrompt?: string;
  /** Brand colors from seller context */
  brandColors?: { primary?: string; accent?: string; background?: string };
}

/* ── Alai API response shapes ─────────────────────────────────── */

const AlaiIdentifierSchema = z.string().trim().min(1).max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u);

const AlaiCreateResponseSchema = z.object({
  generation_id: AlaiIdentifierSchema,
}).strict();

const AlaiFormatArtifactSchema = z.object({
  status: z.string().trim().min(1).max(100).optional(),
  url: safeProviderOutputUrlSchema.optional(),
  error: z.string().max(2_000).nullable().optional(),
}).strict();

const AlaiFormatValueSchema = z.union([
  safeProviderOutputUrlSchema,
  AlaiFormatArtifactSchema,
]);

const AlaiRawExportsSchema = z.object({
  link: AlaiFormatValueSchema.optional(),
  pdf: AlaiFormatValueSchema.optional(),
  ppt: AlaiFormatValueSchema.optional(),
}).strict();

type AlaiFormatValue = z.infer<typeof AlaiFormatValueSchema>;
type AlaiRawExports = z.infer<typeof AlaiRawExportsSchema>;

interface AlaiGenerationExports {
  link?: string;
  pdf?: string;
  ppt?: string;
}

interface AlaiPollResponse {
  generation_id: string;
  status: "pending" | "processing" | "in_progress" | "completed" | "failed";
  exports?: AlaiGenerationExports;
  presentation_id?: string;
}

const AlaiRawPollResponseSchema = z.object({
  generation_id: AlaiIdentifierSchema,
  status: z.enum(["pending", "processing", "in_progress", "completed", "failed"]),
  exports: AlaiRawExportsSchema.optional(),
  formats: AlaiRawExportsSchema.optional(),
  error: z.string().max(2_000).nullable().optional(),
  presentation_id: AlaiIdentifierSchema.optional(),
}).strict();

function extractFormatUrl(value: AlaiFormatValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  return value?.url;
}

function normalizeExports(raw: AlaiRawExports | undefined): AlaiGenerationExports | undefined {
  if (!raw) return undefined;

  const normalized: AlaiGenerationExports = {
    link: extractFormatUrl(raw.link),
    pdf: extractFormatUrl(raw.pdf),
    ppt: extractFormatUrl(raw.ppt),
  };

  return normalized.link || normalized.pdf || normalized.ppt ? normalized : undefined;
}

/** Map our visual style to an Alai theme name. */
export function pickAlaiTheme(visualStyle: string): string {
  // Provider dispatch must be reproducible for the same durable input.
  if (visualStyle === "auto") return "Simple Light";
  if (visualStyle === "mixed") return "Aurora Flux";

  const styleToTheme: Record<string, string> = {
    minimal: "Simple Light",
    editorial: "Light Cool Creative",
    sales_polished: "Royal Blue",
    premium_modern: "Aurora Flux",
    playful: "Prismatica",
    dark_executive: "Midnight Ember",
    dark_minimal: "Simple Dark",
    custom: "Simple Light",
  };
  return styleToTheme[visualStyle] ?? "Simple Light";
}

/* ── Alai tone mapping ────────────────────────────────────────── */

export type AlaiTone =
  | "PROFESSIONAL"
  | "AUTHORITATIVE"
  | "PERSUASIVE"
  | "CASUAL"
  | "CUSTOM";

export function pickAlaiTone(tone: string): AlaiTone {
  const toneMap: Record<string, AlaiTone> = {
    concise: "PROFESSIONAL",
    executive: "AUTHORITATIVE",
    bold: "PERSUASIVE",
    consultative: "PROFESSIONAL",
    friendly: "CASUAL",
    custom: "CUSTOM",
  };
  return toneMap[tone] ?? "PROFESSIONAL";
}

/* ── Provider config & constants ──────────────────────────────── */

export interface AlaiProviderOptions {
  apiKey: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  maxPollAttempts?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 60;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const AlaiConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(8_192),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
  retryBaseDelayMs: z.number().int().min(0).max(30_000),
  pollIntervalMs: z.number().int().min(0).max(60_000),
  pollTimeoutMs: z.number().int().min(100).max(900_000),
  maxPollAttempts: z.number().int().min(1).max(600),
}).strict();

/**
 * Alai has a request body size limit.  Cap the prompt at a safe character
 * limit and truncate gracefully if needed.
 */
const MAX_PROMPT_CHARS = 30_000;

function truncatePrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  const truncated = prompt.slice(0, MAX_PROMPT_CHARS);
  const lastBreak = truncated.lastIndexOf("\n\n");
  const cutPoint = lastBreak > MAX_PROMPT_CHARS * 0.7 ? lastBreak : MAX_PROMPT_CHARS;
  return truncated.slice(0, cutPoint) + "\n\n[Content truncated for brevity]";
}

/**
 * Alai deck provider — generates presentations via the Alai Slides API.
 *
 * Flow:
 * 1. POST /api/v1/generations with input_text + options → get generation_id
 * 2. Poll GET /api/v1/generations/{generation_id} every 5s until completed
 * 3. Return the presentation URLs (link, pdf, ppt)
 */
export class AlaiDeckProvider implements DeckProvider {
  public readonly name = "alai" as const;
  public readonly providerId = ALAI_DECK_PROVIDER_METADATA.providerId;
  public readonly modelId = ALAI_DECK_PROVIDER_METADATA.modelId;
  public readonly capabilities = ALAI_DECK_PROVIDER_METADATA.capabilities;
  public readonly contractVersion = ALAI_DECK_PROVIDER_METADATA.contractVersion;

  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly maxPollAttempts: number;

  public constructor(options: AlaiProviderOptions) {
    const parsed = AlaiConfigSchema.safeParse({
      apiKey: options.apiKey,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      pollTimeoutMs: options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
      maxPollAttempts: options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    });
    if (!parsed.success) {
      throw invalidProviderConfiguration(this.providerId, DISPLAY_NAME);
    }

    this.apiKey = parsed.data.apiKey;
    this.requestTimeoutMs = parsed.data.requestTimeoutMs;
    this.maxRetries = parsed.data.maxRetries;
    this.retryBaseDelayMs = parsed.data.retryBaseDelayMs;
    this.pollIntervalMs = parsed.data.pollIntervalMs;
    this.pollTimeoutMs = parsed.data.pollTimeoutMs;
    this.maxPollAttempts = parsed.data.maxPollAttempts;
  }

  /** Accepts an optional slidePlanPrompt to bypass the generic prompt builder */
  public async createDeck(
    input: DeckGenerationInput,
    imageUrls: string[] = [],
    options: AlaiCreateOptions = {},
  ): Promise<PresentonResult> {
    let normalizedInput: DeckGenerationInput;
    try {
      normalizedInput = normalizeDeckInputSourceUrls(input);
    } catch {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "create",
        "client_request",
        false,
      );
    }

    let fullPrompt: string;

    if (options.slidePlanPrompt) {
      const instructions = buildPresentationAdditionalInstructions({
        archetype: normalizedInput.archetype,
        customArchetypePrompt: normalizedInput.customArchetypePrompt,
        tone: normalizedInput.tone,
        visualStyle: normalizedInput.visualStyle,
        imagePolicy: normalizedInput.imagePolicy,
        cardCount: normalizedInput.cardCount,
      });
      fullPrompt = truncatePrompt(
        `${options.slidePlanPrompt}\n\n---\nStyle instructions: ${instructions}`,
      );
    } else {
      const prompt = buildDeckInputText(normalizedInput, imageUrls);
      const instructions = buildPresentationAdditionalInstructions({
        archetype: normalizedInput.archetype,
        customArchetypePrompt: normalizedInput.customArchetypePrompt,
        tone: normalizedInput.tone,
        visualStyle: normalizedInput.visualStyle,
        imagePolicy: normalizedInput.imagePolicy,
        cardCount: normalizedInput.cardCount,
      });
      fullPrompt = truncatePrompt(
        `${prompt}\n\n---\nAdditional instructions: ${instructions}`,
      );
    }

    const theme = pickAlaiTheme(normalizedInput.visualStyle);
    const tone = pickAlaiTone(normalizedInput.tone);

    const body: Record<string, unknown> = {
      input_text: fullPrompt,
      num_slides: Math.min(normalizedInput.cardCount, 30),
      theme,
      tone,
      content_mode: "preserve",
      amount_mode: "essential",
      include_ai_images: normalizedInput.imagePolicy !== "never",
      image_style: "realistic",
      export_formats: ["link", "pdf", "ppt"],
    };

    // Custom tone instructions
    if (tone === "CUSTOM" && normalizedInput.tone === "custom") {
      body.custom_tone_instructions = "Use a custom tone that matches the content and audience.";
    }

    // Step 1: Create generation (with retries for rate limiting)
    const createResponse = await this.createGeneration(body, options);

    // Step 2: Poll until complete
    const result = await this.pollUntilDone(createResponse.generation_id, options);

    return {
      presentationId: result.generation_id,
      editorUrl: result.exports?.link ?? undefined,
      exportUrl: result.exports?.ppt ?? undefined,
      rawPath: result.exports?.ppt ?? undefined,
      pdfExportUrl: result.exports?.pdf ?? undefined,
      pptxExportUrl: result.exports?.ppt ?? undefined,
    };
  }

  private async createGeneration(
    body: Record<string, unknown>,
    options: ProviderCallOptions,
  ): Promise<z.infer<typeof AlaiCreateResponseSchema>> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Awaited<ReturnType<typeof requestText>>;
      try {
        response = await requestText(`${BASE_URL}/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body,
          signal: options.signal,
          timeoutMs: this.requestTimeoutMs,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
      } catch (error) {
        // A transport failure can occur after this paid POST was accepted.
        // Never replay an ambiguous outcome.
        throw normalizeProviderTransportError({
          error,
          providerId: this.providerId,
          displayName: DISPLAY_NAME,
          operation: "create",
          signal: options.signal,
        });
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const delayMs = Math.min(this.retryBaseDelayMs * (attempt + 1), 30_000);
        console.warn("[alai] retrying provider request", {
          operation: "create",
          code: "rate_limited",
          status: 429,
          attempt: attempt + 1,
          maxAttempts: this.maxRetries + 1,
          delayMs,
        });
        try {
          await sleep(delayMs, options.signal);
        } catch (error) {
          throw normalizeProviderTransportError({
            error,
            providerId: this.providerId,
            displayName: DISPLAY_NAME,
            operation: "create",
            signal: options.signal,
          });
        }
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw providerErrorFromStatus(
          this.providerId,
          DISPLAY_NAME,
          "create",
          response.status,
        );
      }

      return parseProviderJson({
        text: response.text,
        schema: AlaiCreateResponseSchema,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "create",
      });
    }

    throw new ProviderAdapterError(
      this.providerId,
      DISPLAY_NAME,
      "create",
      "rate_limited",
      true,
      429,
    );
  }

  private async pollUntilDone(
    generationId: string,
    options: ProviderCallOptions,
  ): Promise<AlaiPollResponse> {
    const deadline = Date.now() + this.pollTimeoutMs;

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      if (Date.now() >= deadline) break;
      try {
        await sleep(this.pollIntervalMs, options.signal);
      } catch (error) {
        throw normalizeProviderTransportError({
          error,
          providerId: this.providerId,
          displayName: DISPLAY_NAME,
          operation: "poll",
          signal: options.signal,
        });
      }

      let response: Awaited<ReturnType<typeof requestText>>;
      try {
        response = await requestText(`${BASE_URL}/generations/${generationId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: options.signal,
          timeoutMs: this.requestTimeoutMs,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
      } catch (error) {
        const normalized = normalizeProviderTransportError({
          error,
          providerId: this.providerId,
          displayName: DISPLAY_NAME,
          operation: "poll",
          signal: options.signal,
        });
        if (!normalized.retryable || attempt + 1 === this.maxPollAttempts) throw normalized;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        const normalized = providerErrorFromStatus(
          this.providerId,
          DISPLAY_NAME,
          "poll",
          response.status,
        );
        if (!normalized.retryable || attempt + 1 === this.maxPollAttempts) throw normalized;
        continue;
      }

      const data = parseProviderJson({
        text: response.text,
        schema: AlaiRawPollResponseSchema,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "poll",
      });
      if (data.generation_id !== generationId) {
        throw new ProviderAdapterError(
          this.providerId,
          DISPLAY_NAME,
          "poll",
          "malformed_response",
          false,
        );
      }

      let exports = normalizeExports(data.exports) ?? normalizeExports(data.formats);
      if (data.presentation_id && !exports?.link) {
        exports = exports ?? {};
        exports.link = `https://app.getalai.com/presentations/${data.presentation_id}`;
      }

      if (data.status === "completed") {
        if (!exports || (!exports.link && !exports.pdf && !exports.ppt)) {
          throw new ProviderAdapterError(
            this.providerId,
            DISPLAY_NAME,
            "poll",
            "empty_response",
            false,
          );
        }
        return {
          generation_id: data.generation_id,
          status: data.status,
          exports,
          presentation_id: data.presentation_id,
        };
      }

      if (data.status === "failed") {
        throw new ProviderAdapterError(
          this.providerId,
          DISPLAY_NAME,
          "poll",
          "generation_failed",
          false,
        );
      }
    }

    throw new ProviderAdapterError(
      this.providerId,
      DISPLAY_NAME,
      "poll",
      "poll_timeout",
      true,
    );
  }
}
