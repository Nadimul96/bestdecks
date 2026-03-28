import test from "node:test";
import assert from "node:assert/strict";

import { ProposalOrchestrator } from "./orchestrator";
import type { CompanyBrief, CrawlProvider, EnrichmentProvider, SellerDiscoveryResult } from "../integrations/providers";
import type { IntakeRun } from "../domain/schemas";

const sellerBrief: SellerDiscoveryResult = {
  positioningSummary: "Bestdecks creates research-backed outbound decks.",
  offerSummary: "Research-backed outreach decks.",
  proofPoints: ["Cloudflare crawl", "Perplexity enrichment"],
  preferredAngles: ["Evidence-first", "Target-specific"],
};

const intake: IntakeRun = {
  sellerContext: {
    websiteUrl: "https://bestdecks.co",
    companyName: "Bestdecks",
    offerSummary: "Research-backed outreach decks.",
    services: ["Research", "Deck generation"],
    differentiators: ["Evidence-first"],
    targetCustomer: "Growth leaders",
    desiredOutcome: "Book meetings",
    proofPoints: [],
    constraints: [],
  },
  questionnaire: {
    archetype: "cold_outreach",
    audience: "Founder",
    objective: "Book a call",
    callToAction: "Book a call",
    outputFormat: "bestdecks_editor",
    desiredCardCount: 8,
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "auto",
    visualContentTypes: [],
    visualDensity: "moderate",
    mustInclude: [],
    mustAvoid: [],
    optionalReview: true,
    allowUserApprovedCrawlException: false,
  },
  targets: [
    { websiteUrl: "https://acme.com", companyName: "Acme" },
    { websiteUrl: "https://broken.com", companyName: "Broken" },
  ],
};

class TestCrawler implements CrawlProvider {
  public readonly name = "cloudflare" as const;
  public readonly requests: Array<Record<string, unknown>> = [];

  public async crawlSite(input: {
    websiteUrl: string;
    maxPages?: number;
    maxDepth?: number;
    source?: string;
  }) {
    this.requests.push(input);

    if (input.websiteUrl.includes("broken")) {
      throw new Error("Primary crawl failed.");
    }

    return {
      provider: "cloudflare" as const,
      pages: [{ url: input.websiteUrl, markdown: "# Acme\nBusiness details" }],
      discoveredUrls: [input.websiteUrl],
      blockedUrls: [],
    };
  }
}

class NoopFallbackCrawler implements CrawlProvider {
  public readonly name = "deepcrawl" as const;

  public async crawlSite(): Promise<never> {
    throw new Error("Fallback unavailable.");
  }
}

class TestEnrichment implements EnrichmentProvider {
  public readonly name = "perplexity" as const;

  public async enrichCompany(input: { websiteUrl: string }) {
    return {
      synthesizedSummary: `${input.websiteUrl} serves a clear local market.`,
      evidence: [
        {
          title: "Positioning",
          url: input.websiteUrl,
          snippet: "Clear local positioning.",
        },
      ],
      confidence: "high" as const,
    };
  }
}

test("prepareRun isolates failed targets instead of aborting the whole batch", async () => {
  const primaryCrawler = new TestCrawler();
  const orchestrator = new ProposalOrchestrator({
    primaryCrawler,
    fallbackCrawler: new NoopFallbackCrawler(),
    enrichmentProvider: new TestEnrichment(),
    sellerBriefBuilder: {
      async buildSellerBrief() {
        return sellerBrief;
      },
    },
    companyBriefBuilder: {
      async buildCompanyBrief(input): Promise<CompanyBrief> {
        return {
          websiteUrl: input.target.websiteUrl,
          companyName: input.target.companyName ?? "Unknown",
          industry: "Services",
          offer: input.enrichmentSummary,
          locale: "Local",
          likelyBuyer: "Founder",
          whyNow: input.enrichmentSummary,
          painPoints: ["Generic outreach"],
          proofPoints: ["Evidence-backed"],
          pitchAngles: ["Target-specific"],
          sourceUrls: input.sourceUrls,
        };
      },
    },
  });

  const prepared = await orchestrator.prepareRun(intake);

  assert.equal(prepared.preparedCompanies.length, 1);
  assert.equal(prepared.preparedCompanies[0]?.target.websiteUrl, "https://acme.com");
  assert.equal(prepared.failedCompanies.length, 1);
  assert.equal(prepared.failedCompanies[0]?.target.websiteUrl, "https://broken.com");
  assert.match(prepared.failedCompanies[0]?.message ?? "", /crawl failed|Fallback unavailable/i);
  assert.equal(primaryCrawler.requests[0]?.maxPages, 10);
  assert.equal(primaryCrawler.requests[0]?.maxDepth, 2);
  assert.equal(primaryCrawler.requests[0]?.source, "all");
});

test("prepareRun narrows crawl scope and content for path-based landing pages", async () => {
  const primaryCrawler = new TestCrawler();
  const orchestrator = new ProposalOrchestrator({
    primaryCrawler,
    fallbackCrawler: new NoopFallbackCrawler(),
    enrichmentProvider: new TestEnrichment(),
    sellerBriefBuilder: {
      async buildSellerBrief() {
        return sellerBrief;
      },
    },
    companyBriefBuilder: {
      async buildCompanyBrief(input): Promise<CompanyBrief> {
        assert.match(input.crawlMarkdown, /Portland details/);
        assert.doesNotMatch(input.crawlMarkdown, /Scarborough details/);
        assert.ok(input.sourceUrls.includes("https://nxgenfitness.com/portland-home"));
        assert.ok(!input.sourceUrls.includes("https://nxgenfitness.com/scarborough-home"));

        return {
          websiteUrl: input.target.websiteUrl,
          companyName: input.target.companyName ?? "Unknown",
          industry: "Fitness",
          offer: input.enrichmentSummary,
          locale: "Local",
          likelyBuyer: "Owner",
          whyNow: input.enrichmentSummary,
          painPoints: ["Generic outreach"],
          proofPoints: ["Evidence-backed"],
          pitchAngles: ["Target-specific"],
          sourceUrls: input.sourceUrls,
        };
      },
    },
  });

  const landingInput: IntakeRun = {
    ...intake,
    targets: [{ websiteUrl: "https://nxgenfitness.com/portland-home", companyName: "NXGen Fitness" }],
  };

  primaryCrawler.crawlSite = async (request) => {
    primaryCrawler.requests.push(request);
    return {
      provider: "cloudflare" as const,
      pages: [
        { url: "https://nxgenfitness.com/portland-home", markdown: "# Portland details" },
        { url: "https://nxgenfitness.com/scarborough-home", markdown: "# Scarborough details" },
      ],
      discoveredUrls: [
        "https://nxgenfitness.com/portland-home",
        "https://nxgenfitness.com/scarborough-home",
      ],
      blockedUrls: [],
    };
  };

  const prepared = await orchestrator.prepareRun(landingInput);

  assert.equal(prepared.preparedCompanies.length, 1);
  assert.equal(primaryCrawler.requests[0]?.maxPages, 5);
  assert.equal(primaryCrawler.requests[0]?.maxDepth, 1);
  assert.equal(primaryCrawler.requests[0]?.source, "links");
});
