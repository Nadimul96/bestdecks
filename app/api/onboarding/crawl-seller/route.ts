import { NextResponse } from "next/server";

import { getAdminSession } from "@/src/server/auth";
import { loadEnv } from "@/src/config/env";
import { requestJson } from "@/src/integrations/http";
import {
  crawlWithFallback,
  UnconfiguredCloudflareCrawler,
  UnconfiguredDeepcrawlCrawler,
} from "@/src/integrations/providers";
import type { CrawlProvider } from "@/src/integrations/providers";
import { saveSellerBriefMd, saveAudienceContext } from "@/src/server/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ─────────────────────────────────────────────
   POST /api/onboarding/crawl-seller
   Crawls the seller's own website, enriches via
   Perplexity web search, and produces:
   1. A comprehensive .md business brief (persisted)
   2. Structured fields for form auto-fill
   ───────────────────────────────────────────── */

interface PerplexityChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  search_results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
  }>;
}

interface ExtractedSellerFields {
  companyName: string;
  offerSummary: string;
  services: string[];
  differentiators: string[];
  targetCustomer: string;
  desiredOutcome: string;
  proofPoints: string[];
  logoUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  audienceIndustry: string;
  audienceSize: string;
  audiencePainPoints: string;
  mustInclude: string[];
  mustAvoid: string[];
}

/* ── Prompts ─────────────────────────────────── */

const BRIEF_SYSTEM_PROMPT = `You are a senior business intelligence analyst. Given a company's website content and your web search knowledge, create a comprehensive business intelligence brief in Markdown format.

This brief will be the foundation document for all AI-generated materials about this company. It must be thorough, specific, and grounded in real evidence.

Structure your brief with the following sections (use these exact headings):

# {Company Name} — Business Intelligence Brief

## Company Overview
A 3-5 sentence executive summary of the company: what they do, who they serve, and their market position.

## Core Offerings
A detailed list of their products/services with brief descriptions. Be specific — name actual offerings, not vague categories.

## Value Proposition & Differentiators
What makes them different from competitors? Include specific advantages, unique methodologies, proprietary technology, or market positioning.

## Target Market
Who they primarily serve. Be specific about industries, company sizes, roles/titles, and geographic focus.

## Business Model
How they make money — pricing models, engagement types, revenue streams (if determinable).

## Proof Points & Credibility
Case studies, testimonials, metrics, awards, notable clients, partnerships, certifications. Use real numbers and names when available.

## Brand Voice & Positioning
How do they talk about themselves? What tone do they use? How do they position against competitors? Key messaging themes.

## Market Context
Industry trends, competitive landscape, and relevant market dynamics that affect this business.

## Key Strengths
Top 3-5 strategic strengths distilled from all the above analysis.

## Potential Opportunities
Areas where they could strengthen messaging, expand positioning, or better communicate value.

Rules:
- Be specific and evidence-based — cite real details from the website and your web research
- When you find verifiable facts (revenue, employee count, founding year, etc.), include them
- When inferring, clearly note it as "appears to" or "likely"
- No generic filler — every sentence should add actionable intelligence
- Keep total length between 800-2000 words`;

function buildBriefUserPrompt(websiteUrl: string, markdown: string): string {
  const truncated = markdown.slice(0, 48_000);

  return [
    `Company website: ${websiteUrl}`,
    "",
    "Crawled website content (markdown):",
    "---",
    truncated,
    "---",
    "",
    "Using BOTH the website content above AND your web search capabilities, create a comprehensive business intelligence brief for this company.",
    "Search the web for additional context: press coverage, reviews, industry reports, company news, LinkedIn presence, competitor comparisons, etc.",
    "The output must be a single Markdown document following the structure described in your instructions.",
  ].join("\n");
}

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction specialist. Given a comprehensive business intelligence brief (in Markdown) and the company's website content, extract structured fields for a form.

