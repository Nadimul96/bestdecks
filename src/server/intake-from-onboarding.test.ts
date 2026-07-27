import assert from "node:assert/strict";
import test from "node:test";

import { intakeRunSchema } from "@/src/domain/schemas";
import { buildOnboardingRunConfiguration } from "@/src/server/intake-from-onboarding";

test("incomplete onboarding drafts abstain instead of inventing business facts", () => {
  const configuration = buildOnboardingRunConfiguration({}, {});

  assert.equal(configuration.sellerContext.companyName, undefined);
  assert.equal(configuration.sellerContext.offerSummary, "");
  assert.deepEqual(configuration.sellerContext.services, []);
  assert.deepEqual(configuration.sellerContext.differentiators, []);
  assert.equal(configuration.sellerContext.targetCustomer, "");
  assert.equal(configuration.sellerContext.desiredOutcome, "");
  assert.equal(configuration.questionnaire.audience, "");
  assert.equal(configuration.questionnaire.objective, "");
  assert.equal(configuration.questionnaire.callToAction, "");

  const parsed = intakeRunSchema.safeParse({
    ...configuration,
    targets: [{ websiteUrl: "https://example.com" }],
  });
  assert.equal(parsed.success, false);
});

test("complete onboarding facts pass through without semantic replacement", () => {
  const configuration = buildOnboardingRunConfiguration(
    {
      websiteUrl: "seller.example",
      companyName: "Seller",
      offerSummary: "A precise operator-supplied offer",
      services: ["Implementation"],
      differentiators: ["Operator-supplied proof"],
      targetCustomer: "Revenue leaders",
      desiredOutcome: "A qualified conversation",
    },
    {
      audience: "VP Sales",
      objective: "Evaluate a specific workflow",
      callToAction: "Review the evidence together",
    },
  );

  assert.equal(configuration.sellerContext.websiteUrl, "https://seller.example");
  assert.equal(configuration.sellerContext.offerSummary, "A precise operator-supplied offer");
  assert.equal(configuration.questionnaire.audience, "VP Sales");
  assert.equal(configuration.questionnaire.objective, "Evaluate a specific workflow");
  assert.equal(configuration.questionnaire.callToAction, "Review the evidence together");
});
