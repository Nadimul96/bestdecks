// Container entrypoint for the root docker-compose.yml.
//
// Fills secrets and the admin account that the operator did not set in .env
// from the values the first-run service generated, fills BESTDECKS_COMMIT_SHA
// from the build, and then imports the real entry module in-process (so
// signals and exit codes behave exactly as if it were started directly).
// Values set in the environment always win; nothing is printed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SECRETS_PATH = "/run/bestdecks/secrets.json";
const COMMIT_PATH = "/app/.bestdecks-commit";
const GENERATED_NAMES = [
  "BETTER_AUTH_SECRET",
  "APP_SECRETS_KEY",
  "PRESENTON_AUTH_PASSWORD",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
];

const [target, ...rest] = process.argv.slice(2);
if (!target) {
  console.error("Usage: node docker-entrypoint.mjs <entry-module> [...args]");
  process.exit(2);
}

if (existsSync(SECRETS_PATH)) {
  const generated = JSON.parse(readFileSync(SECRETS_PATH, "utf8"));
  for (const name of GENERATED_NAMES) {
    if (!process.env[name] && typeof generated[name] === "string") {
      process.env[name] = generated[name];
    }
  }
}

if (!process.env.BESTDECKS_COMMIT_SHA && existsSync(COMMIT_PATH)) {
  const commit = readFileSync(COMMIT_PATH, "utf8").trim().toLowerCase();
  if (/^[a-f0-9]{7,64}$/u.test(commit)) process.env.BESTDECKS_COMMIT_SHA = commit;
}

const entry = resolve(target);
process.argv = [process.argv[0], entry, ...rest];
await import(pathToFileURL(entry).href);
