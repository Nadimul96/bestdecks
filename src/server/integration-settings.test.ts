import assert from "node:assert/strict";
import test from "node:test";

import {
  IntegrationSettingsValidationError,
  validateCloudflareIntegrationRecord,
  validatePresentonIntegrationRecord,
} from "./settings";

const testPolicy = {
  nodeEnv: "test" as const,
  allowUserProviderEndpoints: false,
};

test("Cloudflare validation accepts metadata or a complete account/token pair", () => {
  assert.deepEqual(validateCloudflareIntegrationRecord({}), {
    config: undefined,
    secret: undefined,
  });
  assert.deepEqual(validateCloudflareIntegrationRecord({
    config: { accountId: "account-fixture" },
    secret: "token-fixture",
  }), {
    config: { accountId: "account-fixture" },
    secret: "token-fixture",
  });
});

test("Cloudflare validation rejects every partial or malformed override", () => {
  for (const record of [
    { config: { accountId: "account-fixture" } },
    { secret: "token-fixture" },
    { config: {}, secret: "token-fixture" },
    { config: { accountId: "account-fixture", extra: true }, secret: "token-fixture" },
    { config: { accountId: "account-fixture" }, secret: "   " },
  ]) {
    assert.throws(
      () => validateCloudflareIntegrationRecord(record),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
  }
});

test("Presenton validation accepts complete self-hosted and hosted auth contracts", () => {
  const basic = validatePresentonIntegrationRecord({
    config: {
      baseUrl: "https://renderer.example.test",
      authMode: "basic",
      username: "renderer-user",
    },
    secret: "fixture-value-123",
  }, testPolicy);
  assert.equal(basic.authMode, "basic");

  const bearer = validatePresentonIntegrationRecord({
    config: {
      baseUrl: "https://api.presenton.ai",
      authMode: "bearer",
    },
    secret: "fixture-value-123",
  }, {
    nodeEnv: "production",
    allowUserProviderEndpoints: true,
  });
  assert.equal(bearer.authMode, "bearer");
});

test("Presenton validation rejects missing, crossed, and malformed authentication", () => {
  for (const record of [
    {
      config: { authMode: "basic", username: "renderer-user" },
    },
    {
      config: { authMode: "basic", username: "renderer:user" },
      secret: "fixture-value-123",
    },
    {
      config: { baseUrl: "https://renderer.example.test", authMode: "bearer" },
      secret: "fixture-value-123",
    },
    {
      config: {
        baseUrl: "https://api.presenton.ai",
        authMode: "basic",
        username: "renderer-user",
      },
      secret: "fixture-value-123",
    },
  ]) {
    assert.throws(
      () => validatePresentonIntegrationRecord(record, testPolicy),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
  }
});

test("Presenton tenant overrides require their own public HTTPS endpoint", () => {
  for (const record of [
    { secret: "fixture-value-123" },
    { config: { template: "modern" } },
    {
      config: {
        baseUrl: "http://renderer.example.test",
        authMode: "basic",
        username: "renderer-user",
      },
      secret: "fixture-value-123",
    },
    ...[
      "https://localhost:5050",
      "https://renderer.local",
      "https://127.0.0.1:5050",
      "https://127.1",
      "https://2130706433",
      "https://0x7f000001",
      "https://10.20.30.40",
      "https://[::1]",
      "https://[::ffff:127.0.0.1]",
    ].map((baseUrl) => ({
      config: { baseUrl, authMode: "basic" as const, username: "renderer-user" },
      secret: "fixture-value-123",
    })),
  ]) {
    assert.throws(
      () => validatePresentonIntegrationRecord(record, testPolicy),
      (error: unknown) => error instanceof IntegrationSettingsValidationError,
    );
  }

  assert.doesNotThrow(() => validatePresentonIntegrationRecord({}, testPolicy));
});

test("Presenton production endpoint policy is denied unless explicitly enabled", () => {
  const record = {
    config: {
      baseUrl: "https://api.presenton.ai",
      authMode: "bearer",
    },
    secret: "fixture-value-123",
  };

  assert.throws(
    () => validatePresentonIntegrationRecord(record, {
      nodeEnv: "production",
      allowUserProviderEndpoints: false,
    }),
    (error: unknown) => error instanceof IntegrationSettingsValidationError,
  );
  assert.doesNotThrow(() => validatePresentonIntegrationRecord(record, {
    nodeEnv: "production",
    allowUserProviderEndpoints: true,
  }));
});
