import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
Object.assign(process.env, { NODE_ENV: "test" });
delete process.env.ALLOW_USER_PROVIDER_ENDPOINTS;
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getOnboarding, saveOnboarding } = await import("./repository");
const { getDb } = await import("./db");
const { encryptSecret } = await import("./crypto");
const {
  IntegrationSettingsValidationError,
  resolveIntegrationConfig,
} = await import("./settings");
const {
  INTEGRATION_ARCHIVE_QUOTA,
  IntegrationArchiveQuotaExceededError,
} = await import("./integration-archive-policy");

const TEST_USER_ID = "repository-test-user";

test("saveOnboarding persists workspace drafts and integration secret markers", async () => {
  await saveOnboarding({
    profile: {
      ownerName: "Test Operator",
      ownerEmail: "owner@example.test",
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
      outputFormat: "pptx",
      desiredCardCount: 8,
      tone: "consultative",
      visualStyle: "premium_modern",
      imagePolicy: "never",
      visualContentTypes: [],
      visualDensity: "rich",
      mustInclude: [],
      mustAvoid: [],
      optionalReview: false,
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
        config: {
          baseUrl: "https://renderer.example.test",
          template: "modern",
          authMode: "basic",
          username: "renderer-user",
        },
        secret: "fixture-value-123",
      },
      {
        provider: "plusai",
        secret: "plusai-secret",
      },
    ],
  }, TEST_USER_ID);

  const onboarding = await getOnboarding(TEST_USER_ID);

  assert.equal(onboarding.profile.ownerEmail, "owner@example.test");
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
    "https://renderer.example.test",
  );
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "presenton")
      ?.config?.template,
    "modern",
  );
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "presenton")
      ?.hasSecret,
    true,
  );
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "plusai")
      ?.hasSecret,
    true,
  );

  await saveOnboarding({
    profile: {},
    integrations: [{ provider: "plusai", clearSecret: true }],
  }, TEST_USER_ID);

  const afterRevoke = await getOnboarding(TEST_USER_ID);
  assert.equal(
    afterRevoke.integrations.find((integration) => integration.provider === "plusai")
      ?.hasSecret,
    undefined,
  );

  const archived = await (await getDb()).execute(
    `SELECT secret_ciphertext, ciphertext_sha256, reason
     FROM integration_secret_archive
     WHERE user_id = ? AND provider = ?
     LIMIT 1`,
    [TEST_USER_ID, "plusai"],
  ) as {
    secret_ciphertext: string;
    ciphertext_sha256: string;
    reason: string;
  } | undefined;
  assert.ok(archived);
  assert.equal(archived.reason, "explicit_user_revoke");
  assert.equal(
    archived.ciphertext_sha256,
    createHash("sha256").update(archived.secret_ciphertext).digest("hex"),
  );
});

test("partial onboarding updates preserve unrelated seller and questionnaire fields", async () => {
  const userId = "repository-partial-update-user";
  await saveOnboarding({
    profile: {},
    sellerContext: {
      websiteUrl: "https://seller.example",
      companyName: "Seller",
      offerSummary: "Original offer",
      services: ["Implementation"],
      differentiators: ["Evidence-first"],
      targetCustomer: "Revenue leaders",
      desiredOutcome: "Qualified conversations",
    },
    questionnaire: {
      archetype: "cold_outreach",
      audience: "VP Sales",
      objective: "Review the workflow",
      callToAction: "Book a review",
      tone: "consultative",
    },
  }, userId);

  await saveOnboarding({
    profile: {},
    sellerContext: { offerSummary: "Updated offer" },
    questionnaire: { extraInstructions: "SLIDE STRUCTURE:\n1. Opening" },
  }, userId);

  const saved = await getOnboarding(userId);
  assert.equal(saved.sellerContext?.offerSummary, "Updated offer");
  assert.deepEqual(saved.sellerContext?.services, ["Implementation"]);
  assert.equal(saved.sellerContext?.targetCustomer, "Revenue leaders");
  assert.equal(saved.questionnaire?.audience, "VP Sales");
  assert.equal(saved.questionnaire?.callToAction, "Book a review");
  assert.equal(saved.questionnaire?.extraInstructions, "SLIDE STRUCTURE:\n1. Opening");
});

