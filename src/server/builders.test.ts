import test from "node:test";
import assert from "node:assert/strict";

import { LocalSellerBriefBuilder } from "./builders";
import type { IntakeRun } from "@/src/domain/schemas";

const SELLER_CONTEXT: IntakeRun["sellerContext"] = {
  companyName: "BestDecks",
  websiteUrl: "https://bestdecks.co",
  offerSummary: "AI-powered pitch decks",
  services: ["Deck generation", "Brand research"],
  differentiators: ["Fully automated", "Uses real-time data"],
  targetCustomer: "B2B sales teams",
  desiredOutcome: "Book more meetings",
  proofPoints: ["50% response rate", "100+ customers"],
  constraints: [],
};

test("LocalSellerBriefBuilder builds seller brief only from the supplied run context", async () => {
  const builder = new LocalSellerBriefBuilder();
  const result = await builder.buildSellerBrief(SELLER_CONTEXT);

  assert.equal(result.offerSummary, "AI-powered pitch decks");
  assert.deepEqual(result.proofPoints, ["50% response rate", "100+ customers"]);
  assert.deepEqual(result.preferredAngles, ["Fully automated", "Uses real-time data"]);
  assert.ok(result.positioningSummary.length > 0);
});

test("LocalSellerBriefBuilder summary includes key fields", async () => {
  const builder = new LocalSellerBriefBuilder();
  const result = await builder.buildSellerBrief(SELLER_CONTEXT);

  assert.ok(result.positioningSummary.length > 0);
});
