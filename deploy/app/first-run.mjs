// One-shot first-run setup for the root docker-compose.yml.
//
// 1. Generates independent random secrets once and keeps them in the
//    bestdecks-generated volume (mode 0600). Values already set in .env win.
// 2. Prepares the admin account. Production mode disables self-service
//    signup, so the app creates this account on first start. Unless .env sets
//    ADMIN_EMAIL / ADMIN_PASSWORD, it is admin@bestdecks.local with a generated
//    password that is printed once, on the run that generates it.
// 3. Prints the `pnpm doctor` checklist so `docker compose up` shows exactly
//    what is still missing. Provider keys and app secrets are never printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const SECRETS_DIR = "/run/bestdecks";
const SECRETS_PATH = `${SECRETS_DIR}/secrets.json`;
const PRESENTON_PASSWORD_PATH = `${SECRETS_DIR}/presenton-password`;
const ADMIN_PASSWORD_PATH = `${SECRETS_DIR}/admin-password`;
const GENERATED_NAMES = [
  "BETTER_AUTH_SECRET",
  "APP_SECRETS_KEY",
  "PRESENTON_AUTH_PASSWORD",
  "ADMIN_PASSWORD",
];
const DEFAULT_ADMIN_EMAIL = "admin@bestdecks.local";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function writePrivate(path, contents) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

const adminPasswordFromEnvironment = process.env.ADMIN_PASSWORD ?? "";
if (adminPasswordFromEnvironment && adminPasswordFromEnvironment.length < 12) {
  fail("ADMIN_PASSWORD in .env must be at least 12 characters (or leave it empty to have one generated).");
}

const stored = existsSync(SECRETS_PATH) ? JSON.parse(readFileSync(SECRETS_PATH, "utf8")) : {};
const secrets = {};
const generated = new Set();
for (const name of GENERATED_NAMES) {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) {
    secrets[name] = fromEnvironment;
  } else if (typeof stored[name] === "string" && stored[name]) {
    secrets[name] = stored[name];
  } else {
    // 18 bytes keeps the generated admin password typeable (24 characters).
    secrets[name] = randomBytes(name === "ADMIN_PASSWORD" ? 18 : 48).toString("base64url");
    generated.add(name);
  }
}
secrets.ADMIN_EMAIL = process.env.ADMIN_EMAIL || stored.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;

writePrivate(SECRETS_PATH, `${JSON.stringify(secrets)}\n`);
writePrivate(PRESENTON_PASSWORD_PATH, secrets.PRESENTON_AUTH_PASSWORD);
writePrivate(ADMIN_PASSWORD_PATH, `${secrets.ADMIN_PASSWORD}\n`);
console.log(generated.size > 0
  ? `First run: generated ${generated.size} local secret(s) in the bestdecks-generated volume.`
  : "Local secrets are already in place.");

const builtCommit = existsSync("/app/.bestdecks-commit")
  ? readFileSync("/app/.bestdecks-commit", "utf8").trim()
  : "";
const doctor = spawnSync(process.execPath, ["--import", "tsx", "src/bin/doctor.ts", "--compose"], {
  env: {
    ...process.env,
    ...secrets,
    BESTDECKS_COMMIT_SHA: process.env.BESTDECKS_COMMIT_SHA || builtCommit,
  },
  encoding: "utf8",
});
console.log(`\n${(doctor.stdout || "").trim()}`);
if (doctor.stderr?.trim()) console.error(doctor.stderr.trim());

const passwordLine = adminPasswordFromEnvironment
  ? "  password: the ADMIN_PASSWORD you set in .env"
  : generated.has("ADMIN_PASSWORD")
    ? `  password: ${secrets.ADMIN_PASSWORD}   (generated now and shown only this once)`
    : "  password: printed on first run; show it again with\n            docker compose exec app cat /run/bestdecks/admin-password";
console.log([
  "",
  `Bestdecks will be at ${APP_URL} once the app is healthy. Sign in with:`,
  `  email:    ${secrets.ADMIN_EMAIL}`,
  passwordLine,
].join("\n"));
