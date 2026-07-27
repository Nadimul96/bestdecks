import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRunConfigurationReadiness } from "@/src/domain/run-configuration-readiness";

const completeSeller = {
  websiteUrl: "https://seller.example",
  offerSummary: "A precise offer",
  services: ["Implementation"],
  differentiators: ["Evidence-first"],
  targetCustomer: "Revenue leaders",
  desiredOutcome: "Qualified conversations",
};
const completeQuestionnaire = {
  archetype: "cold_outreach",
  audience: "VP Sales",
  objective: "Evaluate the workflow",
  callToAction: "Review the evidence",
  outputFormat: "pptx",
  desiredCardCount: 8,
  tone: "consultative",
  visualStyle: "auto",
  imagePolicy: "auto",
};

test("run configuration readiness uses the canonical admission schemas", () => {
  assert.deepEqual(
    evaluateRunConfigurationReadiness(completeSeller, completeQuestionnaire),
    {
      ready: true,
      sellerReady: true,
      questionnaireReady: true,
      missingSellerFields: [],
      missingQuestionnaireFields: [],
    },
  );

  const incomplete = evaluateRunConfigurationReadiness(
    { ...completeSeller, services: [] },
    { ...completeQuestionnaire, audience: "" },
  );
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.sellerReady, false);
  assert.equal(incomplete.questionnaireReady, false);
  assert.ok(incomplete.missingSellerFields.includes("services"));
  assert.ok(incomplete.missingQuestionnaireFields.includes("audience"));
});
