import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// These imports will fail until Phase 1 is implemented — that's the point (TDD red phase).
import {
  sellerKnowledgeSchema,
  caseStudySchema,
  pricingModelSchema,
  computeSellerContextCompletion,
  type SellerKnowledge,
  type CaseStudy,
  type PricingModel,
} from "./schemas";

/* ═══════════════════════════════════════════════
   Helper factories
   ═══════════════════════════════════════════════ */

function makeCompleteCaseStudy(overrides?: Partial<CaseStudy>): CaseStudy {
  return {
    id: randomUUID(),
    clientName: "Acme Corp",
    industry: "SaaS",
    challenge: "Low conversion rates on landing pages",
    solution: "Redesigned the entire funnel with A/B testing",
    results: "2.4x increase in demo requests within 3 months",
    metrics: [
      { label: "Demo requests", value: "+240%" },
      { label: "Time to conversion", value: "-35%" },
    ],
    testimonialQuote: "Best agency we ever worked with.",
    logoUrl: "https://acme.com/logo.png",
    ...overrides,
  };
}

function makeMinimalKnowledge(): SellerKnowledge {
  return {
    companyName: "TestCo",
    offerSummary: "We do great things",
    services: ["Service A"],
    differentiators: ["We are the best"],
    targetCustomer: "B2B SaaS founders",
    desiredOutcome: "Book a demo call",
    proofPoints: [],
    caseStudies: [],
    clientLogos: [],
    awards: [],
    commonObjections: [],
    constraints: [],
  };
}

function makeCompleteKnowledge(): SellerKnowledge {
  return {
    websiteUrl: "https://bestdecks.co",
    companyName: "BestDecks",
    logoUrl: "https://bestdecks.co/logo.svg",
    tagline: "AI-powered pitch decks that close deals",
    foundedYear: 2023,
    teamSize: "11-50",
    headquarters: "San Francisco, CA",
    offerSummary: "We generate personalized pitch decks using AI research on your prospects.",
    services: ["Deck generation", "Brand research", "Competitor analysis"],
    differentiators: ["Fully automated", "Uses real-time data", "10x faster than agencies"],
    targetCustomer: "B2B sales teams at SaaS companies, $1M-$50M ARR",
    desiredOutcome: "Prospects book a discovery call after receiving the deck",
    pricingModel: "subscription" as PricingModel,
    pricingContext: "Starting at $49/mo for 25 decks",
    proofPoints: [
      "50% average response rate",
      "100+ companies trust BestDecks",
      "Avg 2.4x lift in meeting bookings",
    ],
    caseStudies: [makeCompleteCaseStudy()],
    clientLogos: ["https://stripe.com/logo.png", "https://linear.app/logo.svg"],
    awards: ["ProductHunt #1 Product of the Day"],
    commonObjections: [
      {
        objection: "AI decks feel generic",
        response: "Each deck uses 15+ data points from real-time research on the prospect's business.",
      },
    ],
    competitorNotes: "Main competitors are Pitch.com and Beautiful.ai but they don't personalize per-prospect.",
    constraints: ["Don't mention pricing in decks", "Avoid competitor names in slides"],
    salesPlaybook: "Lead with the prospect's specific pain point. Always reference their actual website content.",
  };
}

/* ═══════════════════════════════════════════════
   sellerKnowledgeSchema validation
   ═══════════════════════════════════════════════ */

test("sellerKnowledgeSchema: valid complete knowledge passes", () => {
  const data = makeCompleteKnowledge();
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true, `Expected success but got errors: ${JSON.stringify(result.error?.issues)}`);
});

test("sellerKnowledgeSchema: valid minimal knowledge (only required fields) passes", () => {
  const data = makeMinimalKnowledge();
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true, `Expected success but got errors: ${JSON.stringify(result.error?.issues)}`);
});

test("sellerKnowledgeSchema: missing offerSummary fails", () => {
  const data = { ...makeMinimalKnowledge(), offerSummary: undefined };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: empty offerSummary fails", () => {
  const data = { ...makeMinimalKnowledge(), offerSummary: "" };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: missing services fails", () => {
  const data = { ...makeMinimalKnowledge(), services: undefined };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: empty services array fails", () => {
  const data = { ...makeMinimalKnowledge(), services: [] };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: missing differentiators fails", () => {
  const data = { ...makeMinimalKnowledge(), differentiators: undefined };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: missing targetCustomer fails", () => {
  const data = { ...makeMinimalKnowledge(), targetCustomer: undefined };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: missing desiredOutcome fails", () => {
  const data = { ...makeMinimalKnowledge(), desiredOutcome: undefined };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: requires at least websiteUrl or companyName", () => {
  const data = {
    ...makeMinimalKnowledge(),
    websiteUrl: undefined,
    companyName: undefined,
  };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: websiteUrl alone (no companyName) passes", () => {
  const data = {
    ...makeMinimalKnowledge(),
    companyName: undefined,
    websiteUrl: "https://example.com",
  };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true);
});

test("sellerKnowledgeSchema: companyName alone (no websiteUrl) passes", () => {
  const data = {
    ...makeMinimalKnowledge(),
    websiteUrl: undefined,
    companyName: "TestCo",
  };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true);
});

/* ═══════════════════════════════════════════════
   caseStudySchema validation
   ═══════════════════════════════════════════════ */