test("Presenton patches validate the effective prior config and retain omitted fields", async () => {
  const userId = "repository-presenton-patch-user";
  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "presenton",
      config: {
        baseUrl: "https://renderer.example.test",
        authMode: "basic",
        username: "renderer-user",
      },
      secret: "fixture-value-123",
    }],
  }, userId);

  await saveOnboarding({
    profile: {},
    integrations: [{ provider: "presenton", config: { template: "modern" } }],
  }, userId);

  const resolved = await resolveIntegrationConfig(userId);
  assert.equal(resolved.presentonBaseUrl, "https://renderer.example.test");
  assert.equal(resolved.presentonTemplate, "modern");
  assert.equal(resolved.presentonAuthUsername, "renderer-user");
  assert.equal(Boolean(resolved.presentonAuthPassword), true);
  assert.equal(resolved.presentonApiKey, undefined);

  const archived = await (await getDb()).execute(
    `SELECT config_json, config_sha256, reason
     FROM integration_config_archive
     WHERE user_id = ? AND provider = ?
     LIMIT 1`,
    [userId, "presenton"],
  ) as {
    config_json: string;
    config_sha256: string;
    reason: string;
  } | undefined;
  assert.ok(archived);
  assert.equal(archived.reason, "explicit_user_update");
  assert.equal(
    archived.config_sha256,
    createHash("sha256").update(archived.config_json).digest("hex"),
  );
});

test("invalid Presenton auth rolls back onboarding and leaves prior state active", async () => {
  const userId = "repository-presenton-rollback-user";
  await saveOnboarding({
    profile: { companyName: "Before" },
    integrations: [{
      provider: "presenton",
      config: {
        baseUrl: "https://renderer.example.test",
        authMode: "basic",
        username: "renderer-user",
      },
      secret: "fixture-value-123",
    }],
  }, userId);

  await assert.rejects(
    saveOnboarding({
      profile: { companyName: "Must roll back" },
      integrations: [{ provider: "presenton", clearSecret: true }],
    }, userId),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );

  const onboarding = await getOnboarding(userId);
  assert.equal(onboarding.profile.companyName, "Before");
  assert.equal(
    onboarding.integrations.find((integration) => integration.provider === "presenton")
      ?.hasSecret,
    true,
  );
  const archiveCount = await (await getDb()).execute(
    `SELECT COUNT(*) AS count
     FROM integration_secret_archive
     WHERE user_id = ? AND provider = ?`,
    [userId, "presenton"],
  ) as { count: number | bigint } | undefined;
  assert.equal(Number(archiveCount?.count), 0);
});

test("Presenton can atomically reset Basic auth to bearer and explicitly clear both states", async () => {
  const userId = "repository-presenton-reset-user";
  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "presenton",
      config: {
        baseUrl: "https://renderer.example.test",
        authMode: "basic",
        username: "renderer-user",
      },
      secret: "fixture-value-123",
    }],
  }, userId);

  await assert.rejects(
    saveOnboarding({
      profile: {},
      integrations: [{ provider: "presenton", clearConfig: true }],
    }, userId),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );
  const unchanged = await resolveIntegrationConfig(userId);
  assert.equal(unchanged.presentonBaseUrl, "https://renderer.example.test");
  assert.equal(unchanged.presentonAuthUsername, "renderer-user");
  assert.equal(Boolean(unchanged.presentonAuthPassword), true);

  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "presenton",
      clearConfig: true,
      config: {
        baseUrl: "https://api.presenton.ai",
        authMode: "bearer",
      },
      secret: "replacement-fixture-value",
    }],
  }, userId);

  const bearer = await resolveIntegrationConfig(userId);
  assert.equal(bearer.presentonBaseUrl, "https://api.presenton.ai");
  assert.equal(Boolean(bearer.presentonApiKey), true);
  assert.equal(bearer.presentonAuthUsername, undefined);
  assert.equal(bearer.presentonAuthPassword, undefined);

  const replacedSecret = await (await getDb()).execute(
    `SELECT reason FROM integration_secret_archive
     WHERE user_id = ? AND provider = ?
     ORDER BY archived_at ASC
     LIMIT 1`,
    [userId, "presenton"],
  ) as { reason: string } | undefined;
  assert.equal(replacedSecret?.reason, "explicit_user_replace");

  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "presenton",
      clearConfig: true,
      clearSecret: true,
    }],
  }, userId);

  const cleared = await resolveIntegrationConfig(userId);
  assert.equal(cleared.presentonBaseUrl, undefined);
  assert.equal(cleared.presentonApiKey, undefined);
  assert.equal(cleared.presentonAuthUsername, undefined);
  const active = await (await getDb()).execute(
    `SELECT config_json, secret_ciphertext
     FROM integration_settings
     WHERE user_id = ? AND provider = ?`,
    [userId, "presenton"],
  ) as { config_json: string | null; secret_ciphertext: string | null } | undefined;
  assert.deepEqual(active, { config_json: null, secret_ciphertext: null });
});

