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
  /** The single organizing metric that threads through the deck (e.g. "47% of leads go cold in 48hrs") */
  anchorMetric?: string;
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
  /** User-defined slide structure from the Structure page (e.g. "SLIDE STRUCTURE:\nSlide 1: Title — Description") */
  slideStructure?: string;
}

const PLANNER_SYSTEM_PROMPT = `You are a world-class presentation strategist who has studied every billion-dollar pitch deck — Anthropic, SpaceX, Airbnb, Coinbase, Synthesia — and the frameworks of Peter Thiel, Andy Raskin, and the Challenger Sale methodology. You create decks that make prospects FEEL something, then ACT.

═══════════════════════════════════════════════════════
CORE PRINCIPLES (from billion-dollar deck analysis)
═══════════════════════════════════════════════════════

1. THE DECK IS A CONVERSATION STARTER, NOT A DOCUMENT.
   It should create curiosity and earn a meeting, not answer every question.
   "If your pitch needs many explanations to feel convincing, the core insight isn't sharp enough." — SpaceX analysis

2. HEADERS CARRY THE NARRATIVE ALONE.
   Someone skimming ONLY headlines must understand the entire story.
   Instead of "Market" → "A $3B Market Growing 12% a Year"
   Instead of "Team" → "A Team That's Built and Exited Together"
   Every headline is a CLAIM, not a label.

3. ONE ORGANIZING METRIC.
   SpaceX built its entire pitch around "cost per kg to orbit." Identify the single metric
   that organizes the target's problem and make it the throughline of the deck.
   This metric should appear in the hook and echo in the proof slide.

4. CUSTOMER IS THE HERO, SELLER IS THE GUIDE.
   80%+ about the TARGET company. The seller's solution appears only as the answer.
   Airbnb didn't say "search places online" — they said "Save money while traveling."
   Lead with benefits, never features.

5. CONTRARIAN POSITIONING.
   Anthropic led with safety, not capability. SpaceX led with economics, not technology.
   Frame the conversation in a way competitors haven't considered.
   If your deck sounds like everyone else's, it IS everyone else's.

6. COMPOUNDING LOGIC (THE FLYWHEEL).
   Show how each achievement compounds: solving X enables Y, which unlocks Z.
   The best decks show a flywheel, not a linear progression.

═══════════════════════════════════════════════════════
DESIGN & CONTENT DENSITY
═══════════════════════════════════════════════════════

WORD BUDGET (data-backed):
- Target: 35-45 words per slide (excluding headline). Max: 60 words.
- If content exceeds 60 words, SPLIT into two slides — never shrink fonts.
- Decks under 100 words/slide get 6x more complete reads from investors.

HEADLINES:
- Full-sentence claims, 3-8 words. NEVER generic labels ("Problem", "Solution", "Market").
- THE HEADLINE NARRATIVE TEST: read all headlines in sequence — they must form a coherent story.
  An investor skimming only headlines should get 70-80% understanding.

BULLETS:
- Maximum 2-3 bullets per slide, each 8-15 words. One idea per bullet.
- Parallel grammatical structure (all start with verbs, OR all start with nouns).
- No sub-bullets. Ever.

DENSITY RHYTHM (alternate these three levels — NEVER two dense slides in a row):
- DENSE (problem, solution slides): headline + 2-3 bullets
- MEDIUM (comparison, process slides): headline + visual with labels
- SPARSE (stat callouts, transitions): headline + 1 large number or single line

GENERAL:
- ONE powerful idea per slide. A single stat with context > five bullet points.
- NEVER use paragraph text. Detail goes in speakerNotes, not on the slide.
- The 3-second rule: if a slide's core message isn't instantly clear, you've lost them.
- Every 3-4 content slides, insert a "breathing" slide for visual rhythm.

═══════════════════════════════════════════════════════
NARRATIVE ARC (Raskin + Thiel + Challenger Sale synthesis)
═══════════════════════════════════════════════════════

This is the REQUIRED emotional structure. Adapt slide counts to the requested deck length.

1. THE HOOK (Slide 1-2):
   - Slide 1: Bold title featuring the target company name. NOT "About Us."
     Optional: a credibility signal (media quote, client logo, or award) for instant authority.
   - Slide 2: Name the target's reality in a way that creates tension.
     Use their specific numbers, team size, or operational reality.
     NO BULLETS. One powerful headline that makes them think "they've done their homework."

2. THE SHIFT (Slides 3-4):
   - Name the big, relevant change happening in their world RIGHT NOW.
   - Show winners vs losers in this shift — make inaction feel risky.
   - Use the ORGANIZING METRIC here: quantify what's at stake.
   - Back every claim with a specific number or study (Thiel's rule).
   - Use their specific industry context, not generic trends.

3. THE VISION (Slide 5):
   - Paint the "promised land" — what success looks like for THEM specifically.
   - This is Raskin's key insight: make the future desirable AND difficult to achieve alone.
   - Bold future-state headline. No bullets. No product mention yet.

4. THE SOLUTION (Slides 6-8) — "Magic Gifts":
   - Each slide: one specific challenge → one capability that solves it.
   - Frame as ENABLERS of the vision, not features of a product.
   - Show compounding logic: solving A enables B, which unlocks C (the flywheel).
   - Include specific proof points or metrics as inline evidence.
   - Use comparison/split layouts where appropriate.

5. THE PROOF (Slide N-3 to N-2):
   - Case study that MIRRORS the target's profile (similar size, industry, challenges).
   - Specific numbers: "churn dropped from 8.2% to 5.6%" not "reduced churn."
   - Before/after format or testimonial with pull quote.
   - This slide should trigger "if they can, we can" thinking.

6. THE PATH FORWARD (Slide N-1 to N):
   - Low-friction, specific next step. "30-minute audit" not "let's chat."
   - Three concrete deliverables they'll get from the meeting.
   - Final slide: Clean contact information with company name, email, website.

═══════════════════════════════════════════════════════
SLIDE TYPES & LAYOUT ASSIGNMENT — use at least 4 types:
═══════════════════════════════════════════════════════

- "statement": Bold headline, 0 bullets. Centered layout. For section dividers, vision, provocative claims.
- "data": One large metric + 1 supporting line. Centered Single Stat layout. The "money slide."
  Format: [Large Number in accent color] + [Short Label] + [Optional context line].
- "content": 1-3 bullets with headline. Title + Body layout. Use sparingly — max 30% of slides.
- "comparison": Two-column 50/50 split (before/after, problem/solution, old way/new way).
- "proof": Case study with specific named metrics. Pull-quote or before/after format.

REQUIRED "MONEY SLIDE": Every deck must have exactly ONE slide with 2-3 oversized statistics
showing the most compelling proof point. This is the slide that gets screenshotted and shared.

CTA SPECIFICITY: Final CTA must contain a verb + implied timeline.
"Schedule a 30-minute audit this week" >> "Contact us" >> "Thank you."

═══════════════════════════════════════════════════════
ANTI-PATTERNS — NEVER DO THESE:
═══════════════════════════════════════════════════════

- Generic labels as headlines ("Our Solution", "Market Overview", "Next Steps")
- Feature lists instead of benefit statements
- Paragraph text on any slide
- More than 2 bullets per slide
- Vague claims without specific numbers ("significant growth" → use the actual %)
- Generic stock imagery descriptions
- Ending with "Let's chat" instead of a specific, concrete CTA
- Comprehensiveness over persuasion — create curiosity, not a thesis defense

Return ONLY valid JSON matching this schema:
{
  "title": "string - presentation title (mention target company, make it a claim not a label)",
  "anchorMetric": "string - the single organizing metric for this deck (e.g. '47% of their leads go cold within 48 hours')",
  "slides": [
    {
      "slideNumber": 1,
      "purpose": "string - narrative arc section (hook/shift/vision/solution/proof/path_forward)",
      "headline": "string - bold slide headline (3-6 words, must be a CLAIM not a label)",
      "bulletPoints": ["0-2 concise bullets, each under 8 words"],
      "speakerNotes": "string - 1-2 sentence speaker note with detail that doesn't belong on the slide",
      "suggestImage": true/false,
      "imagePrompt": "string - if true, describe a specific, high-quality image. Prefer: editorial photography, real-world scenes, muted tones, human moments. NEVER generic stock."
    }
  ]
}`;

