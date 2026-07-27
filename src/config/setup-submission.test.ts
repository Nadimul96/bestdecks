import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSetupOnboardingPayload,
  IncompleteSetupError,
  submitSetup,
  type SetupSubmissionInput,
} from "@/lib/setup-submission";

const completeInput: SetupSubmissionInput = {
  websiteUrl: "https://seller.example",
  companyName: "Seller",
  offerSummary: "A precise offer",
  servicesText: "Implementation\nAdvisory",
  differentiatorsText: "Operator-led",
  targetCustomer: "Revenue leaders",
  desiredOutcome: "A qualified conversation",
  intent: "cold_pitch",
  audience: "VP Sales",
  objective: "Evaluate the workflow",
  callToAction: "Review the evidence together",
  websitesText: "https://target.example\nhttps://target.example",
  contactsCsvText: "",
};

test("setup payloads preserve supplied facts and never invent missing ones", () => {
  const payload = buildSetupOnboardingPayload(completeInput);
  assert.deepEqual(payload.sellerContext.services, ["Implementation", "Advisory"]);
  assert.deepEqual(payload.sellerContext.differentiators, ["Operator-led"]);
  assert.equal(payload.questionnaire.audience, "VP Sales");
  assert.equal(payload.questionnaire.objective, "Evaluate the workflow");
  assert.equal(payload.questionnaire.callToAction, "Review the evidence together");

  assert.throws(
    () => buildSetupOnboardingPayload({
      ...completeInput,
      servicesText: "",
      audience: "",
    }),
    (error) => error instanceof IncompleteSetupError
      && error.missingFields.includes("services")
      && error.missingFields.includes("audience"),
  );
});

test("setup submission checks persistence before launching exactly one deduplicated target", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return url === "/api/onboarding"
      ? Response.json({ ok: true })
      : Response.json({ runId: "run-fixture" }, { status: 202 });
  };

  const result = await submitSetup(completeInput, {
    fetcher,
    idempotencyKey: "setup-test-key-0001",
  });
  assert.deepEqual(result, { targetCount: 1, runId: "run-fixture" });
  assert.deepEqual(calls.map(({ url }) => url), ["/api/onboarding", "/api/runs"]);
  assert.equal(
    new Headers(calls[1]?.init?.headers).get("Idempotency-Key"),
    "setup-test-key-0001",
  );
});

test("setup submission never launches after a failed save", async () => {
  let calls = 0;
  await assert.rejects(
    () => submitSetup(completeInput, {
      fetcher: async () => {
        calls += 1;
        return Response.json({ error: "Save rejected" }, { status: 400 });
      },
    }),
    /Save rejected/,
  );
  assert.equal(calls, 1);
});
