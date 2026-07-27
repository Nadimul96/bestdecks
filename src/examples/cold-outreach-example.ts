export interface ExampleDeckSlide {
  id: number;
  role: "cover" | "tension" | "data" | "vision" | "solution" | "proof" | "roi" | "cta" | "about";
  title: string;
  subtitle: string;
  keyMetric?: string | null;
  bullets: string[];
}

export const coldOutreachExample = {
  slug: "cold-outreach",
  title: "Acme SaaS Corp: Unlock 28% Larger Deals with Hyper-Personalized Decks",
  subtitle: "A tailored brief for the VP of Sales at Acme SaaS Corp, by BestDecks",
  audience: "VP of Sales at a mid-market B2B SaaS company (100-500 employees)",
  goal: "Book a 15-minute live demo where we build a deck for their next prospect on the call",
  generatedAt: "2026-03-30T19:12:00.434Z",
  route: "/examples/cold-outreach",
  summary: {
    company: "BestDecks",
    target: "Acme SaaS Corp",
    theme: "clearpath-dark",
    slideCount: 9,
    highlights: [
      "Fictional companies, quotes, and metrics are sample data only.",
      "The fixture demonstrates a possible cold-outreach narrative structure.",
      "No claim in this sample is customer evidence or verified performance data.",
    ],
  },
  slides: [
    {
      id: 1,
      role: "cover",
      title: "Acme SaaS Corp: Unlock 28% Larger Deals with Hyper-Personalized Decks",
      subtitle: "A tailored brief for the VP of Sales at Acme SaaS Corp, by BestDecks",
      keyMetric: null,
      bullets: [],
    },
    {
      id: 2,
      role: "tension",
      title: "Your Sales Reps Deserve Better Than Generic Outreach",
      subtitle: "The hidden costs of manual personalization or no personalization at all.",
      keyMetric: "4+ hours per custom deck",
      bullets: [
        "Reps spend 4+ hours creating custom decks, or skip personalization entirely.",
        "Generic templates yield <3% reply rates; prospects see them as spam.",
        "Marketing creates beautiful templates, but reps struggle to customize them consistently.",
      ],
    },
    {
      id: 3,
      role: "data",
      title: "The Impact of Unpersonalized Sales Engagement",
      subtitle: "How current approaches limit deal velocity and size.",
      keyMetric: "<3% reply rate for generic outreach",
      bullets: [
        "Lack of CRM-to-deck intelligence means missed opportunities for relevance.",
        "Inconsistent messaging across reps erodes brand trust and authority.",
        "High churn rates on early-stage leads due to irrelevant initial outreach.",
      ],
    },
    {
      id: 4,
      role: "vision",
      title: "Imagine Every Rep Sending a Hyper-Personalized Deck in Minutes",
      subtitle: "A future where every prospect feels truly understood from the first touch.",
      keyMetric: null,
      bullets: [
        "Eliminate manual research and deck creation bottlenecks.",
        "Ensure every outreach deck is perfectly aligned with prospect needs.",
        "Empower reps to focus on selling, not designing.",
      ],
    },
    {
      id: 5,
      role: "solution",
      title: "BestDecks: AI-Powered Personalization at Scale",
      subtitle: "Our platform transforms your sales outreach with intelligent, custom decks.",
      keyMetric: "Decks generated in under 2 minutes",
      bullets: [
        "**Prospect Crawl**: Automatically analyzes prospect websites and market data.",
        "**Intelligence Enrichment**: Integrates CRM data and market insights.",
        "**Narrative Frameworks**: Applies proven billion-dollar pitch structures.",
        "**Brand Consistency**: Generates on-brand, compelling presentations in minutes.",
      ],
    },
    {
      id: 6,
      role: "proof",
      title: "Real Results: TechStart Inc. Boosts Reply Rates & Deal Sizes",
      subtitle: "How one SaaS company transformed their sales outreach with BestDecks.",
      keyMetric: "31% increase in average deal size",
      bullets: [
        "Reduced deck creation from 4 hours to just 12 minutes per deck.",
        "Email reply rates jumped from 4% to an impressive 18%.",
        "Average deal size increased by 31% within 90 days of adoption.",
        "\"BestDecks turned our outreach from spray-and-pray to sniper-precise.\" - CEO, TechStart Inc.",
      ],
    },
    {
      id: 7,
      role: "roi",
      title: "Quantifiable ROI: More Deals, Faster, and Larger",
      subtitle: "BestDecks delivers measurable impact on your sales pipeline.",
      keyMetric: "28% average deal size increase",
      bullets: [
        "**42% Higher Email Reply Rate**: Engage more prospects from the start.",
        "**28% Average Deal Size Increase**: Close bigger deals with tailored narratives.",
        "**Hours Saved Per Rep**: Reallocate time from deck building to selling.",
        "**200+ Sales Teams**: Trusted by leading B2B SaaS companies.",
      ],
    },
    {
      id: 8,
      role: "cta",
      title: "See BestDecks in Action: Build Your Next Deck Live",
      subtitle: "Let us show you how quickly we can personalize for your prospects.",
      keyMetric: null,
      bullets: [
        "**Book a 15-minute live demo**: We'll build a deck for *your* next prospect on the call.",
        "Experience instant, hyper-personalized content generation.",
        "Understand how BestDecks integrates with your existing CRM (Salesforce, HubSpot).",
      ],
    },
    {
      id: 9,
      role: "about",
      title: "BestDecks: Your AI Partner for Elite Sales Decks",
      subtitle: "Empowering sales teams to close more deals with intelligent personalization.",
      keyMetric: null,
      bullets: [
        "We leverage AI to craft compelling narratives for every unique prospect.",
        "Our platform ensures brand consistency and message relevance at scale.",
        "Join 200+ sales teams who are already transforming their outreach.",
      ],
    },
  ] satisfies ExampleDeckSlide[],
} as const;
