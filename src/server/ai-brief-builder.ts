/**
 * AI-Powered Company Brief Builder
 *
 * Replaces the old LocalCompanyBriefBuilder that used hardcoded generic pain
 * points and never actually analyzed crawl data.  This version sends the crawl
 * markdown + enrichment summary to Gemini and extracts a rich, structured
 * target company profile that forms the backbone of every deck.
 */

import type { CompanyBriefBuilder } from "@/src/app/orchestrator";
import type { IntakeRun } from "@/src/domain/schemas";
import type { CompanyBrief, SellerDiscoveryResult } from "@/src/integrations/providers";
import { requestJson } from "@/src/integrations/http";

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface ExtractedBrief {
  companyName: string;
  industry: string;
  offer: string;
  locale: string | null;
  likelyBuyer: string;
  whyNow: string;
  painPoints: string[];
  proofPoints: string[];
  pitchAngles: string[];
  keyServices: string[];
  competitiveAdvantages: string[];
  operationalInsights: string[];
}

const BRIEF_SYSTEM_PROMPT = `You are an expert B2B sales researcher. Given a target company's website content and external research, extract a structured company profile.

IMPORTANT RULES:
1. Focus ENTIRELY on the TARGET company — not the seller.
2. Extract SPECIFIC details from their actual website content — names, services, pricing, team, locations, testimonials.
3. For pain points: infer real operational challenges based on their industry and what you see on their site. Think about what keeps their owner/manager up at night.
4. For pitch angles: think about how a service provider could genuinely help THIS specific business.
5. Be specific — never use generic filler like "may have mismatches" or "likely receives generic outreach."
6. If the company is a gym/fitness studio, mention specific classes, membership types, locations, trainers, etc.
7. For operational insights: infer how they likely operate based on their industry, size, and website evidence.

Return ONLY valid JSON matching this exact schema:
{
  "companyName": "string - their actual business name",
  "industry": "string - specific industry/sub-industry, e.g. 'Boutique fitness / group training studios'",
  "offer": "string - what they sell/provide in 1-2 sentences",
  "locale": "string or null - city, state if identifiable",
  "likelyBuyer": "string - who at this company would make purchasing decisions",
  "whyNow": "string - a timely reason this company might need the seller's services right now",
  "painPoints": ["array of 4-6 specific pain points for THIS business"],
  "proofPoints": ["array of 3-5 notable facts/stats/testimonials from their site"],
  "pitchAngles": ["array of 3-5 angles to pitch services to them"],
  "keyServices": ["array of their main services/products"],
  "competitiveAdvantages": ["array of what makes them unique"],
  "operationalInsights": ["array of 3-5 inferred operational realities"]
}`;

export class AiBriefBuilder implements CompanyBriefBuilder {
  private readonly geminiApiKey: string;
  private readonly model: string;

  constructor(geminiApiKey: string, model = "gemini-2.0-flash") {
    this.geminiApiKey = geminiApiKey;
    this.model = model;
  }

  public async buildCompanyBrief(input: {
    target: IntakeRun["targets"][number];
    sellerBrief: SellerDiscoveryResult;
    crawlMarkdown: string;
    sourceUrls: string[];
    enrichmentSummary: string;
  }): Promise<CompanyBrief> {
    const companyName =
      input.target.companyName ??
      new URL(input.target.websiteUrl).hostname.replace(/^www\./, "");

    // Truncate crawl markdown to avoid token limits — keep the most useful first 15K chars
    const truncatedCrawl = input.crawlMarkdown.length > 15000
      ? input.crawlMarkdown.slice(0, 15000) + "\n\n[... content truncated for analysis ...]"
      : input.crawlMarkdown;

    const userPrompt = [
      `## Target Company: ${companyName}`,
      `Website: ${input.target.websiteUrl}`,
      input.target.role ? `Contact role: ${input.target.role}` : "",
      input.target.campaignGoal ? `Campaign goal: ${input.target.campaignGoal}` : "",
      "",
      "## Website Content (crawled)",
      truncatedCrawl,
      "",
      "## External Research Summary",
      input.enrichmentSummary,
      "",
      "## Seller Context (for pitch angle generation only)",
      `The seller offers: ${input.sellerBrief.offerSummary}`,
      `Key differentiators: ${input.sellerBrief.preferredAngles.join(", ")}`,
      "",
      "Now extract the structured company profile JSON for the TARGET company.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await requestJson<GeminiTextResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": this.geminiApiKey },
          body: {
            contents: [
              { role: "user", parts: [{ text: BRIEF_SYSTEM_PROMPT }] },
              { role: "model", parts: [{ text: "I understand. Please provide the target company's website content and research, and I'll extract a structured profile." }] },
              { role: "user", parts: [{ text: userPrompt }] },
            ],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          },
        },
      );

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error("[ai-brief-builder] Gemini returned no text, using fallback.");
        return this.buildFallbackBrief(input, companyName);
      }

      const extracted = JSON.parse(text) as ExtractedBrief;

      return {
        websiteUrl: input.target.websiteUrl,
        companyName: extracted.companyName || companyName,
        industry: extracted.industry || "Unknown industry",
        offer: extracted.offer || "Services inferred from website",
        locale: extracted.locale ?? undefined,
        likelyBuyer: extracted.likelyBuyer || input.target.role || "Business owner or decision maker",
        whyNow: extracted.whyNow || undefined,
        painPoints: extracted.painPoints?.length > 0
          ? extracted.painPoints
          : ["Needs to be analyzed further"],
        proofPoints: [
          ...extracted.proofPoints,
          ...extracted.operationalInsights,
        ].slice(0, 6),
        pitchAngles: extracted.pitchAngles?.length > 0
          ? extracted.pitchAngles
          : input.sellerBrief.preferredAngles.slice(0, 3),
        sourceUrls: input.sourceUrls.filter((v, i, a) => a.indexOf(v) === i),
      };
    } catch (error) {
      console.error("[ai-brief-builder] AI analysis failed, using fallback:", error);
      return this.buildFallbackBrief(input, companyName);
    }
  }

  /** Fallback when AI extraction fails — still better than old hardcoded version */
  private buildFallbackBrief(
    input: {
      target: IntakeRun["targets"][number];
      sellerBrief: SellerDiscoveryResult;
      sourceUrls: string[];
      enrichmentSummary: string;
    },
    companyName: string,
  ): CompanyBrief {
    return {
      websiteUrl: input.target.websiteUrl,
      companyName,
      industry: "Industry inferred from research",
      offer: input.enrichmentSummary.slice(0, 200),
      locale: input.enrichmentSummary.match(/\b[A-Z][a-z]+,\s?[A-Z]{2}\b/)?.[0],
      likelyBuyer: input.target.role ?? "Business owner or decision maker",
      whyNow: undefined,
      painPoints: [
        "Business growth and customer acquisition challenges",
        "Operational efficiency in a competitive market",
        "Digital presence and marketing effectiveness",
      ],
      proofPoints: [input.enrichmentSummary].slice(0, 3),
      pitchAngles: input.sellerBrief.preferredAngles.slice(0, 3),
      sourceUrls: input.sourceUrls.filter((v, i, a) => a.indexOf(v) === i),
    };
  }
}
