import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const {
  addArtifact,
  countRuns,
  createRun,
  getOnboarding,
  getRun,
  getSellerBriefMd,
  getSellerKnowledge,
  listDeliveryDecks,
  listRuns,
  saveOnboarding,
  saveSellerBriefMd,
  saveSellerKnowledge,
  updateRun,
  updateRunTarget,
} = await import("./repository");
const { resolveIntegrationConfig } = await import("./settings");

let scopeSequence = 0;

function tenantPair(label: string) {
  scopeSequence += 1;
  const scope = `${label}-${scopeSequence}`;
  return {
    userA: `${scope}-user-a`,
    userB: `${scope}-user-b`,
    admin: `${scope}-admin`,
  };
}

function makeOnboarding(companyName: string) {
  return {
    profile: {
      ownerName: "Test User",
      ownerEmail: "test@example.test",
      companyName,
      websiteUrl: "https://seller.example.test",
    },
    sellerContext: {
      websiteUrl: "https://seller.example.test",
      companyName,
      offerSummary: "We build evidence-backed proposals",
      services: ["Research"],
      differentiators: ["Source-linked claims"],
      targetCustomer: "Revenue teams",
      desiredOutcome: "Book a call",
      proofPoints: [],
      constraints: [],
    },
  };
}

function makeKnowledge(companyName: string) {
  return {
    websiteUrl: "https://seller.example.test",
    companyName,
    offerSummary: "We build evidence-backed proposals",
    services: ["Research"],
    differentiators: ["Source-linked claims"],
    targetCustomer: "Revenue teams",
    desiredOutcome: "Book a call",
    proofPoints: ["Every material claim has provenance"],
    caseStudies: [],
    clientLogos: [],
    awards: [],
    commonObjections: [],
    constraints: [],
  };
}

function makeIntakeRun(websiteUrl = "https://target.example.test") {
  return {
    sellerContext: {
      websiteUrl: "https://seller.example.test",
      companyName: "Seller",
      offerSummary: "We build evidence-backed proposals",
      services: ["Research"],
      differentiators: ["Source-linked claims"],
      targetCustomer: "Revenue teams",
      desiredOutcome: "Book a call",
      proofPoints: [],
      constraints: [],
    },
    questionnaire: {
      archetype: "cold_outreach" as const,
      audience: "Founders",
      objective: "Get meetings",
      callToAction: "Book a call",
      outputFormat: "pptx" as const,
      desiredCardCount: 8,
      tone: "consultative" as const,
      visualStyle: "auto" as const,
      imagePolicy: "never" as const,
      mustInclude: [],
      mustAvoid: [],
      visualContentTypes: [],
      visualDensity: "rich" as const,
      optionalReview: false,
      allowUserApprovedCrawlException: false,
    },
    targets: [{ websiteUrl }],
  };
}

test("onboarding state is isolated by tenant and same-tenant saves upsert", async () => {
  const { userA, userB } = tenantPair("onboarding");

  await saveOnboarding(makeOnboarding("Alpha v1"), userA);
  assert.equal((await getOnboarding(userA)).profile.companyName, "Alpha v1");
  assert.deepEqual((await getOnboarding(userB)).profile, {});

  await saveOnboarding(makeOnboarding("Alpha v2"), userA);
  await saveOnboarding(makeOnboarding("Beta"), userB);

  assert.equal((await getOnboarding(userA)).profile.companyName, "Alpha v2");
  assert.equal((await getOnboarding(userB)).profile.companyName, "Beta");
});

test("seller knowledge and seller briefs cannot cross tenant boundaries", async () => {
  const { userA, userB } = tenantPair("seller-context");

  await saveSellerKnowledge(makeKnowledge("Alpha"), userA);
  await saveSellerBriefMd("# Alpha brief", userA);

  assert.equal((await getSellerKnowledge(userA))?.companyName, "Alpha");
  assert.equal(await getSellerKnowledge(userB), null);
  assert.equal(await getSellerBriefMd(userA), "# Alpha brief");
  assert.equal(await getSellerBriefMd(userB), null);

  await saveSellerKnowledge(makeKnowledge("Beta"), userB);
  await saveSellerBriefMd("# Beta brief", userB);
  assert.equal((await getSellerKnowledge(userA))?.companyName, "Alpha");
  assert.equal((await getSellerKnowledge(userB))?.companyName, "Beta");
});

