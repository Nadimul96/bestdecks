import {
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "../domain/deck";
import type {
  DeckGenerationInput,
  PresentonProvider,
  PresentonResult,
} from "./providers";
import { requestJson } from "./http";

interface PresentonGenerateResponse {
  presentation_id: string;
  path?: string;
  edit_path?: string;
  credits_consumed?: number;
}

export interface PresentonProviderOptions {
  baseUrl: string;
  apiKey?: string;
  defaultTemplate?: string;
}

function toAbsoluteUrl(baseUrl: string, candidate?: string) {
  if (!candidate) {
    return undefined;
  }

  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  return new URL(candidate, baseUrl).toString();
}

function mapTone(tone: DeckGenerationInput["tone"]) {
  switch (tone) {
    case "friendly":
      return "casual";
    case "bold":
      return "sales_pitch";
    case "executive":
      return "professional";
    case "concise":
      return "professional";
    case "consultative":
      return "professional";
  }
}

function mapVerbosity(cardCount: number) {
  if (cardCount <= 6) {
    return "concise";
  }

  if (cardCount >= 12) {
    return "text-heavy";
  }

  return "standard";
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const GENERATE_TIMEOUT_MS = 120_000; // 2 min per attempt

async function retryableRequestJson<T>(
  url: string,
  options: Parameters<typeof requestJson>[1],
  label: string,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
      try {
        return await requestJson<T>(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        console.error(`[presenton] ${label} attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`Presenton ${label} failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

/**
 * Unified Presenton provider that works with both the hosted cloud API
 * (api.presenton.ai) and self-hosted instances.
 *
 * Uses the one-shot /generate endpoint for all output formats:
 * - For editor format: omits export_as → returns edit_path (editor URL)
 * - For file formats (pptx/pdf): includes export_as → returns path (download URL)
 */
export class PresentonDeckProvider implements PresentonProvider {
  public readonly name = "presenton" as const;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultTemplate?: string;

  public constructor(options: PresentonProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    const normalizedTemplate = options.defaultTemplate?.trim();
    this.defaultTemplate =
      normalizedTemplate && normalizedTemplate !== "general"
        ? normalizedTemplate
        : undefined;
  }

  public async createDeck(input: DeckGenerationInput, imageUrls: string[] = []) {
    const content = buildDeckInputText(input, imageUrls);
    const instructions = buildPresentationAdditionalInstructions({
      archetype: input.archetype,
      tone: input.tone,
      visualStyle: input.visualStyle,
      imagePolicy: input.imagePolicy,
      cardCount: input.cardCount,
    });

    const isEditorFormat =
      input.outputFormat === "bestdecks_editor" ||
      input.outputFormat === ("presenton_editor" as string);

    const response = await retryableRequestJson<PresentonGenerateResponse>(
      `${this.baseUrl}/api/v1/ppt/presentation/generate`,
      {
        method: "POST",
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: {
          content,
          instructions,
          tone: mapTone(input.tone),
          verbosity: mapVerbosity(input.cardCount),
          web_search: false,
          n_slides: input.cardCount,
          language: "English",
          ...(this.defaultTemplate ? { template: this.defaultTemplate } : {}),
          include_table_of_contents: false,
          include_title_slide: true,
          // Only request file export for non-editor formats
          ...(isEditorFormat ? {} : { export_as: input.outputFormat }),
        },
      },
      "generate deck",
    );

    return {
      presentationId: response.presentation_id,
      editorUrl: toAbsoluteUrl(this.baseUrl, response.edit_path),
      exportUrl: toAbsoluteUrl(this.baseUrl, response.path),
      rawPath: response.path,
    } satisfies PresentonResult;
  }
}
