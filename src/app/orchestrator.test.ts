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
    outputFormat: "presenton_editor",
    desiredCardCount: 8,
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "auto",
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

  public async crawlSite(input: { websiteUrl: string }) {
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
  const orchestrator = new ProposalOrchestrator({
    primaryCrawler: new TestCrawler(),
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
});
