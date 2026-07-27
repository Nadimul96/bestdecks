import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Strix workflow treats the manual budget as validated data, not shell source", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/strix.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /MAX_BUDGET_USD: \$\{\{ inputs\.max_budget_usd \}\}/);
  assert.match(workflow, /\[\[ ! "\$\{MAX_BUDGET_USD\}" =~ \^\[0-9\]\+\(\[\.\]\[0-9\]\{1,2\}\)\?\$ \]\]/);
  assert.match(workflow, /--max-budget-usd "\$\{MAX_BUDGET_USD\}"/);
  assert.doesNotMatch(workflow, /--max-budget-usd "\$\{\{ inputs\.max_budget_usd \}\}"/);
});
