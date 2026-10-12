// One-shot first-run setup for the root docker-compose.yml.
//
// 1. Generates independent random secrets once and keeps them in the
//    bestdecks-generated volume (mode 0600). Values already set in .env win.
// 2. Checks that an admin account is configured (production mode disables
//    self-service signup, so the first account is seeded from .env).
// 3. Prints the `pnpm doctor` checklist so `docker compose up` shows exactly
//    what is still missing. Secret values are never printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const SECRETS_DIR = "/run/bestdecks";
const SECRETS_PATH = `${SECRETS_DIR}/secrets.json`;
const PRESENTON_PASSWORD_PATH = `${SECRETS_DIR}/presenton-password`;
const GENERATED_NAMES = ["BETTER_AUTH_SECRET", "APP_SECRETS_KEY", "PRESENTON_AUTH_PASSWORD"];

function writePrivate(path, contents) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

const stored = existsSync(SECRETS_PATH) ? JSON.parse(readFileSync(SECRETS_PATH, "utf8")) : {};
const secrets = {};
let generatedCount = 0;
for (const name of GENERATED_NAMES) {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) {
    secrets[name] = fromEnvironment;
  } else if (typeof stored[name] === "string" && stored[name]) {
    secrets[name] = stored[name];
  } else {
    secrets[name] = randomBytes(48).toString("base64url");
    generatedCount += 1;
  }
}
writePrivate(SECRETS_PATH, `${JSON.stringify(secrets)}\n`);
writePrivate(PRESENTON_PASSWORD_PATH, secrets.PRESENTON_AUTH_PASSWORD);
console.log(generatedCount > 0
  ? `First run: generated ${generatedCount} local secret(s) in the bestdecks-generated volume.`
  : "Local secrets are already in place.");

const adminEmail = process.env.ADMIN_EMAIL ?? "";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
if (!adminEmail || adminPassword.length < 12) {
  console.error([
    "",
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in .env, then run `docker compose up` again.",
    "That account is created on first start and is how you sign in; signup is disabled in this mode.",
  ].join("\n"));
  process.exit(1);
}

const builtCommit = existsSync("/app/.bestdecks-commit")
  ? readFileSync("/app/.bestdecks-commit", "utf8").trim()
  : "";
const doctor = spawnSync(process.execPath, ["--import", "tsx", "src/bin/doctor.ts"], {
  env: {
    ...process.env,
    ...secrets,
    BESTDECKS_COMMIT_SHA: process.env.BESTDECKS_COMMIT_SHA || builtCommit,
  },
  encoding: "utf8",
});
console.log(`\n${(doctor.stdout || "").trim()}`);
if (doctor.stderr?.trim()) console.error(doctor.stderr.trim());
console.log(`\nOpen ${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"} and sign in as ${adminEmail}.`);
