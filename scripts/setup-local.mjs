#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDirectory = process.cwd();
const templatePath = resolve(rootDirectory, ".env.example");
const outputPath = resolve(rootDirectory, ".env.local");
const presentonImage = "ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88";

function randomSecret() {
  return randomBytes(48).toString("base64url");
}

function currentCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function replaceValue(contents, name, value) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  if (!expression.test(contents)) {
    throw new Error(`The configuration template is missing ${name}.`);
  }
  return contents.replace(expression, `${name}=${value}`);
}

function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
    console.log("Usage: pnpm setup\n\nCreates .env.local once, with independent local secrets. It never overwrites an existing file.");
    return;
  }
  if (argumentsList.length > 0) {
    throw new Error("This command does not accept arguments. Run pnpm setup to create .env.local.");
  }

  if (!existsSync(templatePath)) {
    throw new Error(".env.example is required to create local configuration.");
  }
  if (existsSync(outputPath)) {
    const detail = lstatSync(outputPath).isSymbolicLink()
      ? ".env.local is a symlink"
      : ".env.local already exists";
    throw new Error(`${detail}; preserve it and edit it in place instead.`);
  }

  let contents = readFileSync(templatePath, "utf8");
  const values = {
    BESTDECKS_COMMIT_SHA: currentCommitSha(),
    PRESENTON_IMAGE: presentonImage,
    PRESENTON_AUTH_USERNAME: "bestdecks",
    PRESENTON_AUTH_PASSWORD: randomSecret(),
    ALLOW_SHARED_PROVIDER_CREDENTIALS: "1",
    BETTER_AUTH_SECRET: randomSecret(),
    APP_SECRETS_KEY: randomSecret(),
    LOCAL_DB_PATH: ".data/custom-proposals.sqlite",
  };

  for (const [name, value] of Object.entries(values)) {
    contents = replaceValue(contents, name, value);
  }

  writeFileSync(outputPath, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log("Created .env.local with independent local secrets and the pinned Presenton image.");
  console.log("Next: add your Cloudflare, Perplexity, and Gemini credentials, then run pnpm install.");
  console.log("This setup enables process-level provider credentials for a single-user local instance. Set ALLOW_SHARED_PROVIDER_CREDENTIALS=0 before multi-user hosting.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? `Local setup failed: ${error.message}` : "Local setup failed.");
  process.exitCode = 1;
}
