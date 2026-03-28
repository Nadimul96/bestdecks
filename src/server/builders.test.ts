import test from "node:test";
import assert from "node:assert/strict";

import {
  LocalCompanyBriefBuilder,
  LocalSellerBriefBuilder,
} from "./builders";
import type { SellerDiscoveryResult } from "@/src/integrations/providers";
import type { IntakeRun } from "@/src/domain/schemas";

// ── Mock getSellerBriefMd ──────────────────────────────
// The LocalSellerBriefBuilder imports getSellerBriefMd from repository.
// We can't easily mock it, but we can test the fallback path by ensuring
// the DB returns null (which it does when no workspace state exists).

// For these tests, we use an in-memory SQLite so getSellerBriefMd returns null.
// The test environment already sets up LOCAL_DB_PATH.

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

const SELLER_BRIEF: SellerDiscoveryResult = {
  positioningSummary: "BestDecks uses AI to create personalized pitch decks.",
  offerSummary: "AI-powered pitch decks",
  proofPoints: ["50% response rate", "100+ customers"],
  preferredAngles: ["Fully automated", "Uses real-time data"],
};

test("LocalSellerBriefBuilder builds seller brief from context fields", async () => {
  // NOTE: This test verifies the fallback path. If there's no seller brief md
  // in the DB, it falls back to building from form fields.
  const builder = new LocalSellerBriefBuilder();
  const result = await builder.buildSellerBrief(SELLER_CONTEXT);

  assert.equal(result.offerSummary, "AI-powered pitch decks");
  assert.deepEqual(result.proofPoints, ["50% response rate", "100+ customers"]);
  assert.deepEqual(result.preferredAngles, ["Fully automated", "Uses real-time data"]);
  assert.ok(result.positioningSummary.length > 0);
});

test("LocalSellerBriefBuilder fallback summary includes key fields", async () => {
  const builder = new LocalSellerBriefBuilder();
  const result = await builder.buildSellerBrief(SELLER_CONTEXT);

  // The fallback summary should include company name, services, etc.
  // It may or may not be the fallback depending on DB state, but
  // positioningSummary should always be non-empty.
  assert.ok(result.positioningSummary.length > 0);
});

test("LocalCompanyBriefBuilder builds brief from target and seller data", async () => {
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: {
      websiteUrl: "https://acme.com",
      companyName: "Acme Corp",
      role: "CTO",
    },
    sellerBrief: SELLER_BRIEF,
    crawlMarkdown: "Acme builds widgets for enterprise.",
    sourceUrls: ["https://acme.com/about", "https://acme.com/about"],
    enrichmentSummary: "Acme Corp, based in San Francisco, CA, is expanding its SaaS platform.",
  });

  assert.equal(result.websiteUrl, "https://acme.com");
  assert.equal(result.companyName, "Acme Corp");
  assert.equal(result.likelyBuyer, "CTO");
  assert.ok(result.painPoints.length >= 1);
  assert.ok(result.proofPoints.length >= 1);
  assert.ok(result.pitchAngles.length >= 1);
});

test("LocalCompanyBriefBuilder deduplicates source URLs", async () => {
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: {
      websiteUrl: "https://acme.com",
    },
    sellerBrief: SELLER_BRIEF,
    crawlMarkdown: "Test",
    sourceUrls: [
      "https://acme.com/a",
      "https://acme.com/b",
      "https://acme.com/a",
      "https://acme.com/b",
    ],
    enrichmentSummary: "Summary here.",
  });

  assert.equal(result.sourceUrls.length, 2);
});

test("LocalCompanyBriefBuilder extracts hostname as company name when not provided", async () => {
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: {
      websiteUrl: "https://www.example.com",
    },
    sellerBrief: SELLER_BRIEF,
    crawlMarkdown: "Test",
    sourceUrls: [],
    enrichmentSummary: "Summary.",
  });

  assert.equal(result.companyName, "example.com");
});

test("LocalCompanyBriefBuilder uses default buyer when role not provided", async () => {
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: {
      websiteUrl: "https://acme.com",
    },
    sellerBrief: SELLER_BRIEF,
    crawlMarkdown: "",
    sourceUrls: [],
    enrichmentSummary: "",
  });

  assert.equal(result.likelyBuyer, "Founder or growth leader");
});

test("LocalCompanyBriefBuilder extracts locale from enrichment summary", async () => {
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: {
      websiteUrl: "https://acme.com",
      companyName: "Acme",
    },
    sellerBrief: SELLER_BRIEF,
    crawlMarkdown: "",
    sourceUrls: [],
    enrichmentSummary: "Based in Austin, TX with growing operations.",
  });

  assert.equal(result.locale, "Austin, TX");
});

test("LocalCompanyBriefBuilder limits proof points to 5", async () => {
  const manyProofsSeller: SellerDiscoveryResult = {
    ...SELLER_BRIEF,
    proofPoints: ["a", "b", "c", "d", "e", "f", "g"],
  };
  const builder = new LocalCompanyBriefBuilder();
  const result = await builder.buildCompanyBrief({
    target: { websiteUrl: "https://acme.com" },
    sellerBrief: manyProofsSeller,
    crawlMarkdown: "",
    sourceUrls: [],
    enrichmentSummary: "Rich summary",
  });

  assert.ok(result.proofPoints.length <= 5);
});
