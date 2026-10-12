import assert from "node:assert/strict";
import test from "node:test";

import { ProviderAdapterError } from "@/src/integrations/provider-contract";
import { describeRunFailure } from "@/src/server/run-failure-guidance";

const EVENT_MESSAGE_LIMIT = 256;
const DIAGNOSTIC_CODE_ALLOWANCE = 60;

test("a rejected Gemini key names GEMINI_API_KEY and where to get one", () => {
  const error = new ProviderAdapterError(
    "bestdecks.site-research",
    "First-party site research",
    "enrich",
    "authentication",
    false,
    400,
  );
  const message = describeRunFailure(error);
  assert.ok(message);
  assert.match(message, /^Gemini rejected the configured credentials\. Set GEMINI_API_KEY in \.env/u);
  assert.match(message, /aistudio\.google\.com\/apikey/u);
});

test("a missing provider names the variables to set", () => {
  const missing = Object.assign(new Error("incomplete"), { code: "configuration", component: "gemini" });
  assert.match(describeRunFailure(missing) ?? "", /^Gemini is not configured\. Set GEMINI_API_KEY/u);
  const cloudflare = Object.assign(new Error("incomplete"), { code: "configuration", component: "cloudflare" });
  assert.match(describeRunFailure(cloudflare) ?? "", /CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN/u);
});

test("every guidance message leaves room for the diagnostic code in a run event", () => {
  const cases = [
    ...["gemini", "perplexity", "cloudflare", "presenton", "commit_sha"].map((component) =>
      Object.assign(new Error("x"), { code: "configuration", component })),
    ...[
      "bestdecks.site-research",
      "google.gemini.generate-content.slide-plan",
      "perplexity.sonar.enrichment",
      "cloudflare.browser-rendering.crawl",
      "presenton.render-only",
    ].map((providerId) => Object.assign(new Error("x"), { code: "authentication", providerId })),
  ];
  for (const error of cases) {
    const message = describeRunFailure(error);
    assert.ok(message, `expected guidance for ${JSON.stringify(error)}`);
    assert.ok(message.length <= EVENT_MESSAGE_LIMIT - DIAGNOSTIC_CODE_ALLOWANCE, message);
  }
});

test("failures the operator cannot fix by configuration get no guidance", () => {
  assert.equal(describeRunFailure(new Error("boom")), null);
  assert.equal(describeRunFailure(Object.assign(new Error("x"), { code: "rate_limited", providerId: "bestdecks.site-research" })), null);
  assert.equal(describeRunFailure(Object.assign(new Error("x"), { code: "authentication", providerId: "unknown" })), null);
});
