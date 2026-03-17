/**
 * Slide Planner Agent
 *
 * Takes the company brief + seller brief and produces a detailed slide-by-slide
 * content plan.  This plan then becomes the prompt for Plus AI, ensuring:
 * - Content focuses on the TARGET company (not the seller)
 * - Each slide has a clear purpose with concise talking points
 * - Proper deck structure: cover → problem → solution → proof → CTA → contact
 * - Wordiness is controlled via the verbosity setting
 */

import type { CompanyBrief, DeckGenerationInput } from "@/src/integrations/providers";
import type { SellerDiscoveryResult } from "@/src/integrations/providers";
import { requestJson } from "@/src/integrations/http";

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export interface SlidePlan {
  title: string;
  slides: Array<{
    slideNumber: number;
    purpose: string;
    headline: string;
    bulletPoints: string[];
    speakerNotes: string;
    suggestImage: boolean;
    imagePrompt?: string;
  }>;
}

interface SlidePlannerInput {
  companyBrief: CompanyBrief;
  sellerBrief: SellerDiscoveryResult;
  deckInput: DeckGenerationInput;
  sellerContactInfo?: {
    companyName?: string;
    email?: string;
    phone?: string;
    website?: string;
    logoUrl?: string;
  };
}

const PLANNER_SYSTEM_PROMPT = `You are an expert presentation strategist who creates detailed slide-by-slide plans for personalized B2B sales decks.

CRITICAL RULES:
1. The deck is FOR the target company. 80% of content should be about THEM — their business, challenges, industry, and opportunities.
2. The seller's services are introduced as the SOLUTION to the target's specific problems — not as the main topic.
3. NEVER be generic. Every bullet point must reference specific details about the target company.
4. Keep text CONCISE. Each bullet should be 8-15 words max. Headlines should be 3-7 words.
5. The deck structure MUST include:
   - Slide 1: Title slide with target company name prominently featured
   - Slides 2-3: About the target — their business, strengths, market position
   - Slides 4-5: Challenges/opportunities specific to their industry and operations
   - Slides 6-7: How the seller's solution addresses THEIR specific challenges
   - Slide N-1: Next steps / Call to action
   - Slide N: Contact information slide (seller's details)
6. For images: suggest relevant images that relate to the TARGET company's industry, not generic stock photos.

Return ONLY valid JSON matching this schema:
{
  "title": "string - the presentation title (should mention target company name)",
  "slides": [
    {
      "slideNumber": 1,
      "purpose": "string - what this slide achieves",
      "headline": "string - the slide headline (3-7 words)",
      "bulletPoints": ["array of 3-5 concise bullet points"],
      "speakerNotes": "string - 1-2 sentence speaker note",
      "suggestImage": true/false,
      "imagePrompt": "string - if suggestImage is true, describe the ideal image"
    }
  ]
}`;

export class SlidePlanner {
  private readonly geminiApiKey: string;
  private readonly model: string;

  constructor(geminiApiKey: string, model = "gemini-2.0-flash") {
    this.geminiApiKey = geminiApiKey;
    this.model = model;
  }

