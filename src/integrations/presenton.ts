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

export class PresentonDeckProvider implements PresentonProvider {
  public readonly name = "presenton" as const;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultTemplate: string;

  public constructor(options: PresentonProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultTemplate = options.defaultTemplate ?? "general";
  }

  public async createDeck(input: DeckGenerationInput, imageUrls: string[] = []) {
    const exportAs = input.outputFormat === "presenton_editor" ? "pptx" : input.outputFormat;
    const content = buildDeckInputText(input, imageUrls);
    const instructions = buildPresentationAdditionalInstructions({
      archetype: input.archetype,
      tone: input.tone,
      visualStyle: input.visualStyle,
      imagePolicy: input.imagePolicy,
      cardCount: input.cardCount,
    });

    const response = await requestJson<PresentonGenerateResponse>(
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
          template: this.defaultTemplate,
          include_table_of_contents: false,
          include_title_slide: true,
          export_as: exportAs,
        },
      },
    );

    return {
      presentationId: response.presentation_id,
      editorUrl: toAbsoluteUrl(this.baseUrl, response.edit_path),
      exportUrl: toAbsoluteUrl(this.baseUrl, response.path),
      rawPath: response.path,
    } satisfies PresentonResult;
  }
}
