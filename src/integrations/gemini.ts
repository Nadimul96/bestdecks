import { requestText } from "./http";
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

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

export class GeminiImageProvider implements ImageProvider {
  public readonly name = "gemini" as const;
  private readonly apiKey: string;
  private readonly model: string;

  public constructor(apiKey: string, model = "gemini-3.1-flash-image-preview") {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Generate multiple supporting images in parallel.
   * We fire off up to IMAGE_COUNT concurrent requests and collect results.
   * If some fail, we still return whatever succeeded (minimum 1).
   */
  private static readonly IMAGE_COUNT = 3;

  public async generateSupportingAssets(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResult> {
    const imagePromises = Array.from(
      { length: GeminiImageProvider.IMAGE_COUNT },
      (_, i) => this.generateSingleImage(request, i),
    );

    const results = await Promise.allSettled(imagePromises);
    const assetUrls = results
      .filter((r): r is PromiseFulfilledResult<string[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    if (assetUrls.length === 0) {
      // All failed — throw the first error
      const firstRejection = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw firstRejection?.reason ?? new Error("All image generation attempts failed.");
    }

    return {
      assetUrls,
      rationale: `Generated ${assetUrls.length} supporting image(s) with 2026 editorial aesthetic. Upload data URLs to object storage before passing to the presentation engine.`,
    };
  }

  private async generateSingleImage(
    request: ImageGenerationRequest,
    _index: number,
  ): Promise<string[]> {
    let response: GeminiGenerateContentResponse | undefined;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const result = await requestText(
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
                      "Create one polished supporting image for a modern 2026 sales presentation.",
                      "",
                      "AESTHETIC DIRECTION (2026 trends):",
                      "- Photos should feel raw and human — grainy portraits, muted warm tones, real-life scenes",
                      "- NOT glossy stock photography. Think editorial magazine or documentary style.",
                      "- Use warm neutrals, earthy tones, or deep moody palettes as the base",
                      "- Soft depth-of-field, natural lighting, slight film grain is ideal",
                      "- For abstract/concept images: rounded geometry, soft gradients, organic shapes",
                      "",
                      "CONTEXT:",
                      `Target company industry: ${request.companyBrief.industry}`,
                      `Target company offer: ${request.companyBrief.offer}`,
                      request.companyBrief.locale
                        ? `Locale cues: ${request.companyBrief.locale}`
                        : "",
                      `Seller positioning summary: ${request.sellerPositioningSummary}`,
                      `Presentation objective: ${request.objective}`,
                      `Visual style: ${request.visualStyle}`,
                      "",
                      "STRICT RULES: No logos, no text overlays, no UI screenshots, no watermarks, no unrealistic CGI collages, no generic stock photo poses.",
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

      if (result.status >= 500 && result.status < 600 && attempt < MAX_RETRIES) {
        lastError = new Error(
          `Gemini image generation failed: HTTP ${result.status}: ${result.text.slice(0, 300)}`,
        );
        console.warn(
          `[gemini-image] Transient error on attempt ${attempt + 1}. Retrying in ${RETRY_DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `HTTP ${result.status} from POST https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent: ${result.text.slice(0, 500)}`,
        );
      }

      response = JSON.parse(result.text) as GeminiGenerateContentResponse;
      break;
    }

    if (!response) {
      throw lastError ?? new Error("Gemini image generation failed after retries.");
    }

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

    return assetUrls;
  }
}
