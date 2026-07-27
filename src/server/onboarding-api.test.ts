import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import type { OnboardingPayload } from "@/src/domain/onboarding";
import { IntegrationArchiveQuotaExceededError } from "./integration-archive-policy";
import { IntegrationSettingsValidationError } from "./settings";

process.env.APP_SECRETS_KEY = "0".repeat(32);
const AUTH_ENV_FIELD = ["BETTER_AUTH", "SECRET"].join("_");
process.env[AUTH_ENV_FIELD] = randomBytes(32).toString("base64url");
process.env.LOCAL_DB_PATH = ":memory:";

const { createOnboardingPostHandler } = await import("./onboarding-api");

const userId = "onboarding-api-user";

function emptyOnboarding() {
  return {
    profile: {},
    sellerContext: undefined,
    questionnaire: undefined,
    sellerBriefMd: undefined,
    sellerKnowledge: undefined,
    intakeDraft: {
      websitesText: undefined,
      contactsCsvText: undefined,
    },
    integrations: [],
  };
}

function request(body: unknown) {
  return new Request("https://app.example.test/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("onboarding API returns a bounded client error for rejected integration state", async () => {
  const handler = createOnboardingPostHandler({
    getSession: async () => ({ user: { id: userId } }),
    saveOnboarding: async () => {
      throw new IntegrationSettingsValidationError(
        "presenton",
        "internal validation detail must stay private",
      );
    },
    getOnboarding: async () => emptyOnboarding(),
  });

  const response = await handler(request({
    profile: {},
    integrations: [{ provider: "presenton", clearSecret: true }],
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(body, {
    error: "Integration settings are invalid.",
    code: "invalid_integration_settings",
    provider: "presenton",
  });
  assert.equal(JSON.stringify(body).includes("internal validation detail"), false);
});

test("onboarding API parses an explicit config reset before persistence", async () => {
  let captured: { payload: OnboardingPayload; userId: string } | undefined;
  const handler = createOnboardingPostHandler({
    getSession: async () => ({ user: { id: userId } }),
    saveOnboarding: async (payload, savedUserId) => {
      captured = { payload, userId: savedUserId };
    },
    getOnboarding: async () => emptyOnboarding(),
  });

  const response = await handler(request({
    profile: {},
    integrations: [{
      provider: "presenton",
      clearConfig: true,
      clearSecret: true,
    }],
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(captured?.userId, userId);
  assert.equal(captured?.payload.integrations?.[0]?.clearConfig, true);
  assert.equal(captured?.payload.integrations?.[0]?.clearSecret, true);
});

test("onboarding API maps archive quota rejection to a private retryable response", async () => {
  const handler = createOnboardingPostHandler({
    getSession: async () => ({ user: { id: userId } }),
    saveOnboarding: async () => {
      throw new IntegrationArchiveQuotaExceededError(3_600);
    },
    getOnboarding: async () => emptyOnboarding(),
  });

  const response = await handler(request({
    profile: {},
    integrations: [{ provider: "cloudflare", clearConfig: true, clearSecret: true }],
  }));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Retry-After"), "3600");
  assert.deepEqual(await response.json(), {
    error: "Integration settings archive limit reached.",
    code: "integration_archive_quota_exceeded",
  });
});

test("onboarding API distinguishes internal persistence failures from invalid input", async () => {
  const handler = createOnboardingPostHandler({
    getSession: async () => ({ user: { id: userId } }),
    saveOnboarding: async () => {
      throw new Error("database unavailable");
    },
    getOnboarding: async () => emptyOnboarding(),
  });

  const response = await handler(request({ profile: {} }));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Unable to save onboarding state.",
  });
});

test("onboarding API rejects recipient-email CSV before raw draft persistence", async () => {
  let persistenceCalls = 0;
  const handler = createOnboardingPostHandler({
    getSession: async () => ({ user: { id: userId } }),
    saveOnboarding: async () => {
      persistenceCalls += 1;
    },
    getOnboarding: async () => emptyOnboarding(),
  });

  const response = await handler(request({
    profile: {},
    intakeDraft: {
      contactsCsvText: "website,recipient_email\nacme.com,fixture-value",
    },
  }));

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "Onboarding payload is invalid." });
  assert.equal(persistenceCalls, 0);
});
