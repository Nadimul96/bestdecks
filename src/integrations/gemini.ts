import { requestJson } from "./http";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
} from "./providers";

interface GeminiResponsePart {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  inline_data?: {
    mime_type?: string;
    data?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[];
    };
  }>;
}

export class GeminiImageProvider implements ImageProvider {
  public readonly name = "gemini" as const;
  private readonly apiKey: string;
  private readonly model: string;

  public constructor(apiKey: string, model = "gemini-3.1-flash-image-preview") {
    this.apiKey = apiKey;
    this.model = model;
  }

  public async generateSupportingAssets(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResult> {
    const response = await requestJson<GeminiGenerateContentResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
        },
        body: {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Create one polished supporting image for a sales presentation.",
                    `Target company industry: ${request.companyBrief.industry}`,
                    `Target company offer: ${request.companyBrief.offer}`,
                    request.companyBrief.locale
                      ? `Locale cues: ${request.companyBrief.locale}`
                      : "",
                    `Seller positioning summary: ${request.sellerPositioningSummary}`,
                    `Presentation objective: ${request.objective}`,
                    `Visual style: ${request.visualStyle}`,
                    "Avoid logos, text overlays, UI screenshots, watermarks, and unrealistic collage aesthetics.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["Image"],
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: "2K",
            },
          },
        },
      },
    );

    const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
    const assetUrls = parts
      .map((part) => {
        const data = part.inlineData?.data ?? part.inline_data?.data;
        const mimeType =
          part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
        return data ? `data:${mimeType};base64,${data}` : undefined;
      })
      .filter((value): value is string => Boolean(value));

    if (assetUrls.length === 0) {
      throw new Error("Gemini did not return an image payload.");
    }

    return {
      assetUrls,
      rationale:
        "Generated one supporting concept image. For production use, upload the returned data URL to object storage before passing it to the presentation engine.",
    };
  }
}
