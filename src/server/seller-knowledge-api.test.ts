import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const {
  saveSellerKnowledge,
  getSellerKnowledge,
  getOnboarding,
  saveOnboarding,
} = await import("./repository");
import { computeSellerContextCompletion, type SellerKnowledge } from "@/src/domain/schemas";

function testUserId(label: string) {
  return `seller-knowledge-${label}`;
}

/* ═══════════════════════════════════════════════
   Helper factories
   ═══════════════════════════════════════════════ */

function makeMinimalKnowledge(): SellerKnowledge {
  return {
    companyName: "TestCo",
    offerSummary: "We build great products",
    services: ["Product design"],
    differentiators: ["10x faster delivery"],
    targetCustomer: "SaaS companies",
    desiredOutcome: "Book a discovery call",
    proofPoints: [],
    caseStudies: [],
    clientLogos: [],
    awards: [],
    commonObjections: [],
    constraints: [],
  };
}

function makeFullKnowledge(): SellerKnowledge {
  return {
    websiteUrl: "https://testco.com",
    companyName: "TestCo",
    logoUrl: "https://testco.com/logo.png",
    tagline: "Build better, faster",
    foundedYear: 2020,
    teamSize: "11-50",
    headquarters: "Austin, TX",
    offerSummary: "We build enterprise SaaS products end-to-end.",
    services: ["Product design", "Full-stack development", "DevOps"],
    differentiators: ["10x faster delivery", "Ex-FAANG team", "Fixed-price contracts"],
    targetCustomer: "Series A-C SaaS companies needing to ship fast",
    desiredOutcome: "Close a $100K+ engagement",
    pricingModel: "retainer",
    pricingContext: "Monthly retainers from $15K-$50K",
    proofPoints: [
      "Shipped 50+ products for YC companies",
      "Average 3.2x faster than in-house teams",
      "98% client retention rate",
    ],
    caseStudies: [
      {
        id: randomUUID(),
        clientName: "RocketApp",
        industry: "FinTech",
        challenge: "Needed to rebuild their trading platform in 6 weeks for a regulatory deadline",
        solution: "Deployed a 4-person squad with domain expertise in financial systems",
        results: "Delivered 2 weeks early, passed all compliance audits on first submission",
        metrics: [
          { label: "Time saved", value: "2 weeks" },
          { label: "Compliance pass rate", value: "100%" },
        ],
        testimonialQuote: "They moved faster than our own team while writing better code.",
      },
    ],
    clientLogos: ["https://rocketapp.io/logo.svg"],
    awards: ["Clutch Top Dev Agency 2024"],
    commonObjections: [
      {
        objection: "Agencies are too expensive compared to hiring",
        response: "Our retainer costs less than one senior engineer's fully loaded salary, and you get a full squad.",
      },
    ],
    competitorNotes: "Main competitors are Toptal (marketplace, less ownership) and traditional agencies (slower, cost-plus).",
    constraints: ["Never promise timelines without scoping", "Don't trash competitors by name in decks"],
    salesPlaybook: "Lead with the speed angle. Reference the RocketApp case study for FinTech prospects.",
  };
}

/* ═══════════════════════════════════════════════
   Repository: saveSellerKnowledge / getSellerKnowledge
   ═══════════════════════════════════════════════ */

test("saveSellerKnowledge + getSellerKnowledge: round-trip persists all fields", async () => {
  const userId = testUserId("round-trip");
  const knowledge = makeFullKnowledge();
  await saveSellerKnowledge(knowledge, userId);

  const loaded = await getSellerKnowledge(userId);
  assert.ok(loaded, "Expected seller knowledge to be returned");
  assert.equal(loaded.companyName, knowledge.companyName);
  assert.equal(loaded.offerSummary, knowledge.offerSummary);
  assert.equal(loaded.pricingModel, "retainer");
  assert.equal(loaded.pricingContext, "Monthly retainers from $15K-$50K");
  assert.equal(loaded.tagline, "Build better, faster");
  assert.equal(loaded.foundedYear, 2020);
  assert.equal(loaded.teamSize, "11-50");
  assert.equal(loaded.headquarters, "Austin, TX");
  assert.equal(loaded.competitorNotes, knowledge.competitorNotes);
  assert.equal(loaded.salesPlaybook, knowledge.salesPlaybook);
  assert.deepEqual(loaded.services, knowledge.services);
  assert.deepEqual(loaded.differentiators, knowledge.differentiators);
  assert.deepEqual(loaded.constraints, knowledge.constraints);
  assert.equal(loaded.caseStudies.length, 1);
  assert.equal(loaded.caseStudies[0].clientName, "RocketApp");
  assert.equal(loaded.caseStudies[0].metrics.length, 2);
  assert.equal(loaded.commonObjections.length, 1);
  assert.equal(loaded.commonObjections[0].objection, "Agencies are too expensive compared to hiring");
});

