import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TARGETS_PER_RUN,
  companyRowSchema,
  intakeRunSchema,
} from "./schemas";

const sellerContext = {
  companyName: "Seller",
  offerSummary: "A documented offer",
  services: ["Service"],
  differentiators: ["Differentiator"],
  targetCustomer: "Operators",
  desiredOutcome: "A measurable result",
};

const questionnaire = {
  archetype: "cold_outreach" as const,
  audience: "Operators",
  objective: "Start a conversation",
  callToAction: "Book a call",
  outputFormat: "pptx" as const,
  desiredCardCount: 8,
  tone: "consultative" as const,
  visualStyle: "auto" as const,
  imagePolicy: "auto" as const,
};

test("the OSS run limit accepts exactly the canonical maximum", () => {
  const targets = Array.from({ length: MAX_TARGETS_PER_RUN }, (_, index) =>
    companyRowSchema.parse({ websiteUrl: `https://target-${index}.example` }),
  );

  assert.equal(
    intakeRunSchema.parse({ sellerContext, questionnaire, targets }).targets.length,
    MAX_TARGETS_PER_RUN,
  );
});

test("the OSS run limit rejects one target above the canonical maximum", () => {
  const targets = Array.from({ length: MAX_TARGETS_PER_RUN + 1 }, (_, index) => ({
    websiteUrl: `https://target-${index}.example`,
  }));

  assert.equal(
    intakeRunSchema.safeParse({ sellerContext, questionnaire, targets }).success,
    false,
  );
});

test("target schemas reject non-web, credential-bearing, local, and oversized values", () => {
  for (const websiteUrl of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "https://localhost/admin",
    "https://service.internal/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "not a url",
    "",
  ]) {
    assert.doesNotThrow(() => companyRowSchema.safeParse({ websiteUrl }), websiteUrl);
    assert.equal(companyRowSchema.safeParse({ websiteUrl }).success, false, websiteUrl);
  }
  assert.equal(
    companyRowSchema.safeParse({
      websiteUrl: "https://public.example/",
      notes: "x".repeat(5_001),
    }).success,
    false,
  );
});

test("custom style controls are never accepted without their bounded instruction", () => {
  const target = { websiteUrl: "https://target.example" };
  assert.equal(intakeRunSchema.safeParse({
    sellerContext,
    questionnaire: { ...questionnaire, tone: "custom" },
    targets: [target],
  }).success, false);
  assert.equal(intakeRunSchema.safeParse({
    sellerContext,
    questionnaire: {
      ...questionnaire,
      tone: "custom",
      customTone: "Warm, concise, and evidence-first.",
    },
    targets: [target],
  }).success, true);
  assert.equal(intakeRunSchema.safeParse({
    sellerContext,
    questionnaire: { ...questionnaire, customTone: "Ignored hidden instruction" },
    targets: [target],
  }).success, false);
  assert.equal(intakeRunSchema.safeParse({
    sellerContext,
    questionnaire: { ...questionnaire, visualStyle: "custom" },
    targets: [target],
  }).success, false);
  assert.equal(intakeRunSchema.safeParse({
    sellerContext,
    questionnaire: {
      ...questionnaire,
      visualStyle: "custom",
      customVisualStyle: "Sparse navy layouts with high-contrast type.",
    },
    targets: [target],
  }).success, true);
});
