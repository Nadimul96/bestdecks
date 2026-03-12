import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildRunPlan, summarizePlan } from "../domain/pipeline";
import { intakeRunSchema } from "../domain/schemas";

async function main() {
  const filePath = resolve(process.cwd(), "examples/run-input.example.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = intakeRunSchema.parse(JSON.parse(raw));
  const plan = buildRunPlan(parsed);

  console.log(
    JSON.stringify(
      {
        summary: summarizePlan(plan),
        firstTarget: plan.companyJobs[0],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
