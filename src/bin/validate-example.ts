import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { intakeRunSchema } from "../domain/schemas";

async function main() {
  const filePath = resolve(process.cwd(), "examples/run-input.example.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const result = intakeRunSchema.parse(parsed);

  console.log(
    JSON.stringify(
      {
        valid: true,
        targets: result.targets.length,
        outputFormat: result.questionnaire.outputFormat,
      },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error("Example run input validation failed.");
  process.exitCode = 1;
});
