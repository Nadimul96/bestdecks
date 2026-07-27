import assert from "node:assert/strict";
import test from "node:test";

import { onboardingPayloadSchema, questionnaireDraftSchema } from "./onboarding";

test("onboarding accepts bounded draft state and explicit provider contracts", () => {
  const parsed = onboardingPayloadSchema.parse({
    profile: { companyName: "Example" },
    questionnaire: { outputFormat: "pptx", audience: "Revenue leaders" },
    integrations: [
      {
        provider: "cloudflare",
        config: { accountId: "account-fixture" },
        secret: "secret-fixture",
      },
      {
        provider: "presenton",
        config: {
          baseUrl: "https://renderer.example.test",
          authMode: "basic",
          username: "renderer-user",
        },
      },
    ],
  });

  assert.equal(parsed.questionnaire?.outputFormat, "pptx");
  assert.equal(parsed.integrations?.length, 2);
});

test("onboarding rejects unknown fields, arbitrary provider config, and duplicate providers", () => {
  for (const payload of [
    { profile: {}, unexpected: true },
    {
      profile: {},
      integrations: [{ provider: "gemini", config: { endpoint: "https://attacker.test" } }],
    },
    {
      profile: {},
      integrations: [
        { provider: "perplexity", secret: "one" },
        { provider: "perplexity", secret: "two" },
      ],
    },
    {
      profile: {},
      integrations: [{ provider: "unknown", secret: "fixture" }],
    },
    {
      profile: {},
      integrations: [{
        provider: "presenton",
        config: { baseUrl: "https://renderer.example.test?token=must-not-be-stored" },
      }],
    },
  ]) {
    assert.equal(onboardingPayloadSchema.safeParse(payload).success, false);
  }
});

test("secret revocation is explicit and mutually exclusive with replacement", () => {
  assert.equal(onboardingPayloadSchema.safeParse({
    profile: {},
    integrations: [{ provider: "gemini", secret: "new", clearSecret: true }],
  }).success, false);

  assert.equal(onboardingPayloadSchema.safeParse({
    profile: {},
    integrations: [{ provider: "gemini", clearSecret: true }],
  }).success, true);
});

test("Presenton config patches defer effective authentication checks to persistence", () => {
  for (const config of [
    { authMode: "basic" },
    { username: "renderer-user" },
    { template: "modern" },
  ]) {
    assert.equal(onboardingPayloadSchema.safeParse({
      profile: {},
      integrations: [{ provider: "presenton", config }],
    }).success, true);
  }

  assert.equal(onboardingPayloadSchema.safeParse({
    profile: {},
    integrations: [{
      provider: "presenton",
      clearConfig: true,
      config: { authMode: "bearer", baseUrl: "https://api.presenton.ai" },
      secret: "replacement-fixture",
    }],
  }).success, true);
});

test("questionnaire drafts retain empty UI fields but enforce bounds and enums", () => {
  assert.equal(questionnaireDraftSchema.safeParse({
    audience: "",
    outputFormat: "pdf",
    desiredCardCount: 4,
  }).success, true);
  assert.equal(questionnaireDraftSchema.safeParse({ outputFormat: "html" }).success, false);
  assert.equal(questionnaireDraftSchema.safeParse({ desiredCardCount: 1000 }).success, false);
  assert.equal(questionnaireDraftSchema.safeParse({ audience: "x".repeat(2_001) }).success, false);
});

test("onboarding validates target CSV before it can reach persistence", () => {
  assert.equal(onboardingPayloadSchema.safeParse({
    profile: {},
    intakeDraft: {
      contactsCsvText:
        `website,company,notes\nacme.com,"Acme, Inc.","Uses ""quoted"", notes"`,
    },
  }).success, true);

  for (const contactsCsvText of [
    "website,recipient_email\nacme.com,fixture-value",
    "website,phone\nacme.com,fixture-value",
    `website,notes\nacme.com,"unbalanced`,
    "website,notes\nacme.com",
    "company,notes\nAcme,Missing website",
  ]) {
    assert.equal(onboardingPayloadSchema.safeParse({
      profile: {},
      intakeDraft: { contactsCsvText },
    }).success, false);
  }
});
