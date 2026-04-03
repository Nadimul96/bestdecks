import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "bestdecks-shareable-"));
process.env.APP_SECRETS_KEY = "unit-test-secret";
process.env.LOCAL_DB_PATH = join(tempDir, "shareable.sqlite");
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");
const {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
  getPublicShareableDeck,
  getShareableLink,
  listDeliveryDecks,
  mapSlidePlanToExampleSlides,
} = await import("./repository");

const USER_A = "user-a";
const USER_B = "user-b";

async function seedDeck(options?: {
  runId?: string;
  targetId?: string;
  userId?: string;
  companyName?: string;
  includeSlidePlan?: boolean;
  visualStyle?: string;
}) {
  const db = await getDb();
  const runId = options?.runId ?? "run-1";
  const targetId = options?.targetId ?? "target-1";
  const userId = options?.userId ?? USER_A;
  const companyName = options?.companyName ?? "Acme";
  const includeSlidePlan = options?.includeSlidePlan ?? true;
  const visualStyle = options?.visualStyle ?? "premium_modern";
  const timestamp = "2026-04-03T10:00:00.000Z";

  await db.run(
    `INSERT INTO runs (
       id, status, seller_context_json, questionnaire_json, target_count, delivery_format,
       review_gate_enabled, user_id, credits_charged, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      "completed",
      JSON.stringify({
        companyName: "BestDecks",
        websiteUrl: "https://bestdecks.co",
        offerSummary: "AI sales decks",
        services: ["Deck generation"],
        differentiators: ["Speed"],
        targetCustomer: "B2B sales teams",
        desiredOutcome: "Book meetings",
        proofPoints: [],
        constraints: [],
      }),
      JSON.stringify({
        archetype: "cold_outreach",
        audience: "Sales leaders",
        objective: "Book a meeting",
        callToAction: "Book a meeting",
        outputFormat: "pptx",
        desiredCardCount: 4,
        tone: "consultative",
        visualStyle,
        imagePolicy: "auto",
        mustInclude: [],
        mustAvoid: [],
        visualContentTypes: [],
        visualDensity: "moderate",
        optionalReview: true,
        allowUserApprovedCrawlException: false,
      }),
      1,
      "pptx",
      1,
      userId,
      1,
      timestamp,
      timestamp,
    ],
  );

  await db.run(
    `INSERT INTO run_targets (
       id, run_id, website_url, company_name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      targetId,
      runId,
      "https://acme.com",
      companyName,
      "delivered",
      timestamp,
      timestamp,
    ],
  );

  await db.run(
    `INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `${targetId}-brief`,
      runId,
      targetId,
      "company_brief",
      JSON.stringify({
        companyName,
        websiteUrl: "https://acme.com",
        industry: "SaaS",
      }),
      timestamp,
    ],
  );

  if (includeSlidePlan) {
    await db.run(
      `INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${targetId}-plan`,
        runId,
        targetId,
        "slide_plan",
        JSON.stringify({
          title: `${companyName} can close bigger deals`,
          anchorMetric: "28% larger average deal size",
          slides: [
            {
              slideNumber: 1,
              purpose: "hook",
              headline: `${companyName} can win bigger deals`,
              bulletPoints: [],
              speakerNotes: "Prepared specifically for the revenue leadership team.",
              suggestImage: false,
            },
            {
              slideNumber: 2,
              purpose: "shift",
              headline: "28% of pipeline goes cold",
              bulletPoints: ["Manual deck work slows every rep"],
              speakerNotes: "The current workflow creates response lag.",
              suggestImage: false,
            },
            {
              slideNumber: 3,
              purpose: "solution",
              headline: "BestDecks removes the bottleneck",
              bulletPoints: ["Generate personalized decks in minutes"],
              speakerNotes: "The team keeps personalization without manual labor.",
              suggestImage: false,
            },
            {
              slideNumber: 4,
              purpose: "path_forward",
              headline: "Book the working session",
              bulletPoints: ["hello@bestdecks.co", "https://bestdecks.co"],
              speakerNotes: "We can build the first live deck this week.",
              suggestImage: false,
            },
          ],
        }),
        timestamp,
      ],
    );
  }

  await db.run(
    `INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `${targetId}-delivery`,
      runId,
      targetId,
      "presentation_delivery",
      JSON.stringify({
        provider: "alai",
        editorUrl: "https://app.getalai.com/view/demo",
        url: "https://app.getalai.com/view/demo",
        pptxExportUrl: "https://cdn.bestdecks.test/presentation.pptx",
        pdfExportUrl: "https://cdn.bestdecks.test/presentation.pdf",
        download_url: "https://cdn.bestdecks.test/presentation.pptx",
      }),
      timestamp,
    ],
  );

  return { runId, targetId, userId };
}

