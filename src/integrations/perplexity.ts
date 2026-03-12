import { requestJson } from "./http";
import type {
  EnrichmentProvider,
  EnrichmentRequest,
  EnrichmentResult,
} from "./providers";

interface PerplexityChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  search_results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    date?: string;
  }>;
}

interface EnrichmentPayload {
  synthesizedSummary: string;
  confidence: "low" | "medium" | "high";
}

export class PerplexityEnrichmentProvider implements EnrichmentProvider {
  public readonly name = "perplexity" as const;
  private readonly apiKey: string;
  private readonly model: string;

  public constructor(apiKey: string, model = "sonar-pro") {
    this.apiKey = apiKey;
    this.model = model;
  }

  public async enrichCompany(request: EnrichmentRequest): Promise<EnrichmentResult> {
    const response = await requestJson<PerplexityChatCompletionResponse>(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: {
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You enrich company research for tailored outreach. Separate sourced facts from inference and stay concise.",
            },
            {
              role: "user",
              content: [
                `Target website: ${request.websiteUrl}`,
                request.companyName ? `Target company name: ${request.companyName}` : "",
                `Seller positioning summary: ${request.sellerPositioningSummary}`,
                `Requested signals: ${request.requestedSignals.join(", ")}`,
                "Return JSON only with fields synthesizedSummary and confidence.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "company_enrichment",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["synthesizedSummary", "confidence"],
                properties: {
                  synthesizedSummary: {
                    type: "string",
                    minLength: 1,
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                  },
                },
              },
            },
          },
          search_mode: "web",
        },
      },
    );

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Perplexity returned no content.");
    }

    const parsed = JSON.parse(rawContent) as EnrichmentPayload;

    return {
      synthesizedSummary: parsed.synthesizedSummary,
      confidence: parsed.confidence,
      evidence: (response.search_results ?? [])
        .filter((item): item is { title: string; url: string; snippet?: string } =>
          Boolean(item.title && item.url),
        )
        .map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet ?? "",
        })),
    };
  }
}
