#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const rootDirectory = process.cwd();
const environmentPath = resolve(rootDirectory, ".env.local");
const helperPath = resolve(rootDirectory, "scripts/start-presenton.sh");
const environment = { ...process.env };

// dotenv parses configuration data; unlike shell sourcing, it never evaluates
// substitutions, command invocations, or any other executable shell syntax.
if (existsSync(environmentPath)) {
  const values = parse(readFileSync(environmentPath, "utf8"));
  for (const [name, value] of Object.entries(values)) {
    if (environment[name] === undefined) environment[name] = value;
  }
}

const child = spawn("bash", [helperPath], { env: environment, stdio: "inherit" });
child.once("error", (error) => {
  console.error(`Could not start the renderer helper: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Renderer helper terminated by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
