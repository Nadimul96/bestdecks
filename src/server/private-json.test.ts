import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { privateJson } from "./private-json";

test("privateJson prevents storage of sensitive API responses", async () => {
  const response = privateJson(
    { ok: true },
    { headers: { "Retry-After": "60" }, status: 429 },
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.deepEqual(await response.json(), { ok: true });
});

test("authenticated GET routes use the private JSON response helper", async () => {
  const routes = [
    "app/api/businesses/route.ts",
    "app/api/onboarding/questionnaire/route.ts",
    "app/api/onboarding/seller-context/route.ts",
    "app/api/onboarding/audience-context/route.ts",
    "app/api/onboarding/seller-brief/route.ts",
    "app/api/health/readiness/route.ts",
  ];

  await Promise.all(routes.map(async (route) => {
    const source = await readFile(new URL(`../../${route}`, import.meta.url), "utf8");
    assert.match(source, /import \{ privateJson \} from "@\/src\/server\/private-json"/);
    assert.match(source, /export async function GET\(\)[\s\S]*privateJson/);
  }));
});
