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

/** Optional pre-built prompt from the slide planner — bypasses the old generic prompt builder */
export interface PlusAiCreateOptions {
  /** If provided, this structured prompt is used instead of buildDeckInputText */
  slidePlanPrompt?: string;
  /** Brand colors from seller context — used to create on-brand decks */
  brandColors?: { primary?: string; accent?: string; background?: string };
}

interface PlusAiCreateResponse {
  pollingUrl: string;
  status: string;
}

interface PlusAiPollResponse {
  id: string;
  status: "PROCESSING" | "GENERATED" | "FAILED";
  url: string | null;
  slides: string[] | null;
  createdAt: string;
  updatedAt: string;
  language: string;
}

export interface PlusAiProviderOptions {
  apiKey: string;
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

const MAX_RETRIES = 2;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 240_000; // 4 min max wait — leaves headroom within 300s step budget
const CREATE_RETRY_DELAY_MS = 5000;

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
  private readonly apiKey: string;

  public constructor(options: PlusAiProviderOptions) {
    this.apiKey = options.apiKey;
  }

  /** Accepts an optional slidePlanPrompt to bypass the generic prompt builder */
  public async createDeck(
    input: DeckGenerationInput,
    imageUrls: string[] = [],
    options?: PlusAiCreateOptions,
  ): Promise<PresentonResult> {
    let fullPrompt: string;

    if (options?.slidePlanPrompt) {
      // Use the pre-built slide plan prompt from our AI planner
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
      // Fallback to original generic prompt
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

    console.log(`[plusai] Prompt length: ${fullPrompt.length} chars, mode: ${options?.slidePlanPrompt ? "slide-plan" : "generic"}`);

    // Step 1: Create presentation (with retries for rate limiting)
    // Don't send textHandling — let Plus AI use its default behavior.
    // The old REWRITE/PRESERVE values were invalid enum members and caused HTTP 400.
    const templateId = pickTemplate(input.visualStyle);
    const brandTheme = buildBrandTheme(options?.brandColors);
    const createResponse = await this.createPresentation({
      prompt: fullPrompt,
      numberOfSlides: Math.min(input.cardCount, 30),
      language: "en",
      ...(templateId && { templateId }),
      ...(brandTheme && { theme: brandTheme }),
    });

    // Step 2: Poll until complete
    const result = await this.pollUntilDone(createResponse.pollingUrl);

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
  }): Promise<PlusAiCreateResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await requestText("https://api.plusdocs.com/r/v0/presentation", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        // Rate limited — wait and retry
        const delay = CREATE_RETRY_DELAY_MS * (attempt + 1);
        console.error(`[plusai] Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const text = response.text;

      if (response.status < 200 || response.status >= 300) {
        lastError = new Error(
          `Plus AI create failed: HTTP ${response.status}: ${text.slice(0, 500)}`,
        );

        // Don't retry on client errors that won't resolve (413, 400, 401, 403)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw lastError;
        }

        if (attempt < MAX_RETRIES) {
          const delay = CREATE_RETRY_DELAY_MS * (attempt + 1);
          console.error(`[plusai] Create attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }

      return JSON.parse(text) as PlusAiCreateResponse;
    }

    throw lastError ?? new Error("Plus AI create failed after retries.");
  }

  private async pollUntilDone(pollingUrl: string): Promise<PlusAiPollResponse> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await requestText(pollingUrl, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.status < 200 || response.status >= 300) {
        console.error(`[plusai] Poll error: HTTP ${response.status}: ${response.text.slice(0, 200)}`);
        // Keep polling on transient errors
        continue;
      }

      const data = JSON.parse(response.text) as PlusAiPollResponse;

      if (data.status === "GENERATED") {
        return data;
      }

      if (data.status === "FAILED") {
        throw new Error("Plus AI presentation generation failed.");
      }

      // Still PROCESSING — keep polling
    }

    throw new Error(`Plus AI generation timed out after ${POLL_TIMEOUT_MS / 1000}s.`);
  }
}