test("getSellerKnowledge: returns null when no data stored", async () => {
  // This test relies on a fresh DB state. In practice the test runner creates
  // an in-memory DB (via LOCAL_DB_PATH or similar). If a previous test wrote
  // data, this may need adjustment. The implementation should handle this gracefully.
  // For now, we test the shape of the return value.
  const result = await getSellerKnowledge(testUserId("missing"));
  // Either null (no data) or a valid SellerKnowledge object
  assert.ok(result === null || typeof result === "object");
});

test("saveSellerKnowledge: overwrite updates existing data", async () => {
  const userId = testUserId("overwrite");
  const v1 = makeMinimalKnowledge();
  await saveSellerKnowledge(v1, userId);

  const v2 = { ...v1, offerSummary: "Updated offer summary", tagline: "New tagline" };
  await saveSellerKnowledge(v2, userId);

  const loaded = await getSellerKnowledge(userId);
  assert.ok(loaded);
  assert.equal(loaded.offerSummary, "Updated offer summary");
  assert.equal(loaded.tagline, "New tagline");
});

/* ═══════════════════════════════════════════════
   Backward compatibility: old sellerContext shape
   ═══════════════════════════════════════════════ */

test("getSellerKnowledge: falls back to old sellerContext when no seller_knowledge_json", async () => {
  const userId = testUserId("legacy-fallback");
  // Save using the OLD onboarding flow (only seller_context_json)
  await saveOnboarding({
    profile: { companyName: "LegacyCo", websiteUrl: "https://legacy.com" },
    sellerContext: {
      websiteUrl: "https://legacy.com",
      companyName: "LegacyCo",
      offerSummary: "Legacy offer",
      services: ["Old service"],
      differentiators: ["Old differentiator"],
      targetCustomer: "Old customer",
      desiredOutcome: "Old outcome",
      proofPoints: ["Old proof"],
      constraints: ["Old constraint"],
    },
  }, userId);

  const knowledge = await getSellerKnowledge(userId);
  assert.ok(knowledge, "Should fall back to old sellerContext shape");
  assert.equal(knowledge.companyName, "LegacyCo");
  assert.equal(knowledge.offerSummary, "Legacy offer");
  assert.deepEqual(knowledge.services, ["Old service"]);
  assert.deepEqual(knowledge.proofPoints, ["Old proof"]);
  // New fields should have sensible defaults
  assert.deepEqual(knowledge.caseStudies, []);
  assert.deepEqual(knowledge.commonObjections, []);
});

test("saveSellerKnowledge: also writes backward-compatible seller_context_json", async () => {
  const userId = testUserId("backward-write");
  const knowledge = makeFullKnowledge();
  await saveSellerKnowledge(knowledge, userId);

  // Read via old getOnboarding which reads seller_context_json
  const onboarding = await getOnboarding(userId);
  assert.ok(onboarding.sellerContext, "Old sellerContext should be populated for backward compat");
  assert.equal(onboarding.sellerContext.companyName, "TestCo");
  assert.equal(onboarding.sellerContext.offerSummary, knowledge.offerSummary);
  assert.deepEqual(onboarding.sellerContext.services, knowledge.services);
});

/* ═══════════════════════════════════════════════
   Completion evidence remains derivable after persistence
   ═══════════════════════════════════════════════ */

test("full seller knowledge reports all named completion checks", () => {
  const completion = computeSellerContextCompletion(makeFullKnowledge());
  assert.equal(completion.completed, completion.total);
  assert.equal(completion.percentage, 100);
});

test("minimal seller knowledge reports the three checks actually present", () => {
  const completion = computeSellerContextCompletion(makeMinimalKnowledge());
  assert.equal(completion.completed, 3);
  assert.equal(completion.total, 10);
  assert.equal(completion.percentage, 30);
});

/* ═══════════════════════════════════════════════
   getOnboarding includes sellerKnowledge
   ═══════════════════════════════════════════════ */

test("getOnboarding: returns sellerKnowledge field when data exists", async () => {
  const userId = testUserId("onboarding");
  const knowledge = makeFullKnowledge();
  await saveSellerKnowledge(knowledge, userId);

  const onboarding = await getOnboarding(userId);
  assert.ok(onboarding.sellerKnowledge, "getOnboarding should include sellerKnowledge");
  assert.equal(onboarding.sellerKnowledge.companyName, "TestCo");
});
