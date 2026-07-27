import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import { evaluateEvidence } from "@/src/domain/evidence";
import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";
import { hashExpectedSlideText } from "@/src/integrations/pptx-content-verifier";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");
const { hasVerifiedShareArtifacts, shareCheckpointKey } = await import(
  "./shareable-deck-contract"
);
const {
  evaluateShareLinkQuotaUsage,
  SHARE_LINK_QUOTAS,
  ShareLinkQuotaExceededError,
} = await import("./shareable-decks");
const {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
  getPublicShareableDeck,
  getShareableLink,
  listDeliveryDecks,
  mapSlidePlanToPublicSlides,
} = await import("./repository");

let fixtureSequence = 0;
let shareQuotaRowSequence = 0;

function nextFixtureId(label: string) {
  fixtureSequence += 1;
  return `${label}-${fixtureSequence}`;
}

const checkpointTiming = {
  startedAt: "2026-04-03T10:00:00.000Z",
  completedAt: "2026-04-03T10:00:01.000Z",
  durationMs: 1_000,
};

function richStaticVisualProfileFixture(slideCount: number) {
  const layoutIds = selectRichStaticLayoutIds(slideCount);
  return {
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds,
    measuredRichness: {
      slideCount,
      vectorShapeCount: slideCount * 2,
      styledTextRunCount: slideCount,
      slidesWithBackground: slideCount,
      slidesWithVectorAccents: slideCount,
      distinctLayoutSignatures: new Set(layoutIds).size,
      distinctPaletteColors: 3,
    },
  };
}

function canonicalPlanningCheckpoint(companyName = "Acme") {
  const plan = {
    title: `${companyName} can close bigger deals`,
    slides: [
      {
        slideNumber: 1,
        purpose: "hook",
        headline: `${companyName} can win bigger deals`,
        headlineClaimId: "claim:slide-01-headline",
        bulletPoints: [],
        bulletClaimIds: [],
        speakerNotes: "Prepared specifically for the revenue leadership team.",
        suggestImage: false,
      },
      {
        slideNumber: 2,
        purpose: "shift",
        headline: "28% of pipeline goes cold",
        headlineClaimId: "claim:slide-02-headline",
        bulletPoints: ["Manual deck work slows every rep"],
        bulletClaimIds: ["claim:slide-02-bullet-01"],
        speakerNotes: "The current workflow creates response lag.",
        suggestImage: false,
      },
      {
        slideNumber: 3,
        purpose: "solution",
        headline: "BestDecks removes the bottleneck",
        headlineClaimId: "claim:slide-03-headline",
        bulletPoints: ["Generate personalized decks in minutes"],
        bulletClaimIds: ["claim:slide-03-bullet-01"],
        speakerNotes: "The team keeps personalization without manual labor.",
        suggestImage: false,
      },
      {
        slideNumber: 4,
        purpose: "path_forward",
        headline: "Book the working session",
        headlineClaimId: "claim:slide-04-headline",
        bulletPoints: ["hello@bestdecks.co", "https://bestdecks.co"],
        bulletClaimIds: ["claim:slide-04-bullet-01", "claim:slide-04-bullet-02"],
        speakerNotes: "We can build the first live deck this week.",
        suggestImage: false,
      },
    ],
    evidence: {
      sources: [],
      claims: [
        ["claim:slide-01-headline", `${companyName} can win bigger deals`],
        ["claim:slide-02-headline", "28% of pipeline goes cold"],
        ["claim:slide-02-bullet-01", "Manual deck work slows every rep"],
        ["claim:slide-03-headline", "BestDecks removes the bottleneck"],
        ["claim:slide-03-bullet-01", "Generate personalized decks in minutes"],
        ["claim:slide-04-headline", "Book the working session"],
        ["claim:slide-04-bullet-01", "hello@bestdecks.co"],
        ["claim:slide-04-bullet-02", "https://bestdecks.co"],
      ].map(([id, text]) => ({
        id,
        text,
        claimClass: "seller_claim" as const,
        supportStatus: "seller_supplied" as const,
        citedSourceIds: [],
      })),
    },
  };

  return {
    outcome: "ready" as const,
    plan,
    evidenceEvaluation: evaluateEvidence(plan.evidence),
    readiness: {
      requiredSlideFieldsPresent: true,
      ctaPresent: true,
      evidenceGatePassed: true,
      artifactReadable: false,
      providerProvenancePresent: true,
      visualProfileVerified: false,
    },
    timing: checkpointTiming,
  };
}

