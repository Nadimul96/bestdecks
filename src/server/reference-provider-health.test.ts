import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAllProviderStatuses,
  buildExperimentalProviderStatuses,
  buildReferenceProviderStatuses,
} from "./reference-provider-health";

const completeConfiguration = {
  cloudflareAccountId: "account_123",
  cloudflareApiToken: "<cloudflare-api-token>",
  perplexityApiKey: "<perplexity-api-key>",
  geminiApiKey: "<gemini-api-key>",
  presentonBaseUrl: "http://127.0.0.1:5050",
  presentonAuthUsername: "renderer-admin",
  presentonAuthPassword: "<presenton-auth-password>",
  presentonTemplate: "bestdecks_inline_vector_v1",
  allowPrivateProviderUrls: true,
};

test("reference provider status validates configuration without making requests", () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("Provider health configuration validation must remain offline.");
  }) as typeof fetch;

  try {
    const statuses = buildReferenceProviderStatuses(completeConfiguration);
    assert.equal(statuses.length, 5);
    assert.ok(statuses.every(({ health }) => health.configured));
    assert.ok(statuses.every(({ health }) => health.reachable === null));
    assert.ok(statuses.every(({ health }) => health.liveSmokePassed === null));
    assert.equal(fetchCount, 0);

    const serialized = JSON.stringify(statuses);
    for (const secret of [
      "<cloudflare-api-token>",
      "<perplexity-api-key>",
      "<gemini-api-key>",
      "<presenton-auth-password>",
    ]) {
      assert.doesNotMatch(serialized, new RegExp(secret, "u"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("experimental provider status is constructor-valid only and remains offline", () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("Offline status must not contact experimental providers.");
  }) as typeof fetch;

  try {
    const configuration = {
      deepcrawlApiKey: "<deepcrawl-api-key>",
      alaiApiKey: "<alai-api-key>",
      plusAiApiKey: "<plus-ai-api-key>",
      geminiApiKey: "<gemini-api-key>",
    };
    const statuses = buildExperimentalProviderStatuses(configuration);
    assert.equal(statuses.length, 4);
    assert.ok(statuses.every(({ health }) => health.configured));
    assert.ok(statuses.every(({ health }) => health.reachable === null));
    assert.ok(statuses.every(({ health }) => health.liveSmokePassed === null));
    assert.equal(fetchCount, 0);
    assert.equal(buildAllProviderStatuses({
      ...completeConfiguration,
      ...configuration,
    }).length, 9);

    const serialized = JSON.stringify(statuses);
    for (const value of Object.values(configuration)) {
      assert.doesNotMatch(serialized, new RegExp(value, "u"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("experimental provider status fails closed for missing configuration", () => {
  const statuses = buildExperimentalProviderStatuses({});
  assert.equal(statuses.length, 4);
  assert.ok(statuses.every(({ health }) => !health.configured));
  assert.ok(statuses.every(({ health }) => health.reachable === null));
  assert.ok(statuses.every(({ health }) => health.liveSmokePassed === null));
});

test("reference provider status fails closed on partial or invalid configuration", () => {
  const partial = buildReferenceProviderStatuses({
    ...completeConfiguration,
    cloudflareApiToken: undefined,
    presentonAuthPassword: undefined,
  });
  assert.equal(partial[0]?.health.configured, false);
  assert.equal(partial[4]?.health.configured, false);
  assert.deepEqual(partial[4]?.health, {
    configured: false,
    reachable: null,
    liveSmokePassed: null,
  });

  const invalidSelfHosted = buildReferenceProviderStatuses({
    ...completeConfiguration,
    presentonBaseUrl: "https://api.presenton.ai",
  });
  assert.equal(invalidSelfHosted[4]?.health.configured, false);
});
