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
} from "./providers";

const PLUS_AI_ORIGIN = "https://api.plusdocs.com";
const PLUS_AI_PRESENTATION_PATH = "/r/v0/presentation";
const DISPLAY_NAME = "Plus AI";

export const PLUS_AI_DECK_PROVIDER_METADATA = {
  providerId: "plusai.presentation.generation",
  apiVersion: "r/v0",
  modelId: null,
  contractVersion: 1,
  capabilities: {
    asynchronousGeneration: true,
    structuredPrompt: true,
    googleSlidesOutput: true,
    usageMetadata: false,
  },
  releaseStatus: "experimental",
} as const satisfies ProviderAdapterMetadata;

function resolvePlusAiPollingUrl(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate, `${PLUS_AI_ORIGIN}${PLUS_AI_PRESENTATION_PATH}/`);
  } catch {
    throw new ProviderAdapterError(
      PLUS_AI_DECK_PROVIDER_METADATA.providerId,
      DISPLAY_NAME,
      "poll",
      "malformed_response",
      false,
    );
  }

  if (
    url.origin !== PLUS_AI_ORIGIN
    || url.username
    || url.password
    || !url.pathname.startsWith(`${PLUS_AI_PRESENTATION_PATH}/`)
  ) {
    throw new ProviderAdapterError(
      PLUS_AI_DECK_PROVIDER_METADATA.providerId,
      DISPLAY_NAME,
      "poll",
      "malformed_response",
      false,
    );
  }
  url.hash = "";
  return url.toString();
}

/** Optional pre-built prompt from the slide planner — bypasses the old generic prompt builder */
export interface PlusAiCreateOptions extends DeckCreateOptions {
  /** If provided, this structured prompt is used instead of buildDeckInputText */
  slidePlanPrompt?: string;
  /** Brand colors from seller context — used to create on-brand decks */
  brandColors?: { primary?: string; accent?: string; background?: string };
}

const PlusAiIdentifierSchema = z.string().trim().min(1).max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u);

const PlusAiCreateResponseSchema = z.object({
  pollingUrl: z.string().trim().min(1).max(4_096).url(),
  status: z.enum(["PROCESSING", "GENERATED", "FAILED"]),
}).strict();

const PlusAiPollResponseSchema = z.object({
  id: PlusAiIdentifierSchema,
  status: z.enum(["PROCESSING", "GENERATED", "FAILED"]),
  url: safeProviderOutputUrlSchema.nullable(),
  slides: z.array(z.string().max(20_000)).max(100).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  language: z.string().trim().min(1).max(100),
}).strict();

export interface PlusAiProviderOptions {
  apiKey: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  maxPollAttempts?: number;
}

/** Map our visual style to a Plus AI built-in template.
 *  Returns undefined for "auto" — Plus AI picks the best template itself.
 *
 *  Template selection rationale (2026 refresh):
 *  - Prioritize templates with large headline areas, minimal chrome, and modern typography
 *  - Avoid dated corporate templates with heavy borders, gradients, or clip-art aesthetics
 *  - Dark mode gets its own set of templates for high-contrast presentations
 *  - "Pitch", "Insight", and "Modern" families produce the most contemporary results
 */
function pickTemplate(visualStyle: string): string | undefined {
  if (visualStyle === "auto") return undefined; // Let Plus AI choose

  const styleToTemplate: Record<string, string> = {
    // Light themes
    minimal: "XFzedsfTQ3ccCtO09ZWSav",             // Corporate Blue — clean, understated, lots of whitespace
    editorial: "D9fCV9f59UZFiLIMLoUj3k",            // Insight Modern — strong typography, editorial feel
    sales_polished: "D9fCV9f59UZFiLIMMzUMhy",       // Insight Bold — confident, data-forward
    premium_modern: "D9fCV9f59UZFiLIMLoUj3k",       // Insight Modern — sophisticated, contemporary
    playful: "1jelx0KVU9F6jq1WcIQDsD",              // Potpourri — energetic with bold colors
    // Dark themes (2026 trend: "Dark Mode is king of the boardroom")
    dark_executive: "D9fCV9f59UZFiLIMMzUMhy",       // Insight Bold on dark — high contrast with neon accents
    dark_minimal: "XFzedsfTQ3ccCtO09ZWSav",          // Corporate Blue dark variant
    custom: "D9fCV9f59UZFiLIMLoUj3k",               // Default to Insight Modern
  };
  return styleToTemplate[visualStyle] ?? "D9fCV9f59UZFiLIMLoUj3k";
}

/** Build a Plus AI theme object from seller brand colors.
 *  When provided, this overrides the template's default palette so decks
 *  feel branded to the seller's identity rather than generic.
 */
function buildBrandTheme(brandColors?: { primary?: string; accent?: string; background?: string }): Record<string, string> | undefined {
  if (!brandColors?.primary) return undefined;
  return {
    ...(brandColors.primary && { primaryColor: brandColors.primary }),
    ...(brandColors.accent && { accentColor: brandColors.accent }),
    ...(brandColors.background && { backgroundColor: brandColors.background }),
  };
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 48;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const PlusAiConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(8_192),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
  retryBaseDelayMs: z.number().int().min(0).max(30_000),
  pollIntervalMs: z.number().int().min(0).max(60_000),
  pollTimeoutMs: z.number().int().min(100).max(900_000),
  maxPollAttempts: z.number().int().min(1).max(600),
}).strict();