export class SlidePlanner {
  private readonly geminiApiKey: string;
  private readonly model: string;

  constructor(geminiApiKey: string, model = "gemini-2.5-flash") {
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
      // Advanced brief fields — power the Thiel/Raskin narrative
      companyBrief.anchorMetric
        ? `## Anchor Metric (USE THIS AS THE DECK'S THROUGHLINE)\n${companyBrief.anchorMetric}`
        : "",
      companyBrief.contrarianAngle
        ? `## Contrarian Angle (frame the conversation unexpectedly)\n${companyBrief.contrarianAngle}`
        : "",
      companyBrief.compoundingLogic
        ? `## Compounding Logic (show the flywheel)\n${companyBrief.compoundingLogic}`
        : "",
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
      ...(deckInput.archetype === "custom" && deckInput.customArchetypePrompt
        ? [
            "",
            `## Custom Archetype Instructions (FOLLOW CLOSELY)`,
            `The user has defined a custom deck framing. Use these instructions instead of standard archetype conventions:`,
            deckInput.customArchetypePrompt,
            "",
          ]
        : []),
      `Tone: ${deckInput.tone}`,
      `Visual style: ${deckInput.visualStyle.replaceAll("_", " ")}`,
      `Target audience: ${deckInput.audience}`,
      `Objective: ${deckInput.objective}`,
      `Call to action: ${deckInput.callToAction}`,
      `Number of slides: ${deckInput.cardCount} (including title and contact slides)`,
      `Image policy: ${deckInput.imagePolicy}`,
      `Visual content preferences: ${deckInput.visualContentTypes?.join(", ") || "AI's choice"}`,
      `Visual density: ${deckInput.visualDensity || "moderate"}`,
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
      // Include user-defined slide structure if they customized it
      ...(input.slideStructure
        ? [
            "",
            `## User-Defined Slide Structure (FOLLOW THIS CLOSELY)`,
            `The user has defined the following slide structure. Use these titles and descriptions as the basis for each slide.`,
            `Each slide description acts as a content prompt — generate the bullet points that fulfill what the user described.`,
            `You may adjust wording for the headline to be punchier, but RESPECT the user's intent for each slide.`,
            "",
            input.slideStructure,
          ]
        : []),
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
              temperature: 0.55,
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

  /**
   * Produce a DENSER prompt for Alai (and similar providers that benefit from
   * more context per slide).  Unlike formatPlanAsPrompt which is kept sparse
   * for Plus AI, this version includes:
   * - Narrative-arc section headers (## THE HOOK, ## THE SHIFT, etc.)
   * - Speaker notes inlined as paragraph body text
   * - Image descriptions as inline hints
   * - Explicit layout suggestions per slide
   * - Longer, more descriptive bullet text
   */
  public formatPlanForAlai(
    plan: SlidePlan,
    sellerContactInfo?: SlidePlannerInput["sellerContactInfo"],
  ): string {
    const lines: string[] = [
      `# ${plan.title}`,
      "",
    ];

    if (plan.anchorMetric) {
      lines.push(`> **Anchor Metric:** ${plan.anchorMetric}`);
      lines.push("");
    }

    // Map purpose values to narrative-arc section labels
    const sectionLabels: Record<string, string> = {
      hook: "THE HOOK",
      shift: "THE SHIFT",
      vision: "THE VISION",
      solution: "THE SOLUTION",
      proof: "THE PROOF",
      path_forward: "THE PATH FORWARD",
    };

    let currentSection = "";

    for (const slide of plan.slides) {
      // Emit a section header when the narrative arc section changes
      const purpose = slide.purpose.toLowerCase().replace(/\s+/g, "_");
      const sectionKey = Object.keys(sectionLabels).find((key) => purpose.includes(key));
      const sectionLabel = sectionKey ? sectionLabels[sectionKey] : undefined;

      if (sectionLabel && sectionLabel !== currentSection) {
        currentSection = sectionLabel;
        lines.push(`## ${currentSection}`);
        lines.push("");
      }

      // Slide headline
      lines.push(`### Slide ${slide.slideNumber}: ${slide.headline}`);
      lines.push("");

      // Layout hint based on slide purpose and content
      const layoutHint = this.inferLayoutHint(slide);
      if (layoutHint) {
        lines.push(`_Layout: ${layoutHint}_`);
        lines.push("");
      }

      // Bullet points — expanded with more descriptive text
      if (slide.bulletPoints.length > 0) {
        for (const bullet of slide.bulletPoints) {
          lines.push(`- ${bullet}`);
        }
        lines.push("");
      }

      // Speaker notes as body paragraph content (no "Speaker notes:" prefix)
      if (slide.speakerNotes) {
        lines.push(slide.speakerNotes);
        lines.push("");
      }

      // Image description inline
      if (slide.suggestImage && slide.imagePrompt) {
        lines.push(`[Image: ${slide.imagePrompt}]`);
        lines.push("");
      }
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

  /** Infer a layout hint for Alai based on the slide's content and purpose. */
  private inferLayoutHint(slide: SlidePlan["slides"][number]): string | null {
    const purpose = slide.purpose.toLowerCase();
    const headline = slide.headline.toLowerCase();
    const hasBullets = slide.bulletPoints.length > 0;
    const hasImage = slide.suggestImage;

    // Check for big-number / statistic slides
    if (/\d+[%x×]|\$[\d,]+|^\d/.test(slide.headline)) {
      return "This slide should feature a large statistic prominently.";
    }

    // Comparison / split layouts
    if (purpose.includes("comparison") || purpose.includes("shift") || headline.includes("vs")) {
      return "Use a two-column comparison layout.";
    }

    // Vision / statement slides — bold, minimal
    if (purpose.includes("vision") || purpose === "statement") {
      return "Full-width bold statement. Minimal text, maximum impact.";
    }

    // Proof / case study slides
    if (purpose.includes("proof") || purpose.includes("case_study") || purpose.includes("testimonial")) {
      return "Use a testimonial or case-study card layout with a pull quote.";
    }

    // Contact slide
    if (purpose.includes("contact") || headline.includes("connect") || headline.includes("reach")) {
      return "Clean contact information layout with ample whitespace.";
    }

    // Image-heavy slide
    if (hasImage && !hasBullets) {
      return "Full-bleed image with overlay text.";
    }

    if (hasImage && hasBullets) {
      return "Split layout: image on one side, content on the other.";
    }

    // Section divider
    if (!hasBullets && !hasImage) {
      return "Section divider — bold headline centered, no other elements.";
    }

    return null;
  }

  private getVerbosityGuide(tone: string): string {
    const base = "Remember: headers alone must tell the full story. Every claim backed by a number (Thiel's rule). Create curiosity, not comprehensiveness.";
    switch (tone) {
      case "concise":
        return `Ultra-minimal. Max 1 bullet per slide, under 6 words. Headlines under 4 words. 60%+ of slides should have ZERO bullets — just a bold headline or single metric. Think Anthropic's 10-slide deck: pure conviction, no fluff. ${base}`;
      case "executive":
        return `Data-forward. Max 2 bullets per slide, under 8 words. Lead with the anchor metric. Include 3+ 'big number' slides (single stat + one context line). Frame every number as a decision point, not decoration. ${base}`;
      case "bold":
        return `Punchy and provocative. Max 2 bullets, under 7 words. Strong verbs. No hedging. Every headline should feel like a billboard. Use contrarian positioning — reframe the conversation in a way competitors haven't considered. ${base}`;
      case "consultative":
        return `Insight-led. Max 2 bullets per slide, under 10 words. Frame as strategic recommendations. Show compounding logic: solving A enables B, which unlocks C. Position the seller as the expert guide, target as the hero. ${base}`;
      case "friendly":
        return `Warm and clear. Max 2 bullets per slide, under 8 words. Conversational but smart. Use the 'promised land' framing — paint a desirable future, then show you're the path there. ${base}`;
      default:
        return `Keep bullets concise — max 2 per slide, under 8 words. Mix slide types for visual rhythm. No paragraphs. Less text = more impact. ${base}`;
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