function canonicalRenderingCheckpoint(companyName = "Acme") {
  const exportUrl = "https://renderer.example.test/exports/presentation.pptx?signature=fixture";
  const expectedSlides = canonicalPlanningCheckpoint(companyName).plan.slides.map(
    ({ headline, bulletPoints }) => ({ headline, bulletPoints }),
  );
  return {
    outcome: "delivered" as const,
    result: {
      presentationId: "presentation-fixture",
      editorUrl: "https://renderer.example.test/view/presentation-fixture",
      exportUrl,
    },
    verification: {
      url: exportUrl,
      sha256: "a".repeat(64),
      byteLength: 4_096,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      verifiedAt: "2026-04-03T10:00:01.000Z",
      contentVerification: {
        method: "pptx_ooxml_rich_static_v2" as const,
        sha256: hashExpectedSlideText(expectedSlides),
        slideCount: expectedSlides.length,
      },
      visualProfile: richStaticVisualProfileFixture(expectedSlides.length),
    },
    readiness: {
      requiredSlideFieldsPresent: true,
      ctaPresent: true,
      evidenceGatePassed: true,
      artifactReadable: true,
      providerProvenancePresent: true,
      visualProfileVerified: true,
    },
    timing: checkpointTiming,
  };
}

async function seedDeck(options?: {
  runId?: string;
  targetId?: string;
  userId?: string;
  companyName?: string;
  includeSlidePlan?: boolean;
  includePresentationDelivery?: boolean;
  includePlanningCheckpoint?: boolean;
  includeRenderingCheckpoint?: boolean;
  planningArtifact?: unknown;
  deliveryArtifact?: unknown;
  visualStyle?: string;
  websiteUrl?: string;
  targetStatus?: string;
  runStatus?: string;
}) {
  const db = await getDb();
  const fixtureId = nextFixtureId("shareable-deck");
  const runId = options?.runId ?? `${fixtureId}-run`;
  const targetId = options?.targetId ?? `${fixtureId}-target`;
  const userId = options?.userId ?? `${fixtureId}-user`;
  const companyName = options?.companyName ?? "Acme";
  const includeSlidePlan = options?.includeSlidePlan ?? true;
  const includePresentationDelivery = options?.includePresentationDelivery ?? true;
  const includePlanningCheckpoint = options?.includePlanningCheckpoint ?? true;
  const includeRenderingCheckpoint = options?.includeRenderingCheckpoint ?? true;
  const visualStyle = options?.visualStyle ?? "premium_modern";
  const websiteUrl = options?.websiteUrl ?? "https://acme.com";
  const targetStatus = options?.targetStatus ?? "delivered";
  const runStatus = options?.runStatus ?? "delivered";
  const timestamp = "2026-04-03T10:00:00.000Z";
  const planningArtifact = options?.planningArtifact ?? canonicalPlanningCheckpoint(companyName);
  const deliveryArtifact = options?.deliveryArtifact ?? canonicalRenderingCheckpoint(companyName);

  await db.run(
    `INSERT INTO runs (
       id, status, seller_context_json, questionnaire_json, target_count, delivery_format,
       review_gate_enabled, user_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      runStatus,
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
        imagePolicy: "never",
        mustInclude: [],
        mustAvoid: [],
        visualContentTypes: [],
        visualDensity: "minimal",
        optionalReview: false,
        allowUserApprovedCrawlException: false,
      }),
      1,
      "pptx",
      1,
      userId,
      timestamp,
      timestamp,
    ],
  );

  await db.run(
    `INSERT INTO run_targets (
       id, run_id, target_ordinal, website_url, company_name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      targetId,
      runId,
      0,
      websiteUrl,
      companyName,
      targetStatus,
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
        websiteUrl,
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
        JSON.stringify(planningArtifact),
        timestamp,
      ],
    );
  }

  if (includePresentationDelivery) {
    await db.run(
      `INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${targetId}-delivery`,
        runId,
        targetId,
        "presentation_delivery",
        JSON.stringify(deliveryArtifact),
        timestamp,
      ],
    );
  }

  const attemptId = `${runId}-attempt-1`;
  await db.run(
    `INSERT INTO run_jobs (
       run_id, state, attempt_count, max_attempts, current_attempt_id, next_attempt_at,
       state_changed_at, state_changed_by_attempt_id, terminal_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      "delivered",
      1,
      5,
      attemptId,
      timestamp,
      timestamp,
      attemptId,
      timestamp,
      timestamp,
      timestamp,
    ],
  );
  await db.run(
    `INSERT INTO run_attempts (
       id, run_id, attempt_number, lease_owner, status, started_at, heartbeat_at,
       lease_expires_at, finished_at, final_state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attemptId,
      runId,
      1,
      "share-test-worker",
      "completed",
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      "delivered",
    ],
  );

  if (includePlanningCheckpoint) {
    await db.run(
      `INSERT INTO run_checkpoints (
         id, run_id, checkpoint_key, stage, attempt_id, metadata_json, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${targetId}-planning-checkpoint`,
        runId,
        shareCheckpointKey(targetId, "planning"),
        "planning",
        attemptId,
        JSON.stringify(planningArtifact),
        timestamp,
      ],
    );
  }

  if (includeRenderingCheckpoint) {
    await db.run(
      `INSERT INTO run_checkpoints (
         id, run_id, checkpoint_key, stage, attempt_id, metadata_json, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${targetId}-rendering-checkpoint`,
        runId,
        shareCheckpointKey(targetId, "rendering"),
        "rendering",
        attemptId,
        JSON.stringify(deliveryArtifact),
        timestamp,
      ],
    );
  }

  return { runId, targetId, userId, planningArtifact, deliveryArtifact };
}

