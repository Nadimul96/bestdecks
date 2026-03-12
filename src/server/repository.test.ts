import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "bestdecks-repo-"));
process.env.APP_SECRETS_KEY = "unit-test-secret";
process.env.LOCAL_DB_PATH = join(tempDir, "repository.sqlite");

const { getDb } = await import("./db");
const { getOnboarding, saveOnboarding } = await import("./repository");

const db = getDb();

beforeEach(() => {
  db.exec(`
    DELETE FROM integration_settings;
    DELETE FROM workspace_state;
  `);
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test("saveOnboarding persists workspace drafts and integration secret markers", () => {
  saveOnboarding({
    profile: {
      ownerName: "Nadimul Haque",
      ownerEmail: "nadimul96@gmail.com",
      companyName: "Bestdecks",
      websiteUrl: "https://bestdecks.co",
      timezone: "Asia/Makassar",
      defaultSignature: "Book a 20-minute call",
    },
    sellerContext: {
      websiteUrl: "https://bestdecks.co",
      companyName: "Bestdecks",
      offerSummary: "Research-backed decks",
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
    intakeDraft: {
      websitesText: "https://acme.com",
      contactsCsvText: "websiteUrl,firstName\nhttps://acme.com,Sarah",
    },
    integrations: [
      {
        provider: "cloudflare",
        config: { accountId: "cloudflare-account" },
        secret: "cloudflare-secret",
      },
      {
        provider: "presenton",
        config: { baseUrl: "http://localhost:5050" },
      },
    ],
  });

  const onboarding = getOnboarding();

  assert.equal(onboarding.profile.ownerEmail, "nadimul96@gmail.com");
  assert.equal(onboarding.intakeDraft.websitesText, "https://acme.com");
  assert.equal(
    onboarding.intakeDraft.contactsCsvText,
    "websiteUrl,firstName\nhttps://acme.com,Sarah",
  );
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "cloudflare")
      ?.hasSecret,
    true,
  );
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "presenton")
      ?.config?.baseUrl,
    "http://localhost:5050",
  );
});