Return valid JSON matching this exact schema:
{
  "companyName": "The company name",
  "offerSummary": "1-2 sentence summary of what they sell or do",
  "services": ["specific service or product 1", "specific service or product 2", ...],
  "differentiators": ["what makes them different 1", "what makes them different 2", ...],
  "targetCustomer": "Who they primarily serve — specific role/title and industry only (e.g., 'VP of Operations at mid-market logistics companies')",
  "desiredOutcome": "The primary outcome or transformation they deliver for customers",
  "proofPoints": ["case study, metric, testimonial, or credibility signal 1", ...],
  "logoUrl": "Direct URL to the company's logo image (look for /logo.png, /logo.svg, or og:image in the website HTML). Empty string if not found.",
  "facebookUrl": "Company Facebook page URL. Empty string if not found.",
  "twitterUrl": "Company X/Twitter profile URL. Empty string if not found.",
  "instagramUrl": "Company Instagram profile URL. Empty string if not found.",
  "tiktokUrl": "Company TikTok profile URL. Empty string if not found.",
  "audienceIndustry": "The specific industry/vertical their customers are in (e.g., 'Healthcare', 'Real Estate', 'SaaS')",
  "audienceSize": "Typical customer company size (e.g., '50-500 employees', 'SMBs with $1M-$10M revenue')",
  "audiencePainPoints": "Top 2-3 pain points their target audience faces, comma-separated",
  "mustInclude": ["topic or phrase that should always appear in outreach decks about this company", ...],
  "mustAvoid": ["topic or phrase to never use in outreach for this company", ...]
}