beforeEach(async () => {
  const db = await getDb();
  await db.run("DELETE FROM shareable_decks");
  await db.run("DELETE FROM run_artifacts");
  await db.run("DELETE FROM run_events");
  await db.run("DELETE FROM run_targets");
  await db.run("DELETE FROM runs");
  await db.run("DELETE FROM integration_settings");
  await db.run("DELETE FROM workspace_state");
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test("mapSlidePlanToExampleSlides supports planner and legacy slide-plan shapes", () => {
  const plannerSlides = mapSlidePlanToExampleSlides({
    anchorMetric: "31% lower churn",
    slides: [
      {
        slideNumber: 1,
        purpose: "hook",
        headline: "The deck starts with a claim",
        bulletPoints: [],
        speakerNotes: "A concise subtitle for the cover slide.",
      },
      {
        slideNumber: 2,
        purpose: "proof",
        headline: "31% lower churn in 90 days",
        bulletPoints: ["One metric is enough"],
        speakerNotes: "Proof lands best with a short note.",
      },
    ],
  });

  assert.equal(plannerSlides[0]?.type, "cover");
  assert.equal(plannerSlides[1]?.type, "proof");
  assert.equal(plannerSlides[1]?.stat, "31%");

  const legacySlides = mapSlidePlanToExampleSlides({
    slides: [
      {
        role: "cover",
        title: "Legacy cover slide",
        subtitle: "Still renders correctly.",
        bullets: [],
      },
      {
        role: "data",
        title: "Legacy data slide",
        subtitle: "Metric carried through.",
        bullets: ["One", "Two"],
        keyMetric: "$240K",
        keyMetricLabel: "annual leakage",
      },
    ],
  });

  assert.equal(legacySlides[0]?.type, "cover");
  assert.equal(legacySlides[1]?.type, "data");
  assert.equal(legacySlides[1]?.stat, "$240K");
  assert.equal(legacySlides[1]?.statLabel, "annual leakage");
});

test("createShareableLink reuses an active slug and issues a new one after deactivation", async () => {
  const { runId, targetId } = await seedDeck();

  const first = await createShareableLink(targetId, runId, USER_A);
  const second = await createShareableLink(targetId, runId, USER_A);

  assert.equal(first.slug, second.slug);

  await deactivateShareableLink(targetId, USER_A);

  const third = await createShareableLink(targetId, runId, USER_A);
  assert.notEqual(third.slug, first.slug);
});

test("createShareableLink refuses decks that do not have a slide plan", async () => {
  const { runId, targetId } = await seedDeck({
    runId: "run-no-plan",
    targetId: "target-no-plan",
    includeSlidePlan: false,
  });

  await assert.rejects(
    () => createShareableLink(targetId, runId, USER_A),
    /Deck is not ready to share/,
  );
});

test("getPublicShareableDeck returns viewer data and increments view count", async () => {
  const { runId, targetId } = await seedDeck();
  const { slug } = await createShareableLink(targetId, runId, USER_A);

  const payload = await getPublicShareableDeck(slug, { incrementViews: true });
  assert.ok(payload);
  assert.equal(payload?.target.companyName, "Acme");
  assert.equal(payload?.viewer.defaultThemeKey, "aurora-flux");
  assert.equal(payload?.viewer.slides[0]?.type, "cover");
  assert.equal(payload?.viewer.slides.at(-1)?.type, "contact");
  assert.equal("run" in payload!, false);
  assert.equal("artifacts" in payload!, false);

  const storedLink = await getShareableLink(slug);
  assert.equal(storedLink?.viewCount, 1);
});

test("getPublicShareableDeck returns null for inactive or expired links", async () => {
  const { runId, targetId } = await seedDeck();
  const { slug } = await createShareableLink(
    targetId,
    runId,
    USER_A,
    new Date(Date.now() - 60_000).toISOString(),
  );

  const expiredPayload = await getPublicShareableDeck(slug, { incrementViews: true });
  assert.equal(expiredPayload, null);

  await deactivateShareableLink(targetId, USER_A);
  const inactivePayload = await getPublicShareableDeck(slug, { incrementViews: true });
  assert.equal(inactivePayload, null);
});

test("owned deck lookups stay user-scoped and delivery cards expose share metadata", async () => {
  const firstDeck = await seedDeck();
  await seedDeck({
    runId: "run-2",
    targetId: "target-2",
    userId: USER_B,
    companyName: "Beta",
    visualStyle: "dark_minimal",
  });

  const ownedByA = await getOwnedDeliveryDeck(firstDeck.targetId, USER_A);
  const ownedByB = await getOwnedDeliveryDeck(firstDeck.targetId, USER_B);

  assert.equal(ownedByA?.companyName, "Acme");
  assert.equal(ownedByB, null);

  const { slug } = await createShareableLink(firstDeck.targetId, firstDeck.runId, USER_A);
  const cards = await listDeliveryDecks(USER_A) as Array<{
    targetId: string;
    shareSlug?: string;
    canShare?: boolean;
  }>;

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.targetId, firstDeck.targetId);
  assert.equal(cards[0]?.shareSlug, slug);
  assert.equal(cards[0]?.canShare, true);
});