async function seedShareRows(input: {
  count: number;
  runId: string;
  targetId: string;
  userId: string;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
}) {
  assert.ok(input.count > 0);
  const db = await getDb();
  const firstSequence = shareQuotaRowSequence;
  shareQuotaRowSequence += input.count;
  const rowPrefix = nextFixtureId("share-quota-row");

  await db.run(
    `WITH RECURSIVE quota_rows(sequence) AS (
       SELECT 1
       UNION ALL
       SELECT sequence + 1
       FROM quota_rows
       WHERE sequence < ?
     )
     INSERT INTO shareable_decks (
       id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
     )
     SELECT
       ? || '-' || sequence,
       printf('q%023d', ? + sequence),
       ?,
       ?,
       ?,
       ?,
       ?,
       0,
       ?
     FROM quota_rows`,
    [
      input.count,
      rowPrefix,
      firstSequence,
      input.runId,
      input.targetId,
      input.userId,
      input.isActive ? 1 : 0,
      input.expiresAt,
      input.createdAt,
    ],
  );
}

test("public slide projection accepts only a canonical planning checkpoint", () => {
  const planning = canonicalPlanningCheckpoint();
  const plannerSlides = mapSlidePlanToPublicSlides(planning);

  assert.deepEqual(plannerSlides, [
    {
      type: "cover",
      title: "Acme can win bigger deals",
      bullets: [],
    },
    {
      type: "content",
      title: "28% of pipeline goes cold",
      bullets: ["Manual deck work slows every rep"],
    },
    {
      type: "content",
      title: "BestDecks removes the bottleneck",
      bullets: ["Generate personalized decks in minutes"],
    },
    {
      type: "closing",
      title: "Book the working session",
      bullets: ["hello@bestdecks.co", "https://bestdecks.co"],
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(plannerSlides),
    /speakerNotes|anchorMetric|evidenceEvaluation|readiness|verification|visual|statLabel/i,
  );

  assert.deepEqual(mapSlidePlanToPublicSlides(planning.plan), []);
  assert.deepEqual(mapSlidePlanToPublicSlides({
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
  }), []);
});

test("verified share contract rejects contradictory and unverified checkpoints", () => {
  const planning = canonicalPlanningCheckpoint();
  const delivery = canonicalRenderingCheckpoint();
  assert.equal(hasVerifiedShareArtifacts(planning, delivery), true);

  const maximumDelivery = structuredClone(delivery);
  maximumDelivery.verification.byteLength = MAX_DELIVERY_ARTIFACT_BYTES;
  assert.equal(hasVerifiedShareArtifacts(planning, maximumDelivery), true);

  const oversizedDelivery = structuredClone(delivery);
  oversizedDelivery.verification.byteLength = MAX_DELIVERY_ARTIFACT_BYTES + 1;
  assert.equal(hasVerifiedShareArtifacts(planning, oversizedDelivery), false);

  const contradictoryPlanning = structuredClone(planning);
  contradictoryPlanning.evidenceEvaluation.coverage.factualClaims = 1;

  const unreadableDelivery = structuredClone(delivery);
  unreadableDelivery.readiness.artifactReadable = false;

  const mismatchedDelivery = structuredClone(delivery);
  mismatchedDelivery.verification.url = "https://renderer.example.test/exports/other.pptx";

  const prematurelyVerifiedPlanning = structuredClone(planning);
  prematurelyVerifiedPlanning.readiness.visualProfileVerified = true;

  const mismatchedVisualProfile = structuredClone(delivery);
  mismatchedVisualProfile.verification.visualProfile = richStaticVisualProfileFixture(1);

  for (const [label, rawPlanning, rawDelivery] of [
    ["raw plan", planning.plan, delivery],
    ["raw delivery", planning, delivery.result],
    ["contradictory evidence", contradictoryPlanning, delivery],
    ["premature planning visual verification", prematurelyVerifiedPlanning, delivery],
    ["unreadable delivery", planning, unreadableDelivery],
    ["mismatched verification", planning, mismatchedDelivery],
    ["mismatched visual profile", planning, mismatchedVisualProfile],
  ] as const) {
    assert.equal(
      hasVerifiedShareArtifacts(rawPlanning, rawDelivery),
      false,
      label,
    );
  }

  for (const readinessKey of Object.keys(delivery.readiness) as Array<
    keyof typeof delivery.readiness
  >) {
    const failedReadiness = structuredClone(delivery);
    failedReadiness.readiness[readinessKey] = false;
    assert.equal(
      hasVerifiedShareArtifacts(planning, failedReadiness),
      false,
      `delivery readiness: ${readinessKey}`,
    );
  }

  for (const readinessKey of [
    "requiredSlideFieldsPresent",
    "ctaPresent",
    "evidenceGatePassed",
    "providerProvenancePresent",
  ] as const) {
    const failedPlanning = structuredClone(planning);
    failedPlanning.readiness[readinessKey] = false;
    assert.equal(
      hasVerifiedShareArtifacts(failedPlanning, delivery),
      false,
      `planning readiness: ${readinessKey}`,
    );
  }
});

test("public share surfaces are isolated, non-indexable, and read-only", () => {
  const viewerSource = readFileSync(
    new URL("../../components/shareable-deck-viewer.tsx", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../../app/share/[slug]/page.tsx", import.meta.url),
    "utf8",
  );
  const apiSource = readFileSync(
    new URL("../../app/api/share/[slug]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(viewerSource, /PublicShareSlideCanvas/);
  assert.match(viewerSource, /open-source proposal deck tooling/);
  assert.doesNotMatch(viewerSource, /archetype-preview-modal|SlidePreview|VisualElement/);
  assert.doesNotMatch(viewerSource, /watermark\.toLowerCase|hello@/);
  assert.match(pageSource, /index:\s*false/);
  assert.match(pageSource, /noarchive:\s*true/);
  assert.match(apiSource, /X-Robots-Tag/);
  assert.match(apiSource, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(`${pageSource}\n${apiSource}`, /incrementViews/);

  for (const sampleOnlyClaim of [
    "Monthly ARR Growth",
    "Internal CRM data",
    "ClearPath gave us",
    "Book an Investor Call",
    "Book a Free Ops Audit",
    "decks that close deals",
  ]) {
    assert.equal(viewerSource.includes(sampleOnlyClaim), false, sampleOnlyClaim);
  }
});

test("public share API applies robot and cache denial headers to misses", async () => {
  const { GET } = await import("../../app/api/share/[slug]/route");
  const response = await GET(
    new Request("https://bestdecks.test/api/share/not-a-valid-slug"),
    { params: Promise.resolve({ slug: "not-a-valid-slug" }) },
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noarchive/);
});

test("share mutation API maps quota failures to a private retryable response", () => {
  const apiSource = readFileSync(
    new URL("../../app/api/delivery/[deckId]/share/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(apiSource, /error instanceof ShareLinkQuotaExceededError/);
  assert.match(apiSource, /status:\s*429/);
  assert.match(apiSource, /"Retry-After": String\(error\.retryAfterSeconds\)/);
  assert.match(apiSource, /"Cache-Control": "private, no-store"/);
  assert.match(apiSource, /code: error\.code/);
  assert.match(apiSource, /const body = await readBoundedJson\(request\);/);
  assert.match(apiSource, /Request body must be valid JSON/);
  assert.doesNotMatch(apiSource, /readBoundedJson\(request\)\.catch/);
});

test("share quota policy fails closed at each persisted boundary", () => {
  assert.equal(evaluateShareLinkQuotaUsage({
    createdInWindow: SHARE_LINK_QUOTAS.creationsPerWindow - 1,
    activeLinks: SHARE_LINK_QUOTAS.activeLinks - 1,
    totalLinks: SHARE_LINK_QUOTAS.totalLinks - 1,
  }), null);

  assert.equal(evaluateShareLinkQuotaUsage({
    createdInWindow: SHARE_LINK_QUOTAS.creationsPerWindow,
    activeLinks: 0,
    totalLinks: SHARE_LINK_QUOTAS.creationsPerWindow,
  }), "creation_window");
  assert.equal(evaluateShareLinkQuotaUsage({
    createdInWindow: 0,
    activeLinks: SHARE_LINK_QUOTAS.activeLinks,
    totalLinks: SHARE_LINK_QUOTAS.activeLinks,
  }), "active");
  assert.equal(evaluateShareLinkQuotaUsage({
    createdInWindow: 0,
    activeLinks: 0,
    totalLinks: SHARE_LINK_QUOTAS.totalLinks,
  }), "total");

  assert.throws(
    () => evaluateShareLinkQuotaUsage({
      createdInWindow: Number.NaN,
      activeLinks: 0,
      totalLinks: 0,
    }),
    /Invalid share link quota usage/,
  );
});

test("createShareableLink reuses an active slug and issues a new one after deactivation", async () => {
  const { runId, targetId, userId } = await seedDeck();

  const first = await createShareableLink(targetId, runId, userId);
  const second = await createShareableLink(targetId, runId, userId);

  assert.equal(first.slug, second.slug);
  assert.match(first.slug, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(Buffer.from(first.slug, "base64url").byteLength, 18);

  await deactivateShareableLink(targetId, userId);

  const third = await createShareableLink(targetId, runId, userId);
  assert.notEqual(third.slug, first.slug);

  const db = await getDb();
  const retained = await db.execute(
    "SELECT COUNT(*) AS count FROM shareable_decks WHERE created_by = ?",
    [userId],
  ) as { count: number } | undefined;
  assert.equal(Number(retained?.count), 2, "deactivation retains link history");
});

test("reused share links honor shorter requested expiry without lengthening", async () => {
  const { runId, targetId, userId } = await seedDeck();
  const nowMs = Date.now();
  const longExpiry = new Date(nowMs + 30 * 24 * 60 * 60 * 1_000).toISOString();
  const shortExpiry = new Date(nowMs + 24 * 60 * 60 * 1_000).toISOString();
  const first = await createShareableLink(targetId, runId, userId, longExpiry);
  const shortened = await createShareableLink(targetId, runId, userId, shortExpiry);
  assert.equal(shortened.slug, first.slug);

  const db = await getDb();
  const row = await db.execute(
    "SELECT expires_at FROM shareable_decks WHERE slug = ?",
    [first.slug],
  ) as unknown as { expires_at: string };
  assert.equal(row.expires_at, shortExpiry);

  await createShareableLink(
    targetId,
    runId,
    userId,
    new Date(nowMs + 60 * 24 * 60 * 60 * 1_000).toISOString(),
  );
  const unchanged = await db.execute(
    "SELECT expires_at FROM shareable_decks WHERE slug = ?",
    [first.slug],
  ) as unknown as { expires_at: string };
  assert.equal(unchanged.expires_at, shortExpiry);
});

test("concurrent share creation serializes reuse and persists one active row", async () => {
  const { runId, targetId, userId } = await seedDeck();

  const results = await Promise.all(
    Array.from({ length: 24 }, () => createShareableLink(targetId, runId, userId)),
  );
  const slugs = new Set(results.map(({ slug }) => slug));
  assert.equal(slugs.size, 1);

  const db = await getDb();
  const persisted = await db.execute(
    `SELECT COUNT(*) AS count
     FROM shareable_decks
     WHERE target_id = ?
       AND run_id = ?
       AND created_by = ?
       AND is_active = 1`,
    [targetId, runId, userId],
  ) as { count: number } | undefined;
  assert.equal(Number(persisted?.count), 1);
});

test("rolling creation quota counts retained rows and preserves idempotent reuse", async () => {
  const blocked = await seedDeck();
  const recentTimestamp = new Date().toISOString();
  await seedShareRows({
    count: SHARE_LINK_QUOTAS.creationsPerWindow,
    ...blocked,
    isActive: false,
    expiresAt: "2000-01-01T00:00:00.000Z",
    createdAt: recentTimestamp,
  });

  await assert.rejects(
    () => createShareableLink(blocked.targetId, blocked.runId, blocked.userId),
    (error: unknown) => {
      assert.ok(error instanceof ShareLinkQuotaExceededError);
      assert.equal(error.quota, "creation_window");
      assert.equal(error.code, "share_link_creation_rate_limit");
      assert.ok(error.retryAfterSeconds >= 1);
      assert.ok(error.retryAfterSeconds <= SHARE_LINK_QUOTAS.windowSeconds);
      return true;
    },
  );

  const reusable = await seedDeck();
  const first = await createShareableLink(
    reusable.targetId,
    reusable.runId,
    reusable.userId,
  );
  await seedShareRows({
    count: SHARE_LINK_QUOTAS.creationsPerWindow,
    ...reusable,
    isActive: false,
    expiresAt: "2000-01-01T00:00:00.000Z",
    createdAt: recentTimestamp,
  });
  assert.equal(
    (await createShareableLink(reusable.targetId, reusable.runId, reusable.userId)).slug,
    first.slug,
  );
});

test("active and lifetime share quotas bound retained per-user rows", async () => {
  const activeLimited = await seedDeck();
  const activeCapacityDeck = await seedDeck({ userId: activeLimited.userId });
  await seedShareRows({
    count: SHARE_LINK_QUOTAS.activeLinks,
    ...activeCapacityDeck,
    isActive: true,
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2000-01-01T00:00:00.000Z",
  });
  await assert.rejects(
    () => createShareableLink(
      activeLimited.targetId,
      activeLimited.runId,
      activeLimited.userId,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ShareLinkQuotaExceededError);
      assert.equal(error.quota, "active");
      assert.equal(error.code, "share_link_active_limit");
      return true;
    },
  );

  const totalLimited = await seedDeck();
  await seedShareRows({
    count: SHARE_LINK_QUOTAS.totalLinks,
    ...totalLimited,
    isActive: false,
    expiresAt: "2000-01-01T00:00:00.000Z",
    createdAt: "2000-01-01T00:00:00.000Z",
  });
  await assert.rejects(
    () => createShareableLink(
      totalLimited.targetId,
      totalLimited.runId,
      totalLimited.userId,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ShareLinkQuotaExceededError);
      assert.equal(error.quota, "total");
      assert.equal(error.code, "share_link_total_limit");
      assert.equal(error.retryAfterSeconds, SHARE_LINK_QUOTAS.windowSeconds);
      return true;
    },
  );

  const db = await getDb();
  const retainedTotal = await db.execute(
    "SELECT COUNT(*) AS count FROM shareable_decks WHERE created_by = ?",
    [totalLimited.userId],
  ) as { count: number } | undefined;
  assert.equal(Number(retainedTotal?.count), SHARE_LINK_QUOTAS.totalLinks);
});

test("createShareableLink refuses incomplete and legacy checkpoint pairs", async () => {
  const missingPlan = await seedDeck({ includePlanningCheckpoint: false });

  await assert.rejects(
    () => createShareableLink(missingPlan.targetId, missingPlan.runId, missingPlan.userId),
    /Deck is not ready to share/,
  );

  const missingDelivery = await seedDeck({ includeRenderingCheckpoint: false });
  await assert.rejects(
    () => createShareableLink(
      missingDelivery.targetId,
      missingDelivery.runId,
      missingDelivery.userId,
    ),
    /Deck is not ready to share/,
  );

  const legacyPlan = canonicalPlanningCheckpoint().plan;
  const legacy = await seedDeck({ planningArtifact: legacyPlan });
  await assert.rejects(
    () => createShareableLink(legacy.targetId, legacy.runId, legacy.userId),
    /Deck is not ready to share/,
  );

  const wrongStage = await seedDeck();
  const db = await getDb();
  await db.run(
    "UPDATE run_checkpoints SET stage = 'rendering' WHERE run_id = ? AND checkpoint_key = ?",
    [wrongStage.runId, shareCheckpointKey(wrongStage.targetId, "planning")],
  );
  await assert.rejects(
    () => createShareableLink(wrongStage.targetId, wrongStage.runId, wrongStage.userId),
    /Deck is not ready to share/,
  );

  const malformed = await seedDeck();
  await db.run(
    "UPDATE run_checkpoints SET metadata_json = ? WHERE run_id = ? AND checkpoint_key = ?",
    ["{malformed", malformed.runId, shareCheckpointKey(malformed.targetId, "planning")],
  );
  await assert.rejects(
    () => createShareableLink(malformed.targetId, malformed.runId, malformed.userId),
    /Deck is not ready to share/,
  );
});

test("share creation, listing, and public reads require delivered target state", async () => {
  const { runId, targetId, userId } = await seedDeck();
  const { slug } = await createShareableLink(targetId, runId, userId);
  const db = await getDb();
  await db.run(
    "UPDATE run_targets SET status = 'rendering' WHERE id = ?",
    [targetId],
  );

  await assert.rejects(
    () => createShareableLink(targetId, runId, userId),
    /Deck is not ready to share/,
  );
  assert.equal(await getPublicShareableDeck(slug), null);

  const cards = await listDeliveryDecks(userId) as Array<{
    canShare?: boolean;
    shareSlug?: string;
  }>;
  assert.equal(cards[0]?.canShare, false);
  assert.equal(cards[0]?.shareSlug, undefined);
});

test("cancelled runs revoke delivery eligibility even with delivered checkpoints", async () => {
  const { runId, targetId, userId } = await seedDeck();
  const { slug } = await createShareableLink(targetId, runId, userId);
  const db = await getDb();
  // Simulate the narrow race directly: the target and its committed delivery
  // already exist, then the run-level cancellation wins.
  await db.run("UPDATE runs SET status = 'cancelled' WHERE id = ?", [runId]);

  await assert.rejects(
    () => createShareableLink(targetId, runId, userId),
    /Deck is not ready to share/,
  );
  assert.equal(await getPublicShareableDeck(slug), null);
  assert.deepEqual(await listDeliveryDecks(userId), []);
});

test("getPublicShareableDeck returns safe viewer data without anonymous writes", async () => {
  const { runId, targetId, userId } = await seedDeck({
    websiteUrl: "https://acme.test/private/crawl/path?token=do-not-publish&campaign=launch",
  });
  const { slug } = await createShareableLink(targetId, runId, userId);

  const payload = await getPublicShareableDeck(slug);
  assert.ok(payload);
  assert.equal(payload?.target.companyName, "Acme");
  assert.equal(payload?.target.websiteUrl, "https://acme.test");
  assert.equal(payload?.viewer.title, "Proposal for Acme");
  assert.equal(payload?.viewer.defaultThemeKey, "aurora-flux");
  assert.equal(payload?.viewer.slides[0]?.type, "cover");
  assert.equal(payload?.viewer.slides.at(-1)?.type, "closing");
  const publicPayload = JSON.stringify(payload);
  assert.doesNotMatch(publicPayload, /Prepared specifically for the revenue leadership team/);
  assert.doesNotMatch(publicPayload, /The current workflow creates response lag/);
  assert.doesNotMatch(
    publicPayload,
    /speakerNotes|visual|statLabel|evidenceEvaluation|verification|renderer\.example|do-not-publish|private\/crawl/i,
  );
  assert.equal("run" in payload!, false);
  assert.equal("artifacts" in payload!, false);
  assert.equal("id" in payload!.target, false);
  assert.equal("targetId" in payload!.share, false);
  assert.equal("runId" in payload!.share, false);
  assert.equal("viewCount" in payload!.share, false);
  assert.match(payload!.share.expiresAt, /^\d{4}-\d{2}-\d{2}T/u);

  const { GET } = await import("../../app/api/share/[slug]/route");
  const apiResponse = await GET(
    new Request(`https://bestdecks.test/api/share/${slug}`),
    { params: Promise.resolve({ slug }) },
  );
  assert.equal(apiResponse.status, 200);
  assert.match(apiResponse.headers.get("x-robots-tag") ?? "", /noindex/);

  const storedLink = await getShareableLink(slug);
  assert.equal(storedLink?.viewCount, 0);
});

test("public reads use committed checkpoints and revalidate them without writes", async () => {
  const { runId, targetId, userId, deliveryArtifact } = await seedDeck();
  const { slug } = await createShareableLink(targetId, runId, userId);
  const db = await getDb();
  const downgradedDelivery = structuredClone(deliveryArtifact) as ReturnType<
    typeof canonicalRenderingCheckpoint
  >;
  downgradedDelivery.readiness.artifactReadable = false;

  await db.run(
    `UPDATE run_artifacts
     SET artifact_json = ?
     WHERE target_id = ? AND artifact_type = 'presentation_delivery'`,
    [JSON.stringify(downgradedDelivery), targetId],
  );

  assert.ok(await getPublicShareableDeck(slug), "artifact mirrors are not commit records");

  await db.run(
    `UPDATE run_checkpoints
     SET metadata_json = ?
     WHERE run_id = ? AND checkpoint_key = ?`,
    [
      JSON.stringify(downgradedDelivery),
      runId,
      shareCheckpointKey(targetId, "rendering"),
    ],
  );

  assert.equal(await getPublicShareableDeck(slug), null);
  assert.equal((await getShareableLink(slug))?.viewCount, 0);
  await assert.rejects(
    () => createShareableLink(targetId, runId, userId),
    /Deck is not ready to share/,
  );
});

test("public reads quarantine null-owner and mismatched-linkage rows", async () => {
  const db = await getDb();

  const nullOwner = await seedDeck();
  const nullOwnerShare = await createShareableLink(
    nullOwner.targetId,
    nullOwner.runId,
    nullOwner.userId,
  );
  await db.run("UPDATE runs SET user_id = NULL WHERE id = ?", [nullOwner.runId]);
  assert.equal(await getPublicShareableDeck(nullOwnerShare.slug), null);

  const wrongCreator = await seedDeck();
  const wrongCreatorShare = await createShareableLink(
    wrongCreator.targetId,
    wrongCreator.runId,
    wrongCreator.userId,
  );
  await db.run(
    "UPDATE shareable_decks SET created_by = ? WHERE slug = ?",
    ["different-owner", wrongCreatorShare.slug],
  );
  assert.equal(await getPublicShareableDeck(wrongCreatorShare.slug), null);

  const sharedOwner = nextFixtureId("linkage-owner");
  const mismatchedRun = await seedDeck({ userId: sharedOwner });
  const otherRun = await seedDeck({ userId: sharedOwner });
  const mismatchedRunShare = await createShareableLink(
    mismatchedRun.targetId,
    mismatchedRun.runId,
    sharedOwner,
  );
  await db.run(
    "UPDATE shareable_decks SET run_id = ? WHERE slug = ?",
    [otherRun.runId, mismatchedRunShare.slug],
  );
  assert.equal(await getPublicShareableDeck(mismatchedRunShare.slug), null);
});

test("getPublicShareableDeck returns null for inactive or expired links", async () => {
  const { runId, targetId, userId } = await seedDeck();
  const { slug } = await createShareableLink(
    targetId,
    runId,
    userId,
  );

  // Public creation rejects already-expired input. Model a link that expired
  // after issuance by advancing its persisted expiry instead.
  const db = await getDb();
  await db.run(
    "UPDATE shareable_decks SET expires_at = ? WHERE slug = ?",
    ["2000-01-01T00:00:00.000Z", slug],
  );

  const expiredPayload = await getPublicShareableDeck(slug);
  assert.equal(expiredPayload, null);

  await deactivateShareableLink(targetId, userId);
  const inactivePayload = await getPublicShareableDeck(slug);
  assert.equal(inactivePayload, null);
});

test("legacy non-expiring and short share links fail closed", async () => {
  const { runId, targetId, userId } = await seedDeck();
  const { slug } = await createShareableLink(targetId, runId, userId);
  const db = await getDb();
  await db.run("UPDATE shareable_decks SET expires_at = NULL WHERE slug = ?", [slug]);

  assert.equal(await getPublicShareableDeck(slug), null);

  const replacement = await createShareableLink(targetId, runId, userId);
  assert.notEqual(replacement.slug, slug);

  await db.run(
    `INSERT INTO shareable_decks (
       id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
     ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
    [
      nextFixtureId("legacy-short-share"),
      "short123",
      runId,
      targetId,
      userId,
      "2099-01-01T00:00:00.000Z",
      "2026-04-03T10:00:00.000Z",
    ],
  );
  assert.equal(await getPublicShareableDeck("short123"), null);
});

test("owned deck lookups stay user-scoped and delivery cards expose share metadata", async () => {
  const ownerA = nextFixtureId("share-owner-a");
  const ownerB = nextFixtureId("share-owner-b");
  const firstDeck = await seedDeck({ userId: ownerA });
  await seedDeck({
    userId: ownerB,
    companyName: "Beta",
    visualStyle: "dark_minimal",
  });

  const ownedByA = await getOwnedDeliveryDeck(firstDeck.targetId, ownerA);
  const ownedByB = await getOwnedDeliveryDeck(firstDeck.targetId, ownerB);

  assert.equal(ownedByA?.companyName, "Acme");
  assert.equal(ownedByB, null);

  const { slug } = await createShareableLink(firstDeck.targetId, firstDeck.runId, ownerA);
  const cards = await listDeliveryDecks(ownerA) as Array<{
    targetId: string;
    shareSlug?: string;
    canShare?: boolean;
  }>;

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.targetId, firstDeck.targetId);
  assert.equal(cards[0]?.shareSlug, slug);
  assert.equal(cards[0]?.canShare, true);
});

test("delivery cards require the same verified artifact pair as public shares", async () => {
  const legacyOwner = nextFixtureId("legacy-card-owner");
  await seedDeck({
    userId: legacyOwner,
    planningArtifact: canonicalPlanningCheckpoint().plan,
  });
  const legacyCards = await listDeliveryDecks(legacyOwner) as Array<{ canShare?: boolean }>;
  assert.equal(legacyCards[0]?.canShare, false);

  const unreadableOwner = nextFixtureId("unreadable-card-owner");
  const unreadableDelivery = canonicalRenderingCheckpoint();
  unreadableDelivery.readiness.artifactReadable = false;
  await seedDeck({
    userId: unreadableOwner,
    deliveryArtifact: unreadableDelivery,
  });
  const unreadableCards = await listDeliveryDecks(unreadableOwner) as Array<{
    canShare?: boolean;
  }>;
  assert.equal(unreadableCards[0]?.canShare, false);

  const oversizedOwner = nextFixtureId("oversized-card-owner");
  const oversizedDelivery = canonicalRenderingCheckpoint();
  oversizedDelivery.verification.byteLength = MAX_DELIVERY_ARTIFACT_BYTES + 1;
  const oversized = await seedDeck({
    userId: oversizedOwner,
    deliveryArtifact: oversizedDelivery,
  });
  await assert.rejects(
    () => createShareableLink(oversized.targetId, oversized.runId, oversizedOwner),
    /Deck is not ready to share/,
  );
  const oversizedCards = await listDeliveryDecks(oversizedOwner) as Array<{
    canShare?: boolean;
    downloadAvailable?: boolean;
  }>;
  assert.equal(oversizedCards[0]?.canShare, false);
  assert.equal(oversizedCards[0]?.downloadAvailable, false);
});

test("delivery cards expose only owner- and run-linked active share slugs", async () => {
  const owner = nextFixtureId("card-linkage-owner");
  const deck = await seedDeck({ userId: owner });
  const otherDeck = await seedDeck({ userId: owner });
  const { slug } = await createShareableLink(deck.targetId, deck.runId, owner);
  const db = await getDb();

  let cards = await listDeliveryDecks(owner) as Array<{
    targetId: string;
    shareSlug?: string;
  }>;
  assert.equal(cards.find((card) => card.targetId === deck.targetId)?.shareSlug, slug);

  await db.run(
    "UPDATE shareable_decks SET created_by = ? WHERE slug = ?",
    ["different-owner", slug],
  );
  cards = await listDeliveryDecks(owner) as Array<{ targetId: string; shareSlug?: string }>;
  assert.equal(cards.find((card) => card.targetId === deck.targetId)?.shareSlug, undefined);

  await db.run(
    "UPDATE shareable_decks SET created_by = ?, run_id = ? WHERE slug = ?",
    [owner, otherDeck.runId, slug],
  );
  cards = await listDeliveryDecks(owner) as Array<{ targetId: string; shareSlug?: string }>;
  assert.equal(cards.find((card) => card.targetId === deck.targetId)?.shareSlug, undefined);
});