Rules:
- services: list 2-6 specific offerings, not vague categories
- differentiators: list 2-4 concrete advantages, not generic claims like "best quality"
- proofPoints: real numbers, customer names, awards, or specific results when available. Empty array if none found.
- targetCustomer: ONLY include the role/title and type of company. Do NOT include company size here — put that in audienceSize.
- audienceSize: be specific with numbers (employee count, revenue range)
- audiencePainPoints: concise, comma-separated pain points
- logoUrl: look for img tags with "logo" in src/alt/class, or og:image meta tag, or favicon. Prefer SVG/PNG. Use the full absolute URL.
- Social URLs: look for links to facebook.com, twitter.com/x.com, instagram.com, tiktok.com in the website footer or header. Use full URLs.
- mustInclude: 2-4 topics that are core to this company's value prop (e.g., "ROI data", "customer testimonials", "compliance certifications")
- mustAvoid: 1-3 topics to avoid (e.g., "competitor comparisons", "unverified claims", "pricing specifics")
- Keep all text concise — no long paragraphs in any field
- Extract only — do not invent information not present in the brief or website`;

/* ── Helpers ─────────────────────────────────── */

function buildCrawler(type: "cloudflare" | "deepcrawl"): CrawlProvider {
  const env = loadEnv();

  if (type === "cloudflare" && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    const { CloudflareCrawler } = require("@/src/integrations/cloudflare");
    return new CloudflareCrawler({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      maxPollAttempts: 30,
      pollDelayMs: 3000,
    });
  }

  if (type === "deepcrawl" && env.DEEPCRAWL_API_KEY) {
    const { DeepcrawlCrawler } = require("@/src/integrations/deepcrawl");
    return new DeepcrawlCrawler({ apiKey: env.DEEPCRAWL_API_KEY });
  }

  return type === "cloudflare"
    ? new UnconfiguredCloudflareCrawler()
    : new UnconfiguredDeepcrawlCrawler();
}

async function callPerplexity(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  useJsonFormat: boolean = false,
): Promise<{ content: string; searchResults: PerplexityChatResponse["search_results"] }> {
  const body: Record<string, unknown> = {
    model: "sonar-pro",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    search_mode: "web",
  };

  if (useJsonFormat) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "seller_extraction",
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "companyName",
            "offerSummary",
            "services",
            "differentiators",
            "targetCustomer",
            "desiredOutcome",
            "proofPoints",
            "logoUrl",
            "facebookUrl",
            "twitterUrl",
            "instagramUrl",
            "tiktokUrl",
            "audienceIndustry",
            "audienceSize",
            "audiencePainPoints",
            "mustInclude",
            "mustAvoid",
          ],
          properties: {
            companyName: { type: "string", minLength: 1 },
            offerSummary: { type: "string", minLength: 1 },
            services: { type: "array", items: { type: "string" } },
            differentiators: { type: "array", items: { type: "string" } },
            targetCustomer: { type: "string", minLength: 1 },
            desiredOutcome: { type: "string", minLength: 1 },
            proofPoints: { type: "array", items: { type: "string" } },
            logoUrl: { type: "string" },
            facebookUrl: { type: "string" },
            twitterUrl: { type: "string" },
            instagramUrl: { type: "string" },
            tiktokUrl: { type: "string" },
            audienceIndustry: { type: "string" },
            audienceSize: { type: "string" },
            audiencePainPoints: { type: "string" },
            mustInclude: { type: "array", items: { type: "string" } },
            mustAvoid: { type: "array", items: { type: "string" } },
          },
        },
      },
    };
  }

  const response = await requestJson<PerplexityChatResponse>(
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Perplexity returned no content.");
  }

  return { content, searchResults: response.search_results };
}

/* ── Main handler ────────────────────────────── */

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = loadEnv();

  if (!env.PERPLEXITY_API_KEY) {
    return NextResponse.json(
      { error: "Perplexity API key is not configured. Cannot analyze website." },
      { status: 503 },
    );
  }

  let websiteUrl: string;
  try {
    const body = await request.json();
    websiteUrl = body.websiteUrl;
    if (!websiteUrl || typeof websiteUrl !== "string") {
      return NextResponse.json(
        { error: "websiteUrl is required." },
        { status: 400 },
      );
    }

    // Normalize URL — add protocol if missing
    if (!/^https?:\/\//i.test(websiteUrl)) {
      websiteUrl = `https://${websiteUrl}`;
    }

    // Validate it's a proper URL
    new URL(websiteUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body or URL." },
      { status: 400 },
    );
  }

  /* ── Step 1: Crawl the seller's website ──── */

  let markdownContent: string;
  try {
    const primary = buildCrawler("cloudflare");
    const fallback = buildCrawler("deepcrawl");

    const crawlResult = await crawlWithFallback(
      {
        websiteUrl,
        maxPages: 8,
        maxDepth: 2,
        source: "all",
        requestedFormats: ["markdown"],
        includePatterns: undefined,
        excludePatterns: [
          "*/blog/*",
          "*/news/*",
          "*/press/*",
          "*/careers/*",
          "*/jobs/*",
          "*/privacy*",
          "*/terms*",
          "*/cookie*",
          "*/legal*",
        ],
        userApprovedException: true,
      },
      primary,
      fallback,
    );

    // Combine crawled pages — prioritize homepage and key business pages
    const pages = crawlResult.pages
      .filter((page) => page.markdown && page.markdown.trim().length > 50)
      .sort((a, b) => {
        const priority = (url: string) => {
          if (url === websiteUrl || url === websiteUrl + "/") return 0;
          if (/\/(about|services|solutions|products|what-we-do)/i.test(url)) return 1;
          if (/\/(pricing|features|capabilities)/i.test(url)) return 2;
          if (/\/(case-stud|portfolio|work|clients|customers)/i.test(url)) return 3;
          return 4;
        };
        return priority(a.url) - priority(b.url);
      });

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable content from this website. The site may block automated access.",
        },
        { status: 422 },
      );
    }

    markdownContent = pages
      .slice(0, 5)
      .map((page) => `## Page: ${page.title ?? page.url}\n\n${page.markdown}`)
      .join("\n\n---\n\n");
  } catch (error) {
    console.error("[crawl-seller] Crawl failed:", error);
    return NextResponse.json(
      {
        error:
          "Website crawl failed. The site may be unreachable or block automated access.",
      },
      { status: 422 },
    );
  }

  /* ── Step 2: Generate comprehensive .md via Perplexity ── */

  let sellerBriefMd: string;
  try {
    const briefResult = await callPerplexity(
      env.PERPLEXITY_API_KEY,
      BRIEF_SYSTEM_PROMPT,
      buildBriefUserPrompt(websiteUrl, markdownContent),
      false, // We want markdown, not JSON
    );

    sellerBriefMd = briefResult.content;

    // Append source references if Perplexity returned search results
    if (briefResult.searchResults?.length) {
      const sources = briefResult.searchResults
        .filter((s): s is { title: string; url: string } => Boolean(s.title && s.url))
        .map((s) => `- [${s.title}](${s.url})`)
        .join("\n");

      if (sources) {
        sellerBriefMd += `\n\n## Sources\n${sources}`;
      }
    }

    // Add metadata footer
    sellerBriefMd += `\n\n---\n*Generated on ${new Date().toISOString()} from ${websiteUrl}*\n`;

    if (!sellerBriefMd || sellerBriefMd.trim().length < 100) {
      return NextResponse.json(
        { error: "Could not generate meaningful business analysis." },
        { status: 422 },
      );
    }
  } catch (error) {
    console.error("[crawl-seller] Perplexity brief generation failed:", error);
    return NextResponse.json(
      { error: "Business analysis failed. Please try again or enter details manually." },
      { status: 502 },
    );
  }

  /* ── Step 3: Extract structured fields from the .md ── */

  let sellerFields: ExtractedSellerFields;
  try {
    const extractionResult = await callPerplexity(
      env.PERPLEXITY_API_KEY,
      EXTRACTION_SYSTEM_PROMPT,
      `Extract structured seller context fields from this business brief:\n\n${sellerBriefMd}`,
      true, // JSON format
    );

    sellerFields = JSON.parse(extractionResult.content) as ExtractedSellerFields;

    if (!sellerFields.offerSummary && !sellerFields.companyName) {
      return NextResponse.json(
        { error: "Could not extract meaningful business context from the analysis." },
        { status: 422 },
      );
    }
  } catch (error) {
    console.error("[crawl-seller] Field extraction failed:", error);
    return NextResponse.json(
      { error: "Field extraction failed. Please try again or enter details manually." },
      { status: 502 },
    );
  }

  /* ── Step 4: Persist the .md brief ─────────── */

  try {
    await saveSellerBriefMd(sellerBriefMd);
    // Also persist audience context for run-settings autofill
    await saveAudienceContext({
      audienceIndustry: sellerFields.audienceIndustry || undefined,
      audienceSize: sellerFields.audienceSize || undefined,
      audiencePainPoints: sellerFields.audiencePainPoints || undefined,
      mustInclude: sellerFields.mustInclude?.length ? sellerFields.mustInclude : undefined,
      mustAvoid: sellerFields.mustAvoid?.length ? sellerFields.mustAvoid : undefined,
    });
  } catch (error) {
    // Non-fatal — we still return the data even if persistence fails
    console.error("[crawl-seller] Failed to persist seller brief .md:", error);
  }

  /* ── Step 5: Return structured data + brief ── */

  return NextResponse.json({
    sellerContext: {
      companyName: sellerFields.companyName || undefined,
      offerSummary: sellerFields.offerSummary || undefined,
      services: sellerFields.services?.length ? sellerFields.services : undefined,
      differentiators: sellerFields.differentiators?.length
        ? sellerFields.differentiators
        : undefined,
      targetCustomer: sellerFields.targetCustomer || undefined,
      desiredOutcome: sellerFields.desiredOutcome || undefined,
      proofPoints: sellerFields.proofPoints?.length
        ? sellerFields.proofPoints
        : undefined,
      logoUrl: sellerFields.logoUrl || undefined,
      facebookUrl: sellerFields.facebookUrl || undefined,
      twitterUrl: sellerFields.twitterUrl || undefined,
      instagramUrl: sellerFields.instagramUrl || undefined,
      tiktokUrl: sellerFields.tiktokUrl || undefined,
    },
    // Extra fields for run-settings autofill
    audienceContext: {
      audienceIndustry: sellerFields.audienceIndustry || undefined,
      audienceSize: sellerFields.audienceSize || undefined,
      audiencePainPoints: sellerFields.audiencePainPoints || undefined,
      mustInclude: sellerFields.mustInclude?.length ? sellerFields.mustInclude : undefined,
      mustAvoid: sellerFields.mustAvoid?.length ? sellerFields.mustAvoid : undefined,
    },
    sellerBriefMd: sellerBriefMd,
  });
}
