import {
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "../domain/deck";
import type {
  DeckGenerationInput,
  DeckProvider,
  PresentonResult,
} from "./providers";

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

/** Map our visual style to the closest Plus AI built-in template */
function pickTemplate(visualStyle: string): string {
  const styleToTemplate: Record<string, string> = {
    // Schema values (from visualStyleSchema)
    minimal: "XFzedsfTQ3ccCtO09ZWSav",           // Corporate Blue — clean, minimal
    editorial: "p8pxA5qoot1I2WffVcrm2D",          // Editorial
    sales_polished: "D9fCV9f59UZFiLIMMzUMhy",     // Insight Bold — sales-forward polish
    premium_modern: "D9fCV9f59UZFiLIMLoUj3k",     // Insight Modern
    playful: "1jelx0KVU9F6jq1WcIQDsD",            // Potpourri
    custom: "D9fCV9f59UZFiLIMLoUj3k",             // Fallback to Insight Modern
  };
  return styleToTemplate[visualStyle] ?? "D9fCV9f59UZFiLIMLoUj3k"; // Default: Insight Modern
}

const MAX_RETRIES = 2;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 300_000; // 5 min max wait
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

  public async createDeck(input: DeckGenerationInput, imageUrls: string[] = []): Promise<PresentonResult> {
    const prompt = buildDeckInputText(input, imageUrls);
    const instructions = buildPresentationAdditionalInstructions({
      archetype: input.archetype,
      tone: input.tone,
      visualStyle: input.visualStyle,
      imagePolicy: input.imagePolicy,
      cardCount: input.cardCount,
    });

    const fullPrompt = truncatePrompt(
      `${prompt}\n\n---\nAdditional instructions: ${instructions}`,
    );

    console.log(`[plusai] Prompt length: ${fullPrompt.length} chars`);

    // Step 1: Create presentation (with retries for rate limiting)
    const createResponse = await this.createPresentation({
      prompt: fullPrompt,
      numberOfSlides: Math.min(input.cardCount, 30),
      language: "en",
      templateId: pickTemplate(input.visualStyle),
      textHandling: "PRESERVE",
    });

    // Step 2: Poll until complete
    const result = await this.pollUntilDone(createResponse.pollingUrl);

    return {
      presentationId: result.id,
      exportUrl: result.url ?? undefined,
      editorUrl: undefined,
      rawPath: result.url ?? undefined,
    };
  }

  private async createPresentation(body: {
    prompt: string;
    numberOfSlides: number;
    language: string;
    templateId: string;
    textHandling: string;
  }): Promise<PlusAiCreateResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch("https://api.plusdocs.com/r/v0/presentation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        // Rate limited — wait and retry
        const delay = CREATE_RETRY_DELAY_MS * (attempt + 1);
        console.error(`[plusai] Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const text = await response.text();

      if (!response.ok) {
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

      const response = await fetch(pollingUrl, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[plusai] Poll error: HTTP ${response.status}: ${text.slice(0, 200)}`);
        // Keep polling on transient errors
        continue;
      }

      const data = (await response.json()) as PlusAiPollResponse;

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