test("run reads, lists, and counts enforce ownership without a global-admin bypass", async () => {
  const { userA, userB, admin } = tenantPair("runs");
  const firstA = await createRun(makeIntakeRun("https://a-1.example.test"), userA);
  const secondA = await createRun(makeIntakeRun("https://a-2.example.test"), userA);
  const onlyB = await createRun(makeIntakeRun("https://b-1.example.test"), userB);

  assert.ok(await getRun(firstA, userA));
  assert.equal(await getRun(firstA, userB), null);
  assert.equal(await getRun(firstA, admin), null);

  assert.deepEqual(
    new Set((await listRuns(userA)).map((run) => run.id)),
    new Set([firstA, secondA]),
  );
  assert.deepEqual(
    new Set((await listRuns(userB)).map((run) => run.id)),
    new Set([onlyB]),
  );
  assert.equal(await countRuns(userA), 2);
  assert.equal(await countRuns(userB), 1);
});

test("delivery listings expose only the requesting tenant's delivered targets", async () => {
  const { userA, userB } = tenantPair("delivery");
  const runA = await createRun(makeIntakeRun("https://alpha.example.test"), userA);
  const runB = await createRun(makeIntakeRun("https://beta.example.test"), userB);
  const recordA = await getRun(runA, userA);
  const recordB = await getRun(runB, userB);
  assert.ok(recordA && recordB);
  const targetA = recordA.targets[0] as unknown as { id: string };
  const targetB = recordB.targets[0] as unknown as { id: string };

  await updateRun(runA, { status: "delivered" });
  await updateRunTarget(targetA.id, { status: "delivered" });
  await addArtifact(runA, {
    targetId: targetA.id,
    idempotencyKey: "delivery",
    artifactType: "presentation_delivery",
    artifactJson: { provider: "presenton", url: "https://alpha.example.test/deck" },
  });
  await updateRun(runB, { status: "delivered" });
  await updateRunTarget(targetB.id, { status: "delivered" });
  await addArtifact(runB, {
    targetId: targetB.id,
    idempotencyKey: "delivery",
    artifactType: "presentation_delivery",
    artifactJson: { provider: "presenton", url: "https://beta.example.test/deck" },
  });

  const decksA = await listDeliveryDecks(userA);
  const decksB = await listDeliveryDecks(userB);
  assert.deepEqual(decksA.map((deck) => deck.runId), [runA]);
  assert.deepEqual(decksB.map((deck) => deck.runId), [runB]);
});

test("same-provider integration records remain isolated for two tenants", async () => {
  const { userA, userB } = tenantPair("integrations");

  await saveOnboarding(
    {
      ...makeOnboarding("Alpha"),
      integrations: [
        {
          provider: "openai" as const,
          displayName: "Alpha OpenAI",
          secret: "test-key-a",
        },
      ],
    },
    userA,
  );
  await saveOnboarding(
    {
      ...makeOnboarding("Beta"),
      integrations: [
        {
          provider: "openai" as const,
          displayName: "Beta OpenAI",
          secret: "test-key-b",
        },
      ],
    },
    userB,
  );

  const openAiA = (await getOnboarding(userA)).integrations.find(
    ({ provider }) => provider === "openai",
  );
  const openAiB = (await getOnboarding(userB)).integrations.find(
    ({ provider }) => provider === "openai",
  );
  assert.deepEqual(openAiA, {
    provider: "openai",
    displayName: "Alpha OpenAI",
    config: undefined,
    hasSecret: true,
  });
  assert.deepEqual(openAiB, {
    provider: "openai",
    displayName: "Beta OpenAI",
    config: undefined,
    hasSecret: true,
  });
});

test("run creation rejects a missing owner instead of creating unowned data", async () => {
  await assert.rejects(() => createRun(makeIntakeRun(), ""), /owner is required/i);
});

test("process-level provider credentials require an explicit shared-credential opt-in", async () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = "shared-fixture-account";
  process.env.CLOUDFLARE_API_TOKEN = "shared-fixture-token";
  process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = "0";

  const isolated = await resolveIntegrationConfig("tenant-without-provider-settings");
  assert.equal(isolated.cloudflareAccountId, undefined);
  assert.equal(isolated.cloudflareApiToken, undefined);

  process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = "1";
  const explicitlyShared = await resolveIntegrationConfig("tenant-without-provider-settings");
  assert.equal(explicitlyShared.cloudflareAccountId, "shared-fixture-account");
  assert.equal(explicitlyShared.cloudflareApiToken, "shared-fixture-token");

  process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = "0";
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
});