test("caseStudySchema: valid complete case study passes", () => {
  const result = caseStudySchema.safeParse(makeCompleteCaseStudy());
  assert.equal(result.success, true);
});

test("caseStudySchema: minimal case study (required fields only) passes", () => {
  const result = caseStudySchema.safeParse({
    id: randomUUID(),
    clientName: "Acme",
    industry: "SaaS",
    challenge: "Low conversion",
    solution: "Redesigned funnel",
    results: "2x improvement",
  });
  assert.equal(result.success, true);
});

test("caseStudySchema: missing clientName fails", () => {
  const cs = makeCompleteCaseStudy();
  const result = caseStudySchema.safeParse({ ...cs, clientName: undefined });
  assert.equal(result.success, false);
});

test("caseStudySchema: missing challenge fails", () => {
  const cs = makeCompleteCaseStudy();
  const result = caseStudySchema.safeParse({ ...cs, challenge: undefined });
  assert.equal(result.success, false);
});

test("caseStudySchema: missing results fails", () => {
  const cs = makeCompleteCaseStudy();
  const result = caseStudySchema.safeParse({ ...cs, results: undefined });
  assert.equal(result.success, false);
});

test("caseStudySchema: empty metrics array is valid (defaults)", () => {
  const cs = makeCompleteCaseStudy();
  const result = caseStudySchema.safeParse({ ...cs, metrics: [] });
  assert.equal(result.success, true);
});

test("caseStudySchema: metrics with label and value pass", () => {
  const cs = makeCompleteCaseStudy();
  const result = caseStudySchema.safeParse({
    ...cs,
    metrics: [{ label: "Revenue", value: "+45%" }],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.metrics[0].label, "Revenue");
  }
});

/* ═══════════════════════════════════════════════
   pricingModelSchema validation
   ═══════════════════════════════════════════════ */

test("pricingModelSchema: all valid values pass", () => {
  const values = ["subscription", "one_time", "retainer", "usage_based", "freemium", "custom"];
  for (const v of values) {
    const result = pricingModelSchema.safeParse(v);
    assert.equal(result.success, true, `Expected "${v}" to be valid`);
  }
});

test("pricingModelSchema: invalid value fails", () => {
  const result = pricingModelSchema.safeParse("hourly");
  assert.equal(result.success, false);
});

/* ═══════════════════════════════════════════════
   Seller-context completion evidence
   ═══════════════════════════════════════════════ */

test("computeSellerContextCompletion: complete knowledge reports every check", () => {
  const completion = computeSellerContextCompletion(makeCompleteKnowledge());

  assert.equal(completion.completed, completion.total);
  assert.equal(completion.percentage, 100);
  assert.equal(Object.values(completion.checks).every(Boolean), true);
});

test("computeSellerContextCompletion: required fields do not imply optional evidence", () => {
  const completion = computeSellerContextCompletion(makeMinimalKnowledge());

  assert.deepEqual(completion.checks, {
    hasOfferSummary: true,
    hasAtLeastTwoServices: false,
    hasAtLeastTwoDifferentiators: false,
    hasTargetCustomer: true,
    hasDesiredOutcome: true,
    hasAtLeastThreeProofPoints: false,
    hasCaseStudyWithChallengeAndResult: false,
    hasObjectionWithResponse: false,
    hasPricingModel: false,
    hasCompetitorNotes: false,
  });
  assert.equal(completion.completed, 3);
  assert.equal(completion.total, 10);
  assert.equal(completion.percentage, 30);
});

/* ═══════════════════════════════════════════════
   Edge cases
   ═══════════════════════════════════════════════ */

test("sellerKnowledgeSchema: empty arrays for optional array fields default correctly", () => {
  const data = makeMinimalKnowledge();
  const result = sellerKnowledgeSchema.parse(data);
  assert.deepEqual(result.proofPoints, []);
  assert.deepEqual(result.caseStudies, []);
  assert.deepEqual(result.clientLogos, []);
  assert.deepEqual(result.awards, []);
  assert.deepEqual(result.commonObjections, []);
  assert.deepEqual(result.constraints, []);
});

test("sellerKnowledgeSchema: whitespace-only offerSummary fails", () => {
  const data = { ...makeMinimalKnowledge(), offerSummary: "   " };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: whitespace-only services item fails", () => {
  const data = { ...makeMinimalKnowledge(), services: ["  "] };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: very long strings pass (no max length)", () => {
  const longStr = "A".repeat(10_000);
  const data = { ...makeMinimalKnowledge(), offerSummary: longStr };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true);
});

test("sellerKnowledgeSchema: special characters in strings pass", () => {
  const data = {
    ...makeMinimalKnowledge(),
    offerSummary: 'We build "amazing" things & more <html> \u00e9\u00e8\u00ea',
    services: ["CRO & A/B testing", "UX/UI design"],
  };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, true);
});

test("sellerKnowledgeSchema: invalid websiteUrl format fails", () => {
  const data = { ...makeMinimalKnowledge(), websiteUrl: "not-a-url" };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("sellerKnowledgeSchema: invalid clientLogos URL fails", () => {
  const data = { ...makeMinimalKnowledge(), clientLogos: ["not-a-url"] };
  const result = sellerKnowledgeSchema.safeParse(data);
  assert.equal(result.success, false);
});