test("production policy rejects tenant Presenton endpoints before persistence", async () => {
  const userId = "repository-presenton-production-policy-user";
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowance = process.env.ALLOW_USER_PROVIDER_ENDPOINTS;
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.ALLOW_USER_PROVIDER_ENDPOINTS;

  try {
    await assert.rejects(
      saveOnboarding({
        profile: { companyName: "Must not persist" },
        integrations: [{
          provider: "presenton",
          config: {
            baseUrl: "https://api.presenton.ai",
            authMode: "bearer",
          },
          secret: "fixture-value-123",
        }],
      }, userId),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
  } finally {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    if (originalAllowance === undefined) delete process.env.ALLOW_USER_PROVIDER_ENDPOINTS;
    else process.env.ALLOW_USER_PROVIDER_ENDPOINTS = originalAllowance;
  }

  const db = await getDb();
  assert.equal(await db.execute(
    "SELECT provider FROM integration_settings WHERE user_id = ? LIMIT 1",
    [userId],
  ), undefined);
  assert.equal(await db.execute(
    "SELECT company_name FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ), undefined);
});

test("legacy invalid Presenton state blocks unrelated writes but remains explicitly recoverable", async () => {
  const userId = "repository-presenton-recovery-user";
  const db = await getDb();
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, config_json, updated_at
     ) VALUES (?, ?, ?, ?)`,
    [
      "presenton",
      userId,
      JSON.stringify({ authMode: "basic", username: "renderer-user" }),
      "2026-07-13T00:00:00.000Z",
    ],
  );

  const recoverable = await getOnboarding(userId);
  assert.deepEqual(
    recoverable.integrations.find(({ provider }) => provider === "presenton"),
    {
      provider: "presenton",
      displayName: undefined,
      config: { authMode: "basic", username: "renderer-user" },
      hasSecret: false,
      needsRepair: true,
    },
  );
  await assert.rejects(
    resolveIntegrationConfig(userId),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );

  await assert.rejects(
    saveOnboarding({ profile: { companyName: "Must roll back" } }, userId),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );
  assert.equal(await db.execute(
    "SELECT company_name FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ), undefined);

  await saveOnboarding({
    profile: { companyName: "Recovered" },
    integrations: [{
      provider: "presenton",
      clearConfig: true,
      clearSecret: true,
    }],
  }, userId);

  assert.equal((await getOnboarding(userId)).profile.companyName, "Recovered");
  const archived = await db.execute(
    `SELECT reason FROM integration_config_archive
     WHERE user_id = ? AND provider = ?
     LIMIT 1`,
    [userId, "presenton"],
  ) as { reason: string } | undefined;
  assert.equal(archived?.reason, "explicit_user_clear");
  assert.equal(
    (await getOnboarding(userId)).integrations.some(
      ({ provider }) => provider === "presenton",
    ),
    false,
  );
});

test("legacy secret-only Presenton state is marked for repair and never reaches runtime", async () => {
  const userId = "repository-presenton-secret-only-recovery-user";
  const db = await getDb();
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    [
      "presenton",
      userId,
      encryptSecret("fixture-value-123", { userId, provider: "presenton" }),
      "2026-07-13T00:00:00.000Z",
    ],
  );

  assert.deepEqual(
    (await getOnboarding(userId)).integrations.find(
      ({ provider }) => provider === "presenton",
    ),
    {
      provider: "presenton",
      displayName: undefined,
      config: undefined,
      hasSecret: true,
      needsRepair: true,
    },
  );
  await assert.rejects(
    resolveIntegrationConfig(userId),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );
});

test("malformed Presenton JSON is redacted for repair while runtime resolution stays closed", async () => {
  const userId = "repository-presenton-malformed-recovery-user";
  const db = await getDb();
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, config_json, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["presenton", userId, "{malformed", "2026-07-13T00:00:00.000Z"],
  );

  const onboarding = await getOnboarding(userId);
  assert.deepEqual(onboarding.integrations, [{
    provider: "presenton",
    displayName: undefined,
    config: undefined,
    hasSecret: false,
    needsRepair: true,
  }]);
  await assert.rejects(resolveIntegrationConfig(userId));

  await saveOnboarding({
    profile: {},
    integrations: [{ provider: "presenton", clearConfig: true }],
  }, userId);
  assert.deepEqual((await getOnboarding(userId)).integrations, []);
});

test("onboarding recovery identifies a now-disallowed endpoint without exposing it to runtime", async () => {
  const userId = "repository-presenton-policy-recovery-user";
  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "presenton",
      config: {
        baseUrl: "https://api.presenton.ai",
        authMode: "bearer",
      },
      secret: "fixture-value-123",
    }],
  }, userId);

  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowance = process.env.ALLOW_USER_PROVIDER_ENDPOINTS;
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.ALLOW_USER_PROVIDER_ENDPOINTS;

  try {
    const onboarding = await getOnboarding(userId);
    const presenton = onboarding.integrations.find(
      ({ provider }) => provider === "presenton",
    );
    assert.equal(presenton?.needsRepair, true);
    assert.equal(presenton?.hasSecret, true);
    assert.equal(presenton?.config?.baseUrl, "https://api.presenton.ai");
    await assert.rejects(
      resolveIntegrationConfig(userId),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );

    await saveOnboarding({
      profile: {},
      integrations: [{
        provider: "presenton",
        clearConfig: true,
        clearSecret: true,
      }],
    }, userId);
    assert.deepEqual((await getOnboarding(userId)).integrations, []);
  } finally {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    if (originalAllowance === undefined) delete process.env.ALLOW_USER_PROVIDER_ENDPOINTS;
    else process.env.ALLOW_USER_PROVIDER_ENDPOINTS = originalAllowance;
  }
});

test("onboarding reads never disclose operator-managed integration settings", async () => {
  const originalShared = process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS;
  const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = "1";
  process.env.CLOUDFLARE_ACCOUNT_ID = "operator-fixture-account";
  process.env.CLOUDFLARE_API_TOKEN = "operator-fixture-token";

  try {
    assert.deepEqual(
      (await getOnboarding("repository-operator-config-redaction-user")).integrations,
      [],
    );
  } finally {
    if (originalShared === undefined) delete process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS;
    else process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = originalShared;
    if (originalAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test("Cloudflare display metadata does not suppress explicitly shared operator credentials", async () => {
  const userId = "repository-cloudflare-metadata-user";
  const originalShared = process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS;
  const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = "1";
  process.env.CLOUDFLARE_ACCOUNT_ID = "operator-fixture-account";
  process.env.CLOUDFLARE_API_TOKEN = "operator-fixture-token";

  try {
    await saveOnboarding({
      profile: {},
      integrations: [{ provider: "cloudflare", displayName: "Operator managed" }],
    }, userId);

    assert.deepEqual((await getOnboarding(userId)).integrations, [{
      provider: "cloudflare",
      displayName: "Operator managed",
      config: undefined,
      hasSecret: false,
    }]);
    const resolved = await resolveIntegrationConfig(userId);
    assert.equal(resolved.cloudflareAccountId, "operator-fixture-account");
    assert.equal(resolved.cloudflareApiToken, "operator-fixture-token");
  } finally {
    if (originalShared === undefined) delete process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS;
    else process.env.ALLOW_SHARED_PROVIDER_CREDENTIALS = originalShared;
    if (originalAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test("Cloudflare account and token clear atomically or roll back together", async () => {
  const userId = "repository-cloudflare-atomic-clear-user";
  const db = await getDb();
  await saveOnboarding({
    profile: { companyName: "Before" },
    integrations: [{
      provider: "cloudflare",
      config: { accountId: "account-fixture" },
      secret: "token-fixture",
    }],
  }, userId);
  const before = await db.execute(
    `SELECT config_json, secret_ciphertext
     FROM integration_settings
     WHERE user_id = ? AND provider = 'cloudflare'`,
    [userId],
  );

  for (const patch of [{ clearSecret: true }, { clearConfig: true }]) {
    await assert.rejects(
      saveOnboarding({
        profile: { companyName: "Must roll back" },
        integrations: [{ provider: "cloudflare", ...patch }],
      }, userId),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
    assert.equal((await getOnboarding(userId)).profile.companyName, "Before");
    assert.deepEqual(await db.execute(
      `SELECT config_json, secret_ciphertext
       FROM integration_settings
       WHERE user_id = ? AND provider = 'cloudflare'`,
      [userId],
    ), before);
  }

  await saveOnboarding({
    profile: { companyName: "Cleared" },
    integrations: [{
      provider: "cloudflare",
      clearConfig: true,
      clearSecret: true,
    }],
  }, userId);
  assert.deepEqual(await db.execute(
    `SELECT config_json, secret_ciphertext
     FROM integration_settings
     WHERE user_id = ? AND provider = 'cloudflare'`,
    [userId],
  ), { config_json: null, secret_ciphertext: null });
  assert.equal((await getOnboarding(userId)).profile.companyName, "Cleared");
});

test("partial legacy Cloudflare overrides are repairable but never reach runtime", async () => {
  const db = await getDb();
  const fixtures = [
    {
      userId: "repository-cloudflare-config-only-user",
      configJson: JSON.stringify({ accountId: "account-fixture" }),
      secretCiphertext: null,
      expectedConfig: { accountId: "account-fixture" },
      hasSecret: false,
    },
    {
      userId: "repository-cloudflare-secret-only-user",
      configJson: null,
      secretCiphertext: encryptSecret("token-fixture", {
        userId: "repository-cloudflare-secret-only-user",
        provider: "cloudflare",
      }),
      expectedConfig: undefined,
      hasSecret: true,
    },
  ];

  for (const fixture of fixtures) {
    await db.run(
      `INSERT INTO integration_settings (
         provider, user_id, config_json, secret_ciphertext, updated_at
       ) VALUES ('cloudflare', ?, ?, ?, ?)`,
      [
        fixture.userId,
        fixture.configJson,
        fixture.secretCiphertext,
        "2026-07-13T00:00:00.000Z",
      ],
    );

    assert.deepEqual((await getOnboarding(fixture.userId)).integrations, [{
      provider: "cloudflare",
      displayName: undefined,
      config: fixture.expectedConfig,
      hasSecret: fixture.hasSecret,
      needsRepair: true,
    }]);
    await assert.rejects(
      resolveIntegrationConfig(fixture.userId),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
    await assert.rejects(
      saveOnboarding({ profile: { companyName: "Must roll back" } }, fixture.userId),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
    assert.equal((await getOnboarding(fixture.userId)).profile.companyName, undefined);

    await saveOnboarding({
      profile: { companyName: "Recovered" },
      integrations: [{
        provider: "cloudflare",
        clearConfig: true,
        clearSecret: true,
      }],
    }, fixture.userId);
    assert.deepEqual((await getOnboarding(fixture.userId)).integrations, []);
  }
});

test("archive rate quota rolls back the whole save and remains tenant scoped", async () => {
  const userId = "repository-archive-rate-user";
  const otherUserId = "repository-archive-rate-other-user";
  const db = await getDb();
  await saveOnboarding({
    profile: { companyName: "Before" },
    integrations: [{
      provider: "cloudflare",
      config: { accountId: "account-fixture" },
      secret: "token-fixture",
    }],
  }, userId);
  const before = await db.execute(
    `SELECT config_json, secret_ciphertext, updated_at
     FROM integration_settings
     WHERE user_id = ? AND provider = 'cloudflare'`,
    [userId],
  );
  const archivedAt = new Date().toISOString();
  await db.run(
    `WITH RECURSIVE sequence(value) AS (
       SELECT 1
       UNION ALL
       SELECT value + 1 FROM sequence WHERE value < ?
     )
     INSERT INTO integration_secret_archive (
       id, provider, user_id, secret_ciphertext, ciphertext_sha256, reason, archived_at
     )
     SELECT
       'rate-quota-' || value,
       'cloudflare',
       ?,
       'retained-payload-' || value,
       printf('%064d', value),
       'test_fixture',
       ?
     FROM sequence`,
    [INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow, userId, archivedAt],
  );

  await assert.rejects(
    saveOnboarding({
      profile: { companyName: "Must roll back" },
      integrations: [{ provider: "cloudflare", secret: "replacement-fixture" }],
    }, userId),
    (error: unknown) => error instanceof IntegrationArchiveQuotaExceededError,
  );
  assert.equal((await getOnboarding(userId)).profile.companyName, "Before");
  assert.deepEqual(await db.execute(
    `SELECT config_json, secret_ciphertext, updated_at
     FROM integration_settings
     WHERE user_id = ? AND provider = 'cloudflare'`,
    [userId],
  ), before);
  const count = await db.execute(
    `SELECT COUNT(*) AS count
     FROM integration_secret_archive
     WHERE user_id = ?`,
    [userId],
  ) as unknown as { count: number | bigint };
  assert.equal(Number(count.count), INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow);

  await saveOnboarding({
    profile: {},
    integrations: [{
      provider: "cloudflare",
      config: { accountId: "other-account-fixture" },
      secret: "other-token-fixture",
    }],
  }, otherUserId);
  await saveOnboarding({
    profile: {},
    integrations: [{ provider: "cloudflare", secret: "other-replacement-fixture" }],
  }, otherUserId);
  const otherCount = await db.execute(
    `SELECT COUNT(*) AS count
     FROM integration_secret_archive
     WHERE user_id = ?`,
    [otherUserId],
  ) as unknown as { count: number | bigint };
  assert.equal(Number(otherCount.count), 1);
});

test("retained archive row and byte quotas are enforced by persisted tenant usage", async () => {
  const db = await getDb();
  const rowUserId = "repository-archive-retained-rows-user";
  const byteUserId = "repository-archive-retained-bytes-user";

  for (const userId of [rowUserId, byteUserId]) {
    await saveOnboarding({
      profile: { companyName: "Before" },
      integrations: [{
        provider: "cloudflare",
        config: { accountId: "account-fixture" },
        secret: "token-fixture",
      }],
    }, userId);
  }

  await db.run(
    `WITH digits(value) AS (
       VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)
     ), sequence(value) AS (
       SELECT hundreds.value * 100 + tens.value * 10 + ones.value
       FROM digits AS hundreds
       CROSS JOIN digits AS tens
       CROSS JOIN digits AS ones
     )
     INSERT INTO integration_secret_archive (
       id, provider, user_id, secret_ciphertext, ciphertext_sha256, reason, archived_at
     )
     SELECT
       ? || '-' || value,
       'cloudflare',
       ?,
       'retained',
       printf('%064d', value),
       'test_fixture',
       '2020-01-01T00:00:00.000Z'
     FROM sequence`,
    [rowUserId, rowUserId],
  );

  const retainedPayload = `"${"x".repeat(
    INTEGRATION_ARCHIVE_QUOTA.maxRetainedPayloadBytes - 2,
  )}"`;
  await db.run(
    `INSERT INTO integration_config_archive (
       id, provider, user_id, config_json, config_sha256, reason, archived_at
     ) VALUES (?, 'cloudflare', ?, ?, ?, 'test_fixture', ?)`,
    [
      `${byteUserId}-payload`,
      byteUserId,
      retainedPayload,
      createHash("sha256").update(retainedPayload).digest("hex"),
      "2020-01-01T00:00:00.000Z",
    ],
  );

  for (const userId of [rowUserId, byteUserId]) {
    await assert.rejects(
      saveOnboarding({
        profile: { companyName: "Must roll back" },
        integrations: [{ provider: "cloudflare", secret: "replacement-fixture" }],
      }, userId),
      (error: unknown) => error instanceof IntegrationArchiveQuotaExceededError,
    );
    assert.equal((await getOnboarding(userId)).profile.companyName, "Before");
  }
});