/**
 * Plus AI has a request body size limit (~100 KB).  Our crawled company data +
 * seller positioning summary can easily exceed that.  We cap the prompt at a
 * safe character limit and truncate gracefully if needed.
 */
const MAX_PROMPT_CHARS = 30_000; // ~30 KB — well under the 413 threshold

function truncatePrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  const truncated = prompt.slice(0, MAX_PROMPT_CHARS);
  // Try to break at the last paragraph boundary so we don't cut mid-sentence
  const lastBreak = truncated.lastIndexOf("\n\n");
  const cutPoint = lastBreak > MAX_PROMPT_CHARS * 0.7 ? lastBreak : MAX_PROMPT_CHARS;
  return truncated.slice(0, cutPoint) + "\n\n[Content truncated for brevity]";
}

/**
 * Plus AI deck provider — generates presentations via the Plus AI REST API.
 *
 * Flow:
 * 1. POST /presentation with prompt + config → get pollingUrl
 * 2. Poll GET /presentation/:id until status is GENERATED
 * 3. Return the PPTX download URL
 */
export class PlusAiDeckProvider implements DeckProvider {
  public readonly name = "plusai" as const;
  public readonly providerId = PLUS_AI_DECK_PROVIDER_METADATA.providerId;
  public readonly modelId = PLUS_AI_DECK_PROVIDER_METADATA.modelId;
  public readonly capabilities = PLUS_AI_DECK_PROVIDER_METADATA.capabilities;
  public readonly contractVersion = PLUS_AI_DECK_PROVIDER_METADATA.contractVersion;

  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly maxPollAttempts: number;

  public constructor(options: PlusAiProviderOptions) {
    const parsed = PlusAiConfigSchema.safeParse({
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
    options: PlusAiCreateOptions = {},
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
      // Use the pre-built slide plan prompt from our AI planner
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
      // Fallback to original generic prompt
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

    // Step 1: Create presentation (with retries for rate limiting)
    // Don't send textHandling — let Plus AI use its default behavior.
    // The old REWRITE/PRESERVE values were invalid enum members and caused HTTP 400.
    const templateId = pickTemplate(normalizedInput.visualStyle);
    const brandTheme = buildBrandTheme(options.brandColors);
    const createResponse = await this.createPresentation({
      prompt: fullPrompt,
      numberOfSlides: Math.min(normalizedInput.cardCount, 30),
      language: "en",
      ...(templateId && { templateId }),
      ...(brandTheme && { theme: brandTheme }),
    }, options);

    // Step 2: Poll until complete
    const result = await this.pollUntilDone(
      resolvePlusAiPollingUrl(createResponse.pollingUrl),
      options,
    );

    const rawUrl = result.url ?? undefined;

    // Plus AI creates Google Slides presentations — extract the slide ID for editor/embed/export URLs
    const gsMatch = rawUrl?.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    const gsId = gsMatch?.[1];

    return {
      presentationId: result.id,
      exportUrl: rawUrl,
      editorUrl: gsId ? `https://docs.google.com/presentation/d/${gsId}/edit` : undefined,
      rawPath: rawUrl,
      // Extra Google Slides URLs for delivery view
      ...(gsId && {
        googleSlidesId: gsId,
        embedUrl: `https://docs.google.com/presentation/d/${gsId}/embed?start=false&loop=false`,
        pdfExportUrl: `https://docs.google.com/presentation/d/${gsId}/export/pdf`,
        pptxExportUrl: `https://docs.google.com/presentation/d/${gsId}/export/pptx`,
      }),
    };
  }

  private async createPresentation(body: {
    prompt: string;
    numberOfSlides: number;
    language: string;
    templateId?: string;
    theme?: Record<string, string>;
  }, options: DeckCreateOptions): Promise<z.infer<typeof PlusAiCreateResponseSchema>> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Awaited<ReturnType<typeof requestText>>;
      try {
        response = await requestText(`${PLUS_AI_ORIGIN}${PLUS_AI_PRESENTATION_PATH}`, {
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
        console.warn("[plusai] retrying provider request", {
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

      const parsed = parseProviderJson({
        text: response.text,
        schema: PlusAiCreateResponseSchema,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "create",
      });
      if (parsed.status === "FAILED") {
        throw new ProviderAdapterError(
          this.providerId,
          DISPLAY_NAME,
          "create",
          "generation_failed",
          false,
        );
      }
      return parsed;
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
    pollingUrl: string,
    options: DeckCreateOptions,
  ): Promise<z.infer<typeof PlusAiPollResponseSchema>> {
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
        response = await requestText(pollingUrl, {
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
        schema: PlusAiPollResponseSchema,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "poll",
      });

      if (data.status === "GENERATED") {
        if (!data.url) {
          throw new ProviderAdapterError(
            this.providerId,
            DISPLAY_NAME,
            "poll",
            "empty_response",
            false,
          );
        }
        return data;
      }

      if (data.status === "FAILED") {
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
