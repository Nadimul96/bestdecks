import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrowserAuthOrigin } from "./browser-auth-origin";

test("browser auth uses a configured canonical production origin", () => {
  assert.equal(
    resolveBrowserAuthOrigin({
      environment: "production",
      configuredOrigin: "https://auth.example.com",
      currentOrigin: "https://app.example.com",
    }),
    "https://auth.example.com",
  );
});

test("browser auth uses the active loopback port during local development", () => {
  assert.equal(
    resolveBrowserAuthOrigin({
      environment: "development",
      configuredOrigin: "http://localhost:3000",
      currentOrigin: "http://127.0.0.1:4310",
    }),
    "http://127.0.0.1:4310",
  );
});

test("browser auth rejects unsafe configured and production HTTP origins", () => {
  assert.throws(
    () => resolveBrowserAuthOrigin({
      environment: "production",
      configuredOrigin: "https://user:password@auth.example.com",
      currentOrigin: "https://app.example.com",
    }),
    /NEXT_PUBLIC_BETTER_AUTH_URL/u,
  );
  assert.throws(
    () => resolveBrowserAuthOrigin({
      environment: "production",
      currentOrigin: "http://localhost:3000",
    }),
    /Browser origin/u,
  );
});

test("production SSR deliberately falls back to same-origin auth routing", () => {
  assert.equal(
    resolveBrowserAuthOrigin({ environment: "production" }),
    undefined,
  );
});
