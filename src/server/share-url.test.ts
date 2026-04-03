import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicShareUrl,
  resolvePublicShareOrigin,
} from "./share-url";

test("resolvePublicShareOrigin collapses console subdomains in production-style requests", () => {
  const request = new Request("https://console.bestdecks.co/api/delivery/target/share");

  assert.equal(resolvePublicShareOrigin(request), "https://bestdecks.co");
  assert.equal(buildPublicShareUrl(request, "abc12345"), "https://bestdecks.co/share/abc12345");
});

test("resolvePublicShareOrigin keeps localhost origins during local development", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "development";

  try {
    const request = new Request("http://localhost:3000/api/delivery/target/share");
    assert.equal(resolvePublicShareOrigin(request), "http://localhost:3000");
  } finally {
    env.NODE_ENV = previousNodeEnv;
  }
});
