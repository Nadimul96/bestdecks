import { rewrapIntegrationSecrets } from "@/src/server/integration-secret-rotation";

const args = process.argv.slice(2);
const executeRequested = args.length === 1 && args[0] === "--execute";

if (!executeRequested) {
  console.error(
    "No changes were made. To run the transactional migration, pass exactly: --execute",
  );
  process.exitCode = 2;
} else {
  try {
    const summary = await rewrapIntegrationSecrets();
    console.log(
      `Integration secret rewrap committed: scanned=${summary.scanned} rewrapped=${summary.rewrapped} already_current=${summary.alreadyCurrent}`,
    );
  } catch {
    console.error(
      "Integration secret rewrap failed; no commit was confirmed. Inspect database state before retrying.",
    );
    process.exitCode = 1;
  }
}
