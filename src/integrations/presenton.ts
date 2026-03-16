import {
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "../domain/deck";
import type {
  DeckGenerationInput,
  PresentonProvider,
  PresentonResult,
} from "./providers";
import { HttpError, requestJson } from "./http";

interface PresentonGenerateResponse {
  presentation_id: string;
  path?: string;
  edit_path?: string;
  credits_consumed?: number;
}

interface PresentonPresentationModel {
  id: string;
  title?: string | null;
  outlines?: {
    slides: Array<{
      content: string;
    }>;
  } | null;
}

interface PresentonStreamCompleteEnvelope {
  type: "complete";
  presentation: PresentonPresentationModel;
}

interface PresentonLayoutModel {
  name: string;
  ordered: boolean;
  slides: Array<{
    id: string;
    name: string;
    description: string;
    json_schema: Record<string, unknown>;
  }>;
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

function buildImageSchema() {
  return {
    type: "object",
    required: ["__image_url__", "__image_prompt__"],
    properties: {
      __image_url__: {
        type: "string",
        format: "uri",
        description: "URL to image",
      },
      __image_prompt__: {
        type: "string",
        description: "Prompt used to generate the image",
      },
    },
  } satisfies Record<string, unknown>;
}

function buildIconSchema() {
  return {
    type: "object",
    required: ["__icon_url__", "__icon_query__"],
    properties: {
      __icon_url__: {
        type: "string",
        description: "URL to icon",
      },
      __icon_query__: {
        type: "string",
        description: "Query used to search the icon",
      },
    },
  } satisfies Record<string, unknown>;
}

function buildPresentonLayout(templateName: string): PresentonLayoutModel {
  const image = buildImageSchema();
  const icon = buildIconSchema();
  const prefix = "general:";

  return {
    name: templateName,
    ordered: false,
    slides: [
      {
        id: `${prefix}general-intro-slide`,
        name: "Intro Slide",
        description:
          "Opening slide with title, description, presenter information, and supporting image.",
        json_schema: {
          type: "object",
          required: ["title", "description", "presenterName", "presentationDate", "image"],
          properties: {
            title: { type: "string", maxLength: 80 },
            description: { type: "string", maxLength: 220 },
            presenterName: { type: "string", maxLength: 60 },
            presentationDate: { type: "string", maxLength: 40 },
            image,
          },
        },
      },
      {
        id: `${prefix}basic-info-slide`,
        name: "Basic Info",
        description:
          "Title, description, and supporting image for a concise company summary.",
        json_schema: {
          type: "object",
          required: ["title", "description", "image"],
          properties: {
            title: { type: "string", maxLength: 80 },
            description: { type: "string", maxLength: 240 },
            image,
          },
        },
      },
      {
        id: `${prefix}bullet-with-icons-slide`,
        name: "Bullet with Icons",
        description:
          "Title, description, image, and two or three icon-backed bullets.",
        json_schema: {
          type: "object",
          required: ["title", "description", "image", "bulletPoints"],
          properties: {
            title: { type: "string", maxLength: 80 },
            description: { type: "string", maxLength: 220 },
            image,
            bulletPoints: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: {
                type: "object",
                required: ["title", "description", "icon"],
                properties: {
                  title: { type: "string", maxLength: 80 },
                  description: { type: "string", maxLength: 140 },
                  icon,
                },
              },
            },
          },
        },
      },
      {
        id: `${prefix}numbered-bullets-slide`,
        name: "Numbered Bullets",
        description: "Title, image, and ranked bullets with short explanations.",
        json_schema: {
          type: "object",
          required: ["title", "image", "bulletPoints"],
          properties: {
            title: { type: "string", maxLength: 80 },
            image,
            bulletPoints: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { type: "string", maxLength: 80 },
                  description: { type: "string", maxLength: 180 },
                },
              },
            },
          },
        },
      },
      {
        id: `${prefix}metrics-slide`,
        name: "Metrics",
        description:
          "A metrics-focused slide with two or three numbers and explanations.",
        json_schema: {
          type: "object",
          required: ["title", "metrics"],
          properties: {
            title: { type: "string", maxLength: 100 },
            metrics: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: {
                type: "object",
                required: ["label", "value", "description"],
                properties: {
                  label: { type: "string", maxLength: 60 },
                  value: { type: "string", maxLength: 16 },
                  description: { type: "string", maxLength: 180 },
                },
              },
            },
          },
        },
      },
      {
        id: `${prefix}quote-slide`,
        name: "Quote",
        description:
          "Strong statement or testimonial with author and background image.",
        json_schema: {
          type: "object",
          required: ["heading", "quote", "author", "backgroundImage"],
          properties: {
            heading: { type: "string", maxLength: 80 },
            quote: { type: "string", maxLength: 260 },
            author: { type: "string", maxLength: 80 },
            backgroundImage: image,
          },
        },
      },
    ],
  };
}

const SSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function requestSseCompletion<T>(
  url: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Presenton SSE stream timed out after ${SSE_TIMEOUT_MS / 1000}s for ${url}`);
    }
    throw error;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    throw new HttpError(
      `Request failed with status ${response.status} for ${url}`,
      response.status,
      bodyText,
    );
  }

  if (!response.body) {
    throw new Error(`No response body received for ${url}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: T | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (dataLine) {
        const payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
        if (payload.type === "complete") {
          completed = payload as T;
        }

        if (payload.type === "error") {
          clearTimeout(timeout);
          throw new Error(String(payload.detail ?? "Presenton stream failed."));
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  clearTimeout(timeout);

  if (!completed) {
    throw new Error(`Presenton stream ${url} completed without a final payload.`);
  }

  return completed;
}

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

    if (input.outputFormat === "bestdecks_editor" || input.outputFormat === ("presenton_editor" as string)) {
      return this.createEditorDeck(input, content, instructions);
    }

    const exportAs = input.outputFormat;

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
          ...(this.defaultTemplate ? { template: this.defaultTemplate } : {}),
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

  private async createEditorDeck(
    input: DeckGenerationInput,
    content: string,
    instructions: string,
  ): Promise<PresentonResult> {
    const created = await requestJson<PresentonPresentationModel>(
      `${this.baseUrl}/api/v1/ppt/presentation/create`,
      {
        method: "POST",
        body: {
          content,
          n_slides: input.cardCount,
          language: "English",
          tone: mapTone(input.tone),
          verbosity: mapVerbosity(input.cardCount),
          instructions,
          include_table_of_contents: false,
          include_title_slide: true,
          web_search: false,
        },
      },
    );

    const outlined = await requestSseCompletion<PresentonStreamCompleteEnvelope>(
      `${this.baseUrl}/api/v1/ppt/outlines/stream/${created.id}`,
    );

    const layout = buildPresentonLayout(this.defaultTemplate ?? "general");
    await requestJson<PresentonPresentationModel>(
      `${this.baseUrl}/api/v1/ppt/presentation/prepare`,
      {
        method: "POST",
        body: {
          presentation_id: created.id,
          outlines: outlined.presentation.outlines?.slides ?? [],
          layout,
          title: outlined.presentation.title ?? undefined,
        },
      },
    );

    await requestSseCompletion<PresentonStreamCompleteEnvelope>(
      `${this.baseUrl}/api/v1/ppt/presentation/stream/${created.id}`,
    );

    return {
      presentationId: created.id,
      editorUrl: `${this.baseUrl}/presentation?id=${created.id}`,
      exportUrl: undefined,
      rawPath: undefined,
    } satisfies PresentonResult;
  }
}
