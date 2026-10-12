import assert from "node:assert/strict";
import test from "node:test";

import { envSchema } from "@/src/config/env";

import { buildDoctorReport, formatDoctorReport } from "./doctor-report";

const freePath = envSchema.parse({
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: "doctor-test-secret-auth-0000000000000000",
  APP_SECRETS_KEY: "doctor-test-key-encryption-000000000000000",
  ALLOW_SHARED_PROVIDER_CREDENTIALS: "1",
  BESTDECKS_COMMIT_SHA: "abcdef123456",
  GEMINI_API_KEY: "doctor-test-key-gemini",
  PRESENTON_BASE_URL: "http://localhost:5050",
  PRESENTON_AUTH_USERNAME: "bestdecks",
  PRESENTON_AUTH_PASSWORD: "doctor-test-secret-presenton",
});

test("doctor reports a one-key free install as ready without echoing secrets", () => {
  const report = buildDoctorReport(freePath);
  assert.equal(report.ready, true);
  assert.equal(report.selection.crawl.provider, "builtin");
  assert.equal(report.selection.research.provider, "site");

  const text = formatDoctorReport(report) + JSON.stringify(report);
  for (const secret of ["doctor-test-secret-auth", "doctor-test-key-gemini", "doctor-test-secret-presenton"]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.match(formatDoctorReport(report), /^Ready\./mu);
});

test("doctor names each missing item and how to fix it", () => {
  const report = buildDoctorReport(envSchema.parse({ NODE_ENV: "development" }));
  assert.equal(report.ready, false);
  const missing = report.checks.filter((check) => !check.ok).map((check) => check.id);
  assert.deepEqual(missing, [
    "auth-secret",
    "secrets-key",
    "shared-credentials",
    "commit-sha",
    "research",
    "gemini",
    "renderer",
  ]);
  const text = formatDoctorReport(report);
  assert.match(text, /\[ok\] Crawler: built-in \(no key needed\)/u);
  assert.match(text, /aistudio\.google\.com\/apikey/u);
});

test("doctor follows an explicit paid provider choice", () => {
  const report = buildDoctorReport(envSchema.parse({
    ...freePath,
    CRAWL_PROVIDER: "cloudflare",
    RESEARCH_PROVIDER: "perplexity",
  }));
  assert.equal(report.checks.find((check) => check.id === "crawl")?.ok, false);
  assert.equal(report.checks.find((check) => check.id === "research")?.ok, false);
});
