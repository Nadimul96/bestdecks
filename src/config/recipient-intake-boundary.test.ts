import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepositoryFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("run admission delegates CSV semantics to the canonical intake parser", () => {
  const runRoute = readRepositoryFile("app/api/runs/route.ts");

  assert.match(runRoute, /parseTargetsFromIntakeDraft/u);
  assert.doesNotMatch(runRoute, /\.split\(["']?,["']?\)/u);
});

test("active target-intake surfaces do not advertise recipient-email columns", () => {
  for (const path of [
    "components/setup-wizard.tsx",
    "components/workspace/views/onboarding-view.tsx",
    "components/workspace/views/target-intake-view.tsx",
  ]) {
    const source = readRepositoryFile(path);
    assert.match(source, /TARGET_CSV_COLUMNS/u, path);
    assert.match(source, /recipient-email/iu, path);
    assert.doesNotMatch(
      source,
      /websiteUrl,firstName,lastName,role,email/u,
      path,
    );
  }
});
