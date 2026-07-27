import test from "node:test";
import assert from "node:assert/strict";

import { buildRunPlan, summarizePlan, pipelineStageOrder } from "./pipeline";
import type { IntakeRun } from "./schemas";

const baseIntake: IntakeRun = {
  sellerContext: {
    websiteUrl: "https://bestdecks.co",
    companyName: "Bestdecks",
    offerSummary: "Research-backed decks.",
    services: ["Research"],
    differentiators: ["Evidence-first"],
    targetCustomer: "Founders",
    desiredOutcome: "Book meetings",
    proofPoints: [],
    constraints: [],
  },
  questionnaire: {
    archetype: "cold_outreach",
    audience: "Founder",
    objective: "Book a call",
    callToAction: "Book a call",
    outputFormat: "pptx",
    desiredCardCount: 8,
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "never",
    visualContentTypes: [],
    visualDensity: "minimal",
    mustInclude: [],
    mustAvoid: [],
    optionalReview: false,
    allowUserApprovedCrawlException: false,
  },
  targets: [
    { websiteUrl: "https://acme.com", companyName: "Acme" },
    { websiteUrl: "https://beta.com", companyName: "Beta" },
  ],
};

test("buildRunPlan creates a plan with one companyJob per target", () => {
  const plan = buildRunPlan(baseIntake);

  assert.equal(plan.companyJobs.length, 2);
  assert.equal(plan.companyJobs[0]?.websiteUrl, "https://acme.com");
  assert.equal(plan.companyJobs[0]?.companyName, "Acme");
  assert.equal(plan.companyJobs[1]?.websiteUrl, "https://beta.com");
});

test("buildRunPlan includes all pipeline stages for each target", () => {
  const plan = buildRunPlan(baseIntake);

  for (const job of plan.companyJobs) {
    assert.equal(job.stages.length, pipelineStageOrder.length);
    const stageNames = job.stages.map((s) => s.stage);
    assert.deepEqual(stageNames, [...pipelineStageOrder]);
  }
});

test("buildRunPlan all stages are marked required", () => {
  const plan = buildRunPlan(baseIntake);

  for (const job of plan.companyJobs) {
    for (const stage of job.stages) {
      assert.equal(stage.required, true, `Stage ${stage.stage} should be required`);
    }
  }
});

test("buildRunPlan preserves questionnaire and seller context", () => {
  const plan = buildRunPlan(baseIntake);

  assert.equal(plan.deliveryFormat, "pptx");
  assert.equal(plan.reviewGateEnabled, false);
  assert.equal(plan.questionnaire.archetype, "cold_outreach");
  assert.equal(plan.sellerContext.companyName, "Bestdecks");
});

test("buildRunPlan adapts seller_discovery reason when no website", () => {
  const noWebsite: IntakeRun = {
    ...baseIntake,
    sellerContext: {
      ...baseIntake.sellerContext,
      websiteUrl: undefined,
    },
  };

  const plan = buildRunPlan(noWebsite);
  const sellerStage = plan.companyJobs[0]?.stages.find((s) => s.stage === "seller_discovery");
  assert.ok(sellerStage);
  assert.match(sellerStage.reason, /missing/i);
});

test("buildRunPlan omits the unsupported image strategy stage", () => {
  const plan = buildRunPlan(baseIntake);
  assert.doesNotMatch(JSON.stringify(plan), /image_strategy/u);
});

test("buildRunPlan includes delivery format in delivery stage reason", () => {
  const plan = buildRunPlan(baseIntake);
  const deliveryStage = plan.companyJobs[0]?.stages.find((s) => s.stage === "delivery");
  assert.ok(deliveryStage);
  assert.match(deliveryStage.reason, /pptx/);
});

test("summarizePlan returns correct summary", () => {
  const plan = buildRunPlan(baseIntake);
  const summary = summarizePlan(plan);

  assert.equal(summary.deliveryFormat, "pptx");
  assert.equal(summary.companyCount, 2);
  assert.equal(summary.reviewGateEnabled, false);
  assert.equal(summary.sellerDiscoveryMode, "crawl");
});

test("summarizePlan reports typed_context_only when seller has no website", () => {
  const noWebsite: IntakeRun = {
    ...baseIntake,
    sellerContext: {
      ...baseIntake.sellerContext,
      websiteUrl: undefined,
    },
  };

  const plan = buildRunPlan(noWebsite);
  const summary = summarizePlan(plan);
  assert.equal(summary.sellerDiscoveryMode, "typed_context_only");
});
