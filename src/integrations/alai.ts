import {
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "../domain/deck";
import { requestText } from "./http";
import type {
  DeckGenerationInput,
  DeckProvider,
  PresentonResult,
} from "./providers";

const BASE_URL = "https://slides-api.getalai.com/api/v1";

/** Optional pre-built prompt from the slide planner — bypasses the old generic prompt builder */
export interface AlaiCreateOptions {
  /** If provided, this structured prompt is used instead of buildDeckInputText */
  slidePlanPrompt?: string;
  /** Brand colors from seller context */
  brandColors?: { primary?: string; accent?: string; background?: string };
}

/* ── Alai API response shapes ─────────────────────────────────── */

interface AlaiCreateResponse {
  generation_id: string;
}

interface AlaiGenerationExports {
  link?: string;
  pdf?: string;
  ppt?: string;
}

interface AlaiPollResponse {
  generation_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  exports?: AlaiGenerationExports;
  error?: string;
}

/* ── Alai theme catalogue ─────────────────────────────────────── */

const ALL_THEMES = [
  "Simple Light",
  "Simple Dark",
  "Light Cool Creative",
  "Royal Blue",
  "Aurora Flux",
  "Prismatica",
  "Midnight Ember",
  "Neon Pulse",
  "Terracotta Dawn",
  "Ocean Gradient",
  "Frosted Glass",
  "Retro Wave",
  "Sage Bloom",
  "Carbon Fiber",
  "Solar Flare",
  "Paper Craft",
  "Slate Mono",
  "Electric Orchid",
  "Desert Sand",
  "Nordic Frost",
  "Velvet Night",
  "Cherry Blossom",
  "Graphite Edge",
] as const;

const TOP_5_THEMES = ALL_THEMES.slice(0, 5);

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Map our visual style to an Alai theme name. */
export function pickAlaiTheme(visualStyle: string): string {
  if (visualStyle === "auto") return randomItem(TOP_5_THEMES);
  if (visualStyle === "mixed") return randomItem(ALL_THEMES);

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
}

const MAX_RETRIES = 2;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 min
const CREATE_RETRY_DELAY_MS = 5_000;

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
  private readonly apiKey: string;

  public constructor(options: AlaiProviderOptions) {
    this.apiKey = options.apiKey;
  }

  /** Accepts an optional slidePlanPrompt to bypass the generic prompt builder */
  public async createDeck(
    input: DeckGenerationInput,
    imageUrls: string[] = [],
    options?: AlaiCreateOptions,
  ): Promise<PresentonResult> {
    let fullPrompt: string;

    if (options?.slidePlanPrompt) {
      const instructions = buildPresentationAdditionalInstructions({
        archetype: input.archetype,
        customArchetypePrompt: input.customArchetypePrompt,
        tone: input.tone,
        visualStyle: input.visualStyle,
        imagePolicy: input.imagePolicy,
        cardCount: input.cardCount,
      });
      fullPrompt = truncatePrompt(
        `${options.slidePlanPrompt}\n\n---\nStyle instructions: ${instructions}`,
      );
    } else {
      const prompt = buildDeckInputText(input, imageUrls);
      const instructions = buildPresentationAdditionalInstructions({
        archetype: input.archetype,
        customArchetypePrompt: input.customArchetypePrompt,
        tone: input.tone,
        visualStyle: input.visualStyle,
        imagePolicy: input.imagePolicy,
        cardCount: input.cardCount,
      });
      fullPrompt = truncatePrompt(
        `${prompt}\n\n---\nAdditional instructions: ${instructions}`,
      );
    }

    console.log(`[alai] Prompt length: ${fullPrompt.length} chars, mode: ${options?.slidePlanPrompt ? "slide-plan" : "generic"}`);

    const theme = pickAlaiTheme(input.visualStyle);
    const tone = pickAlaiTone(input.tone);

    const body: Record<string, unknown> = {
      input_text: fullPrompt,
      num_slides: Math.min(input.cardCount, 30),
      theme,
      tone,
      content_mode: "preserve",
      amount_mode: "essential",
      include_ai_images: true,
      image_style: "realistic",
      export_formats: ["link", "pdf", "ppt"],
    };

    // Custom tone instructions
    if (tone === "CUSTOM" && input.tone === "custom") {
      body.custom_tone_instructions = "Use a custom tone that matches the content and audience.";
    }

    // Step 1: Create generation (with retries for rate limiting)
    const createResponse = await this.createGeneration(body);

    // Step 2: Poll until complete
    const result = await this.pollUntilDone(createResponse.generation_id);

    return {
      presentationId: result.generation_id,
      editorUrl: result.exports?.link ?? undefined,
      exportUrl: result.exports?.ppt ?? undefined,
      rawPath: result.exports?.ppt ?? undefined,
      pdfExportUrl: result.exports?.pdf ?? undefined,
      pptxExportUrl: result.exports?.ppt ?? undefined,
    };
  }

  private async createGeneration(body: Record<string, unknown>): Promise<AlaiCreateResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await requestText(`${BASE_URL}/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = CREATE_RETRY_DELAY_MS * (attempt + 1);
        console.error(`[alai] Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const text = response.text;

      if (response.status < 200 || response.status >= 300) {
        lastError = new Error(
          `Alai create failed: HTTP ${response.status}: ${text.slice(0, 500)}`,
        );

        // Don't retry on client errors that won't resolve (413, 400, 401, 403)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw lastError;
        }

        if (attempt < MAX_RETRIES) {
          const delay = CREATE_RETRY_DELAY_MS * (attempt + 1);
          console.error(`[alai] Create attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }

      return JSON.parse(text) as AlaiCreateResponse;
    }

    throw lastError ?? new Error("Alai create failed after retries.");
  }

  private async pollUntilDone(generationId: string): Promise<AlaiPollResponse> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await requestText(`${BASE_URL}/generations/${generationId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.status < 200 || response.status >= 300) {
        console.error(`[alai] Poll error: HTTP ${response.status}: ${response.text.slice(0, 200)}`);
        // Keep polling on transient errors
        continue;
      }

      const data = JSON.parse(response.text) as AlaiPollResponse;

      if (data.status === "completed") {
        return data;
      }

      if (data.status === "failed") {
        throw new Error(`Alai presentation generation failed: ${data.error ?? "unknown error"}`);
      }

      // Still pending/processing — keep polling
    }

    throw new Error(`Alai generation timed out after ${POLL_TIMEOUT_MS / 1000}s.`);
  }
}
