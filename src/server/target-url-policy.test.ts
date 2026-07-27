import assert from "node:assert/strict";
import test from "node:test";

import {
  TargetUrlPolicyError,
  validateTargetTransportApproval,
  validatePublicTargetUrl,
  validatePublicTargetUrls,
} from "./target-url-policy";

const resolver = async (hostname: string) =>
  hostname === "public.example" ? ["8.8.8.8"] : ["169.254.169.254"];

test("target policy accepts public HTTPS and rejects HTTP, private, or special-use destinations", async () => {
  await validatePublicTargetUrl("https://public.example/path", { resolver });

  for (const candidate of [
    "http://public.example/path",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "https://private.example/",
  ]) {
    await assert.rejects(
      () => validatePublicTargetUrl(candidate, { resolver }),
      TargetUrlPolicyError,
      candidate,
    );
  }
});

test("target policy validates a batch without dropping a rejected entry", async () => {
  await assert.rejects(
    () => validatePublicTargetUrls([
      "https://public.example/one",
      "https://private.example/two",
    ], { resolver }),
    TargetUrlPolicyError,
  );
});

test("the crawl-failure exception never authorizes plaintext HTTP", () => {
  validateTargetTransportApproval("https://public.example/path", false);
  assert.throws(
    () => validateTargetTransportApproval("http://public.example/path", false),
    TargetUrlPolicyError,
  );
  assert.throws(
    () => validateTargetTransportApproval("http://public.example/path", true),
    TargetUrlPolicyError,
  );
});
