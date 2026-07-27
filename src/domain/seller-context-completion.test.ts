import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  SELLER_CONTEXT_COMPLETION_CHECK_KEYS,
  computeSellerContextCompletion,
  type CaseStudy,
  type SellerContextCompletionCheckKey,
  type SellerKnowledge,
} from "./schemas";

function makeBlankKnowledge(): SellerKnowledge {
  return {
    companyName: "Test Co",
    offerSummary: "",
    services: [],
    differentiators: [],
    targetCustomer: "",
    desiredOutcome: "",
    proofPoints: [],
    caseStudies: [],
    clientLogos: [],
    awards: [],
    commonObjections: [],
    constraints: [],
  };
}

function makeCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  return {
    id: randomUUID(),
    clientName: "Acme",
    industry: "SaaS",
    challenge: "The sales team lacked a repeatable proposal workflow.",
    solution: "Implemented a reviewable proposal pipeline.",
    results: "Reduced proposal turnaround from days to hours.",
    metrics: [],
    ...overrides,
  };
}

test("reports every named check as false when no planning input is present", () => {
  assert.deepEqual(computeSellerContextCompletion(makeBlankKnowledge()), {
    completed: 0,
    total: 10,
    percentage: 0,
    checks: {
      hasOfferSummary: false,
      hasAtLeastTwoServices: false,
      hasAtLeastTwoDifferentiators: false,
      hasTargetCustomer: false,
      hasDesiredOutcome: false,
      hasAtLeastThreeProofPoints: false,
      hasCaseStudyWithChallengeAndResult: false,
      hasObjectionWithResponse: false,
      hasPricingModel: false,
      hasCompetitorNotes: false,
    },
  });
});

test("each named check contributes exactly one completed check", () => {
  const cases: ReadonlyArray<{
    key: SellerContextCompletionCheckKey;
    complete: (knowledge: SellerKnowledge) => SellerKnowledge;
  }> = [
    {
      key: "hasOfferSummary",
      complete: (knowledge) => ({ ...knowledge, offerSummary: "We build proposal workflows." }),
    },
    {
      key: "hasAtLeastTwoServices",
      complete: (knowledge) => ({ ...knowledge, services: ["Research", "Deck creation"] }),
    },
    {
      key: "hasAtLeastTwoDifferentiators",
      complete: (knowledge) => ({ ...knowledge, differentiators: ["Auditable", "Resumable"] }),
    },
    {
      key: "hasTargetCustomer",
      complete: (knowledge) => ({ ...knowledge, targetCustomer: "B2B sales teams" }),
    },
    {
      key: "hasDesiredOutcome",
      complete: (knowledge) => ({ ...knowledge, desiredOutcome: "Book a discovery call" }),
    },
    {
      key: "hasAtLeastThreeProofPoints",
      complete: (knowledge) => ({ ...knowledge, proofPoints: ["A", "B", "C"] }),
    },
    {
      key: "hasCaseStudyWithChallengeAndResult",
      complete: (knowledge) => ({ ...knowledge, caseStudies: [makeCaseStudy()] }),
    },
    {
      key: "hasObjectionWithResponse",
      complete: (knowledge) => ({
        ...knowledge,
        commonObjections: [{ objection: "Too expensive", response: "Start with a scoped pilot." }],
      }),
    },
    {
      key: "hasPricingModel",
      complete: (knowledge) => ({ ...knowledge, pricingModel: "retainer" }),
    },
    {
      key: "hasCompetitorNotes",
      complete: (knowledge) => ({ ...knowledge, competitorNotes: "Alternatives require manual assembly." }),
    },
  ];

  assert.deepEqual(
    cases.map(({ key }) => key),
    SELLER_CONTEXT_COMPLETION_CHECK_KEYS,
    "The test table must cover every production check.",
  );

  for (const { key, complete } of cases) {
    const completion = computeSellerContextCompletion(complete(makeBlankKnowledge()));
    assert.equal(completion.checks[key], true, key);
    assert.equal(completion.completed, 1, key);
    assert.equal(completion.total, cases.length, key);
    assert.equal(completion.percentage, 10, key);
    assert.equal(
      Object.values(completion.checks).filter(Boolean).length,
      1,
      `${key} must not imply another check`,
    );
  }
});

test("derives count and percentage from the named booleans", () => {
  const completion = computeSellerContextCompletion({
    ...makeBlankKnowledge(),
    offerSummary: "We build proposal workflows.",
    targetCustomer: "B2B sales teams",
    desiredOutcome: "Book a discovery call",
  });

  assert.equal(completion.completed, 3);
  assert.equal(completion.total, SELLER_CONTEXT_COMPLETION_CHECK_KEYS.length);
  assert.equal(completion.percentage, 30);
  assert.equal(
    completion.completed,
    SELLER_CONTEXT_COMPLETION_CHECK_KEYS.filter((key) => completion.checks[key]).length,
  );
});

test("does not count threshold or whitespace-only boundary values", () => {
  const completion = computeSellerContextCompletion({
    ...makeBlankKnowledge(),
    offerSummary: "   ",
    services: ["Research", "   "],
    differentiators: ["Auditable"],
    proofPoints: ["A", "B"],
    caseStudies: [makeCaseStudy({ clientName: "   " })],
    commonObjections: [{ objection: "Too expensive", response: "   " }],
    competitorNotes: "  ",
  });

  assert.equal(completion.completed, 0);
  assert.equal(completion.percentage, 0);
  assert.equal(Object.values(completion.checks).some(Boolean), false);
});

test("reports full completion without increasing for excess entries", () => {
  const complete: SellerKnowledge = {
    ...makeBlankKnowledge(),
    offerSummary: "We build proposal workflows.",
    services: ["Research", "Deck creation", "Review"],
    differentiators: ["Auditable", "Resumable", "Idempotent"],
    targetCustomer: "B2B sales teams",
    desiredOutcome: "Book a discovery call",
    proofPoints: ["A", "B", "C", "D"],
    caseStudies: [makeCaseStudy(), makeCaseStudy()],
    commonObjections: [
      { objection: "Too expensive", response: "Start with a scoped pilot." },
      { objection: "Too slow", response: "Use the measured delivery timeline." },
    ],
    pricingModel: "retainer",
    competitorNotes: "Alternatives require manual assembly.",
  };

  const completion = computeSellerContextCompletion(complete);
  assert.equal(completion.completed, 10);
  assert.equal(completion.total, 10);
  assert.equal(completion.percentage, 100);
  assert.equal(Object.values(completion.checks).every(Boolean), true);
});