  public async planSlides(input: SlidePlannerInput): Promise<SlidePlan> {
    const { companyBrief, sellerBrief, deckInput, sellerContactInfo } = input;
    const targetName = companyBrief.companyName ?? companyBrief.websiteUrl;

    // Determine wordiness level from tone
    const verbosityGuide = this.getVerbosityGuide(deckInput.tone);

    const userPrompt = [
      `## Target Company Profile`,
      `Name: ${targetName}`,
      `Website: ${companyBrief.websiteUrl}`,
      `Industry: ${companyBrief.industry}`,
      `What they do: ${companyBrief.offer}`,
      companyBrief.locale ? `Location: ${companyBrief.locale}` : "",
      `Key services: ${companyBrief.proofPoints.join("; ")}`,
      `Pain points: ${companyBrief.painPoints.join("; ")}`,
      `Decision maker: ${companyBrief.likelyBuyer}`,
      companyBrief.whyNow ? `Why now: ${companyBrief.whyNow}` : "",
      "",
      `## Seller (Solution Provider)`,
      `Company: ${sellerContactInfo?.companyName ?? "Our company"}`,
      `Offer: ${sellerBrief.offerSummary}`,
      `Differentiators: ${sellerBrief.preferredAngles.join(", ")}`,
      sellerBrief.proofPoints.length > 0
        ? `Proof points: ${sellerBrief.proofPoints.join("; ")}`
        : "",
      "",
      `## Deck Requirements`,
      `Archetype: ${deckInput.archetype.replaceAll("_", " ")}`,
      `Tone: ${deckInput.tone}`,
      `Visual style: ${deckInput.visualStyle.replaceAll("_", " ")}`,
      `Target audience: ${deckInput.audience}`,
      `Objective: ${deckInput.objective}`,
      `Call to action: ${deckInput.callToAction}`,
      `Number of slides: ${deckInput.cardCount} (including title and contact slides)`,
      `Image policy: ${deckInput.imagePolicy}`,
      "",
      `## Verbosity Guide`,
      verbosityGuide,
      "",
      deckInput.mustInclude.length > 0
        ? `Must include: ${deckInput.mustInclude.join(", ")}`
        : "",
      deckInput.mustAvoid.length > 0
        ? `Must avoid: ${deckInput.mustAvoid.join(", ")}`
        : "",
      "",
      `## Contact Slide (LAST SLIDE)`,
      `The final slide MUST be a contact information slide with:`,
      sellerContactInfo?.companyName ? `- Company: ${sellerContactInfo.companyName}` : "",
      sellerContactInfo?.email ? `- Email: ${sellerContactInfo.email}` : "",
      sellerContactInfo?.phone ? `- Phone: ${sellerContactInfo.phone}` : "",
      sellerContactInfo?.website ? `- Website: ${sellerContactInfo.website}` : "",
      "",
      `Now create a ${deckInput.cardCount}-slide plan.`,
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
              { role: "user", parts: [{ text: PLANNER_SYSTEM_PROMPT }] },
              {
                role: "model",
                parts: [{ text: "Ready. Provide the target company profile and deck requirements." }],
              },
              { role: "user", parts: [{ text: userPrompt }] },
            ],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
            },
          },
        },
      );

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error("[slide-planner] Gemini returned no text.");
        return this.buildFallbackPlan(input);
      }

      return JSON.parse(text) as SlidePlan;
    } catch (error) {
      console.error("[slide-planner] Planning failed, using fallback:", error);
      return this.buildFallbackPlan(input);
    }
  }

  /** Convert a slide plan into a structured prompt for Plus AI */
  public formatPlanAsPrompt(plan: SlidePlan, sellerContactInfo?: SlidePlannerInput["sellerContactInfo"]): string {
    const lines: string[] = [
      `# ${plan.title}`,
      "",
    ];

    for (const slide of plan.slides) {
      lines.push(`## Slide ${slide.slideNumber}: ${slide.headline}`);
      lines.push(`Purpose: ${slide.purpose}`);
      lines.push("");
      for (const bullet of slide.bulletPoints) {
        lines.push(`- ${bullet}`);
      }
      if (slide.speakerNotes) {
        lines.push("");
        lines.push(`Speaker notes: ${slide.speakerNotes}`);
      }
      lines.push("");
    }

    if (sellerContactInfo) {
      lines.push("---");
      lines.push("IMPORTANT: The last slide must display seller contact information prominently:");
      if (sellerContactInfo.companyName) lines.push(`Company: ${sellerContactInfo.companyName}`);
      if (sellerContactInfo.email) lines.push(`Email: ${sellerContactInfo.email}`);
      if (sellerContactInfo.phone) lines.push(`Phone: ${sellerContactInfo.phone}`);
      if (sellerContactInfo.website) lines.push(`Website: ${sellerContactInfo.website}`);
    }

    return lines.join("\n");
  }

  private getVerbosityGuide(tone: string): string {
    switch (tone) {
      case "concise":
        return "VERY concise. Max 3-4 bullet points per slide, each under 8 words. Headlines under 4 words. No paragraphs.";
      case "executive":
        return "Data-forward and brief. Max 3-4 bullet points per slide, each under 12 words. Use numbers and metrics wherever possible.";
      case "bold":
        return "Punchy and direct. Max 4 bullet points per slide, each under 10 words. Strong action verbs. No hedging.";
      case "consultative":
        return "Thoughtful but not wordy. Max 4-5 bullet points per slide, each under 15 words. Frame insights as recommendations.";
      case "friendly":
        return "Warm and clear. Max 4-5 bullet points per slide, each under 12 words. Conversational but professional.";
      default:
        return "Keep bullet points concise — under 12 words each. Max 4-5 per slide. Avoid paragraphs on slides.";
    }
  }

  private buildFallbackPlan(input: SlidePlannerInput): SlidePlan {
    const targetName = input.companyBrief.companyName ?? "Target Company";
    const sellerName = input.sellerContactInfo?.companyName ?? "Our Team";
    const slideCount = input.deckInput.cardCount;

    const slides: SlidePlan["slides"] = [
      {
        slideNumber: 1,
        purpose: "Title slide",
        headline: `Tailored for ${targetName}`,
        bulletPoints: [
          `Prepared by ${sellerName}`,
          `${input.deckInput.objective}`,
        ],
        speakerNotes: "Opening slide — set the context.",
        suggestImage: true,
        imagePrompt: `Professional ${input.companyBrief.industry} themed background`,
      },
      {
        slideNumber: 2,
        purpose: "Target company overview",
        headline: `About ${targetName}`,
        bulletPoints: [
          `Industry: ${input.companyBrief.industry}`,
          input.companyBrief.offer,
          ...input.companyBrief.painPoints.slice(0, 2),
        ],
        speakerNotes: "Show you've done your research on their business.",
        suggestImage: true,
      },
    ];

    // Fill middle slides
    for (let i = 3; i <= slideCount - 2; i++) {
      slides.push({
        slideNumber: i,
        purpose: i <= slideCount / 2 ? "Target challenges" : "Solution mapping",
        headline: i <= slideCount / 2 ? "Key Challenges" : "How We Help",
        bulletPoints: i <= slideCount / 2
          ? input.companyBrief.painPoints.slice(0, 4)
          : input.companyBrief.pitchAngles.slice(0, 4),
        speakerNotes: "",
        suggestImage: i % 2 === 0,
      });
    }

    // CTA slide
    slides.push({
      slideNumber: slideCount - 1,
      purpose: "Call to action",
      headline: "Next Steps",
      bulletPoints: [input.deckInput.callToAction, "We'd love to explore this further"],
      speakerNotes: "Drive the conversation forward.",
      suggestImage: false,
    });

    // Contact slide
    slides.push({
      slideNumber: slideCount,
      purpose: "Contact information",
      headline: "Let's Connect",
      bulletPoints: [
        input.sellerContactInfo?.companyName ?? sellerName,
        input.sellerContactInfo?.email ?? "",
        input.sellerContactInfo?.website ?? "",
      ].filter(Boolean),
      speakerNotes: "Final contact details.",
      suggestImage: false,
    });

    return {
      title: `Partnership Opportunity: ${sellerName} × ${targetName}`,
      slides,
    };
  }
}
