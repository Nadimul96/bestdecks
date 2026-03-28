/**
 * Community Intelligence Provider
 *
 * Gathers real-time community insights about a target company's industry
 * from Reddit, X, HackerNews, and other forums.  This data enriches the
 * company brief with:
 * - Trending problems/complaints practitioners are discussing RIGHT NOW
 * - Industry shifts and emerging trends from the last 30 days
 * - Real-world proof points and benchmarks being shared in communities
 *
 * Two backends:
 * 1. Perplexity-based (default) — uses existing Perplexity key to search
 *    community platforms via web search.  Available immediately.
 * 2. last30days skill (optional) — deeper multi-platform analysis when the
 *    skill is installed and configured with SCRAPECREATORS_API_KEY.
 */

import { requestJson } from "./http";

export interface CommunityIntelResult {
  /** One-paragraph synthesis of what the community is saying */
  summary: string;
  /** Specific trending pain points from community discussions */
  trendingPainPoints: string[];
  /** Industry shifts or emerging trends mentioned in discussions */
  industryTrends: string[];
  /** Real benchmarks, metrics, or proof points shared by practitioners */
  communityBenchmarks: string[];
  /** Source platform indicators (e.g. "Reddit r/fitness", "X #gymtech") */
  sources: string[];
  /** Provider used: "perplexity_community" or "last30days" */
  provider: string;
}

export interface CommunityIntelProvider {
  gatherCommunityInsights(params: {
    industry: string;
    companyName?: string;
    websiteUrl: string;
    sellerOffer: string;
  }): Promise<CommunityIntelResult>;
}

// ── Perplexity-based implementation (default, no extra keys needed) ────────

interface PerplexityResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export class PerplexityCommunityIntelProvider implements CommunityIntelProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = "sonar-pro") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async gatherCommunityInsights(params: {
    industry: string;
    companyName?: string;
    websiteUrl: string;
    sellerOffer: string;
  }): Promise<CommunityIntelResult> {
    const searchQuery = [
      `"${params.industry}" problems challenges complaints trends`,
      "site:reddit.com OR site:x.com OR site:news.ycombinator.com",
    ].join(" ");

    const response = await requestJson<PerplexityResponse>(
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
              content: [
                "You are a community intelligence analyst. Search Reddit, X/Twitter, and HackerNews for recent discussions (last 30 days) about the given industry.",
                "Extract: (1) trending pain points practitioners are complaining about, (2) industry shifts and trends being discussed, (3) real benchmarks/metrics being shared.",
                "Return ONLY valid JSON matching this schema:",
                JSON.stringify({
                  summary: "string — 2-3 sentence synthesis",
                  trendingPainPoints: ["array of 3-5 specific pain points from community discussions"],
                  industryTrends: ["array of 2-3 industry shifts or trends"],
                  communityBenchmarks: ["array of 2-3 real metrics or benchmarks shared"],
                  sources: ["array of source indicators like 'Reddit r/subreddit', 'X #hashtag'"],
                }),
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                `Industry: ${params.industry}`,
                params.companyName ? `Company context: ${params.companyName}` : "",
                `Seller offers: ${params.sellerOffer}`,
                "",
                `Search for recent community discussions about challenges, trends, and pain points in the "${params.industry}" space.`,
                "Focus on Reddit threads, X posts, and HackerNews discussions from the last 30 days.",
                "What are real practitioners complaining about? What industry shifts are being discussed?",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          search_mode: "auto",
          temperature: 0.3,
        },
      },
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return this.buildEmptyResult();
    }

    try {
      // Perplexity may wrap JSON in markdown code blocks
      const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as CommunityIntelResult;
      return {
        summary: parsed.summary || "",
        trendingPainPoints: parsed.trendingPainPoints || [],
        industryTrends: parsed.industryTrends || [],
        communityBenchmarks: parsed.communityBenchmarks || [],
        sources: parsed.sources || [],
        provider: "perplexity_community",
      };
    } catch {
      // If JSON parsing fails, use the raw text as summary
      return {
        summary: content.slice(0, 500),
        trendingPainPoints: [],
        industryTrends: [],
        communityBenchmarks: [],
        sources: [],
        provider: "perplexity_community",
      };
    }
  }

  private buildEmptyResult(): CommunityIntelResult {
    return {
      summary: "",
      trendingPainPoints: [],
      industryTrends: [],
      communityBenchmarks: [],
      sources: [],
      provider: "perplexity_community",
    };
  }
}
