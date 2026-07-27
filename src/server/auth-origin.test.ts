import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthBaseUrl } from "./auth-origin";

test("server auth resolves configured production origins in explicit priority order", () => {
  assert.equal(
    resolveAuthBaseUrl({
      environment: "production",
      betterAuthUrl: "https://auth.example.com",
      renderExternalUrl: "https://render.example.com",
      vercelUrl: "deployment.vercel.app",
    }),
    "https://auth.example.com",
  );
  assert.equal(
    resolveAuthBaseUrl({
      environment: "production",
      renderExternalUrl: "https://render.example.com",
    }),
    "https://render.example.com",
  );
  assert.equal(
    resolveAuthBaseUrl({
      environment: "production",
      vercelUrl: "deployment.vercel.app",
    }),
    "https://deployment.vercel.app",
  );
});

test("server auth rejects unsafe production origins and missing configuration", () => {
  assert.throws(
    () => resolveAuthBaseUrl({
      environment: "production",
      betterAuthUrl: "http://localhost:3000",
    }),
    /BETTER_AUTH_URL/u,
  );
  assert.throws(
    () => resolveAuthBaseUrl({
      environment: "production",
      vercelUrl: "deployment.vercel.app/path",
    }),
    /VERCEL_URL/u,
  );
  assert.throws(
    () => resolveAuthBaseUrl({ environment: "production" }),
    /required in production/u,
  );
});

test("server auth permits loopback HTTP only outside production", () => {
  assert.equal(
    resolveAuthBaseUrl({
      environment: "development",
      betterAuthUrl: "http://127.0.0.1:4010",
    }),
    "http://127.0.0.1:4010",
  );
  assert.equal(
    resolveAuthBaseUrl({ environment: "test", port: "4310" }),
    "http://localhost:4310",
  );
  assert.throws(
    () => resolveAuthBaseUrl({ environment: "development", port: "70000" }),
    /PORT/u,
  );
});
