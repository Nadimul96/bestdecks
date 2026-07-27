import test from "node:test";
import assert from "node:assert/strict";

import { isTrustedMutationRequest, resolveRequestOrigin } from "./request-origin";

test("resolveRequestOrigin ignores attacker-controlled origin headers", () => {
  const request = new Request("https://app.bestdecks.co/api/runs/test/step", {
    headers: {
      origin: "https://attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(resolveRequestOrigin(request), "https://app.bestdecks.co");
});

test("resolveRequestOrigin falls back to request.url origin", () => {
  const request = new Request("http://localhost:3000/api/runs/test/step");

  assert.equal(resolveRequestOrigin(request), "http://localhost:3000");
});

test("mutation origin guard accepts only the exact application origin", () => {
  const url = "https://app.bestdecks.co/api/runs";
  assert.equal(isTrustedMutationRequest(new Request(url, {
    method: "POST",
    headers: { origin: "https://app.bestdecks.co" },
  })), true);
  assert.equal(isTrustedMutationRequest(new Request(url, {
    method: "POST",
    headers: { origin: "https://evil.bestdecks.co", "sec-fetch-site": "same-site" },
  })), false);
  assert.equal(isTrustedMutationRequest(new Request(url, {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  })), false);
  assert.equal(isTrustedMutationRequest(new Request(url, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  })), true);
  assert.equal(isTrustedMutationRequest(new Request(url, { method: "GET" })), true);
});

test("mutation origin guard accepts a configured public origin behind a TLS proxy", () => {
  const internalUrl = "http://app:3000/api/runs";
  const publicOrigin = "https://app.bestdecks.co";

  assert.equal(isTrustedMutationRequest(new Request(internalUrl, {
    method: "POST",
    headers: {
      origin: publicOrigin,
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    },
  }), publicOrigin), true);

  assert.equal(isTrustedMutationRequest(new Request(internalUrl, {
    method: "POST",
    headers: { origin: "https://evil.bestdecks.co" },
  }), publicOrigin), false);
});
