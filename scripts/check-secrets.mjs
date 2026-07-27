#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const MAX_SCANNED_BLOB_BYTES = 10 * 1024 * 1024;
const MAX_REPORTED_FINDINGS = 200;
const PRIVATE_WORKSTATION_PREFIXES = [".agents/", ".claude/", ".codex/"];

const staticRules = [
  {
    id: "private-key",
    regex: /-----BEGIN\s+(?:[A-Z0-9]+\s+)*PRIVATE KEY-----/u,
  },
  {
    id: "aws-access-key",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  },
  {
    id: "github-token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82,255})\b/u,
  },
  {
    id: "openai-token",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    id: "anthropic-token",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    id: "perplexity-token",
    regex: /\bpplx-[A-Za-z0-9]{20,}\b/u,
  },
  {
    id: "google-api-key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/u,
  },
  {
    id: "stripe-secret-key",
    regex: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/u,
  },
  {
    id: "slack-token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u,
  },
  {
    id: "npm-token",
    regex: /\bnpm_[A-Za-z0-9]{20,}\b/u,
  },
  {
    id: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  },
  {
    id: "credentialed-database-url",
    regex:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?):\/\/[^\s/:@]+:[^\s/@]+@/iu,
  },
  {
    id: "authorization-bearer",
    regex: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b/u,
  },
];

const credentialAssignment =
  /\b([A-Za-z][A-Za-z0-9_.-]{0,80}(?:api[_-]?key|private[_-]?key|secret|token|password|passwd)[A-Za-z0-9_.-]{0,40})\b\s*[:=]\s*(?:(['"`])([^'"`\r\n]{8,})\2|([^\s#;,}\]]{8,}))/giu;

const credentialAssignmentHead =
  /\b([A-Za-z][A-Za-z0-9_.-]{0,80}(?:api[_-]?key|private[_-]?key|secret|token|password|passwd)[A-Za-z0-9_.-]{0,40})\b\s*([:=])(.*)$/giu;

const quotedLiteral = /(['"`])([^'"`\r\n]{8,})\1/gu;

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "" ||
    normalized === "null" ||
    normalized === "none" ||
    normalized === "undefined" ||
    normalized.startsWith("$") ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  ) {
    return true;
  }

  return [
    "placeholder",
    "replace-me",
    "replace_me",
    "changeme",
    "change-me",
    "change_me",
    "not-a-real",
    "not_a_real",
    "ci-only",
    "ci_only",
    "test-only",
    "test_only",
    "synthetic",
    "fixture-value",
    "fixture_value",
    "your-key",
    "your_key",
    "your-secret",
    "your_secret",
    "redacted",
    "dummy-value",
    "dummy_value",
    "your-",
    "your_",
  ].some((marker) => normalized.includes(marker));
}

function isNamedTestFixture(value, path) {
  if (!/\.test\.[cm]?[jt]sx?$/iu.test(path)) return false;
  const candidate = value.trim();
  return (
    /^(?:[a-z0-9]+[-_])*(?:test|fake|mock|sample|fixture|secret|presenton|plus)[-_](?:key|token|secret)(?:[-_][a-z0-9]+)*$/iu.test(
      candidate,
    ) || /^(?:token|key|secret|password)[-_]value(?:[-_]\d+)?$/iu.test(candidate)
  );
}

function isCodeReference(value, path, isQuoted) {
  if (!/\.(?:[cm]?[jt]sx?)$/iu.test(path)) return false;
  if (!isQuoted) return true;

  const candidate = value.trim();
  return (
    /^(?:process\.env|env\.|config\.|settings\.)/u.test(candidate) ||
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/u.test(
      candidate,
    ) ||
    /^[A-Za-z_$][A-Za-z0-9_$]*\([^\r\n]*\)$/u.test(candidate) ||
    /^[A-Z][A-Z0-9_]+$/u.test(candidate)
  );
}

function isShellSyntaxReference(value, path) {
  if (!/\.(?:ba|z)?sh$/iu.test(path)) return false;

  const candidate = value.trim();
  return (
    /^['"]{0,2}\$\{[A-Z_][A-Z0-9_]*\}?["']?\$?$/u.test(candidate) ||
    /^\*\|[A-Z_][A-Z0-9_]*=\*\)$/u.test(candidate)
  );
}

function detectRuleIds(line, path) {
  const hits = new Set();

  for (const rule of staticRules) {
    const match = rule.regex.exec(line);
    rule.regex.lastIndex = 0;
    if (match && !isPlaceholder(match[0])) hits.add(rule.id);
  }

  for (const match of line.matchAll(credentialAssignment)) {
    const value = (match[3] ?? match[4] ?? "").trim();
    const isQuoted = Boolean(match[2]);
    if (
      value.length >= 8 &&
      !isPlaceholder(value) &&
      !value.startsWith(":?") &&
      !(/\.(?:ba|z)?sh$/iu.test(path) && value.startsWith("?")) &&
      !isNamedTestFixture(value, path) &&
      !isCodeReference(value, path, isQuoted) &&
      !isShellSyntaxReference(value, path)
    ) {
      hits.add("credential-assignment");
    }
  }

  for (const assignment of line.matchAll(credentialAssignmentHead)) {
    if (/\.(?:ba|z)?sh$/iu.test(path)) continue;

    const delimiter = assignment[2];
    const rawTail = assignment[3];
    const colonFallback =
      /^\s*(?:process\.env\.[A-Z0-9_]+|env\.[A-Za-z0-9_.]+)\s*(?:\?\?|\|\|)\s*(['"`])([^'"`\r\n]{8,})\1/iu.exec(
        rawTail,
      );
    const tail = delimiter === "=" ? rawTail : colonFallback?.[0] ?? "";
    for (const literal of tail.matchAll(quotedLiteral)) {
      const value = literal[2].trim();
      if (
        !isPlaceholder(value) &&
        !isNamedTestFixture(value, path) &&
        !(/\.(?:ba|z)?sh$/iu.test(path) && value.startsWith("?"))
      ) {
        hits.add("credential-assignment");
      }
    }
  }

  return [...hits].sort();
}

function safePath(path) {
  const normalized = path.replace(/[\u0000-\u001f\u007f]/gu, "?");
  if (detectRuleIds(normalized, "filename.txt").length > 0) {
    const digest = createHash("sha256").update(path).digest("hex").slice(0, 12);
    return `<redacted-path:${digest}>`;
  }
  return normalized.length > 200 ? `${normalized.slice(0, 197)}...` : normalized;
}

function isPrivateWorkstationPath(candidate) {
  const normalized = candidate.replaceAll("\\", "/").replace(/^\.\//u, "");
  return PRIVATE_WORKSTATION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function runSelfTest() {
  const cases = [
    {
      name: "clear positive",
      line: ["AK", "IA", "ABCDEFGHIJKLMNOP"].join(""),
      path: "fixture.txt",
      expected: ["aws-access-key"],
    },
    {
      name: "credential assignment",
      line: ["ADMIN_", "PASSWORD=\"", "MangoRiver9!Stone", "\""].join(""),
      path: "fixture.ts",
      expected: ["credential-assignment"],
    },
    {
      name: "credential fallback literal",
      line: [
        "const ADMIN_",
        "PASSWORD = process.env.ADMIN_PASSWORD ?? \"",
        "MangoRiver9!Stone",
        "\";",
      ].join(""),
      path: "fixture.ts",
      expected: ["credential-assignment"],
    },
    {
      name: "shell parameter reference",
      line:
        "expected_envs=$'\\nAUTH_PASSWORD='\"${PRESENTON_AUTH_PASSWORD}\"$'\\n'",
      path: "fixture.sh",
      expected: [],
    },
    {
      name: "shell case pattern",
      line: "OPENAI_API_KEY=*|OPENAI_MODEL=*)",
      path: "fixture.sh",
      expected: [],
    },
    {
      name: "shell hardcoded credential",
      line: ["ADMIN_", "PASSWORD=\"", "MangoRiver9!Stone", "\""].join(""),
      path: "fixture.sh",
      expected: ["credential-assignment"],
    },
    {
      name: "placeholder",
      line: "BETTER_AUTH_SECRET=replace-me-with-random-bytes",
      path: ".env.example",
      expected: [],
    },
    {
      name: "code reference",
      line: "secret: resolveAuthSecret()",
      path: "fixture.ts",
      expected: [],
    },
    {
      name: "missing evidence",
      line: "API_TOKEN=",
      path: ".env.example",
      expected: [],
    },
    {
      name: "malformed near miss",
      line: "AKIA-short",
      path: "fixture.txt",
      expected: [],
    },
    {
      name: "private key boundary",
      line: ["-----BEGIN ", "PRIVATE KEY", "-----"].join(""),
      path: "fixture.pem",
      expected: ["private-key"],
    },
  ];

  for (const testCase of cases) {
    const actual = detectRuleIds(testCase.line, testCase.path);
    if (actual.join("\n") !== testCase.expected.join("\n")) {
      console.error(`Secret scanner self-test failed: ${testCase.name}.`);
      process.exit(1);
    }
  }

  console.log(`Secret scanner self-test passed (${cases.length} cases).`);
}

function gitText(args, cwd, maxBuffer = 64 * 1024 * 1024) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(`Git inspection failed while running '${args[0]}'.`);
  }
}

function addFinding(findings, finding) {
  const key = [
    finding.scope,
    finding.path,
    finding.line,
    finding.rule,
    finding.blob ?? "",
  ].join("\u0000");
  if (!findings.has(key)) findings.set(key, finding);
}

function scanBuffer(buffer, context, findings) {
  const lines = buffer.toString("utf8").split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of detectRuleIds(lines[index], context.path)) {
      addFinding(findings, {
        ...context,
        line: index + 1,
        rule,
      });
    }
  }
}

function scanWorktree(root, findings) {
  const listed = gitText(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    root,
  );
  const paths = [...new Set(listed.split("\u0000").filter(Boolean))].sort();
  let scanned = 0;

  for (const path of paths) {
    const absolutePath = resolve(root, path);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
      addFinding(findings, {
        scope: "worktree",
        path,
        line: 0,
        rule: "path-outside-repository",
      });
      continue;
    }

    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      addFinding(findings, {
        scope: "worktree",
        path,
        line: 0,
        rule: "unreadable-path",
      });
      continue;
    }

    if (stat.isSymbolicLink()) {
      addFinding(findings, {
        scope: "worktree",
        path,
        line: 0,
        rule: "unscanned-symlink",
      });
      continue;
    }
    if (!stat.isFile()) continue;
    if (isPrivateWorkstationPath(path)) {
      addFinding(findings, {
        scope: "worktree",
        path,
        line: 0,
        rule: "private-workstation-state",
      });
      continue;
    }
    if (stat.size > MAX_SCANNED_BLOB_BYTES) {
      addFinding(findings, {
        scope: "worktree",
        path,
        line: 0,
        rule: "unscanned-large-file",
      });
      continue;
    }

    scanBuffer(readFileSync(absolutePath), { scope: "worktree", path }, findings);
    scanned += 1;
  }

  return scanned;
}

function parseReachableObjects(root) {
  const output = gitText(
    ["-c", "core.quotePath=false", "rev-list", "--objects", "--all"],
    root,
  );
  const objects = [];
  const pathsByOid = new Map();

  for (const line of output.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf(" ");
    const oid = separator === -1 ? line : line.slice(0, separator);
    const path = separator === -1 ? "<unknown-path>" : line.slice(separator + 1);
    if (!/^[0-9a-f]{40,64}$/u.test(oid)) {
      throw new Error("Git returned a malformed reachable object identifier.");
    }
    objects.push(oid);
    if (!pathsByOid.has(oid)) pathsByOid.set(oid, path);
  }

  return { objects: [...new Set(objects)], pathsByOid };
}

function findReachableBlobs(root, objects, pathsByOid, findings) {
  const checked = spawnSync(
    "git",
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    {
      cwd: root,
      input: `${objects.join("\n")}\n`,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (checked.status !== 0 || checked.error) {
    throw new Error("Git object metadata inspection failed.");
  }

  const blobs = [];
  for (const line of checked.stdout.trim().split("\n")) {
    if (!line) continue;
    const [oid, type, sizeText] = line.split(" ");
    const size = Number.parseInt(sizeText, 10);
    if (type !== "blob") continue;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Git returned an invalid blob size.");
    }

    const path = pathsByOid.get(oid) ?? "<unknown-path>";
    if (isPrivateWorkstationPath(path)) {
      addFinding(findings, {
        scope: "history",
        path,
        line: 0,
        rule: "private-workstation-state",
        blob: oid.slice(0, 12),
      });
      continue;
    }
    if (size > MAX_SCANNED_BLOB_BYTES) {
      addFinding(findings, {
        scope: "history",
        path,
        line: 0,
        rule: "unscanned-large-blob",
        blob: oid.slice(0, 12),
      });
      continue;
    }
    blobs.push({ oid, path, size });
  }

  return blobs;
}

async function scanHistory(root, findings) {
  const { objects, pathsByOid } = parseReachableObjects(root);
  const blobs = findReachableBlobs(root, objects, pathsByOid, findings);
  if (blobs.length === 0) return 0;

  const child = spawn("git", ["cat-file", "--batch"], {
    cwd: root,
    stdio: ["pipe", "pipe", "ignore"],
  });
  let buffer = Buffer.alloc(0);
  let expectedBody = null;
  let blobIndex = 0;
  let parseError = null;

  child.stdout.on("data", (chunk) => {
    if (parseError) return;
    buffer = Buffer.concat([buffer, chunk]);

    try {
      while (true) {
        if (!expectedBody) {
          const newline = buffer.indexOf(0x0a);
          if (newline === -1) break;
          const header = buffer.subarray(0, newline).toString("utf8");
          buffer = buffer.subarray(newline + 1);
          const [oid, type, sizeText] = header.split(" ");
          const expected = blobs[blobIndex];
          if (
            !expected ||
            oid !== expected.oid ||
            type !== "blob" ||
            Number.parseInt(sizeText, 10) !== expected.size
          ) {
            throw new Error("Git returned an unexpected blob header.");
          }
          expectedBody = expected;
        }

        if (buffer.length < expectedBody.size + 1) break;
        const body = buffer.subarray(0, expectedBody.size);
        if (buffer[expectedBody.size] !== 0x0a) {
          throw new Error("Git returned a malformed blob boundary.");
        }
        buffer = buffer.subarray(expectedBody.size + 1);
        scanBuffer(
          body,
          {
            scope: "history",
            path: expectedBody.path,
            blob: expectedBody.oid.slice(0, 12),
          },
          findings,
        );
        blobIndex += 1;
        expectedBody = null;
      }
    } catch (error) {
      parseError = error;
      child.kill("SIGTERM");
    }
  });

  const closed = new Promise((resolveClose, rejectClose) => {
    child.once("error", rejectClose);
    child.once("close", (code, signal) => resolveClose({ code, signal }));
  });
  child.stdin.end(`${blobs.map((blob) => blob.oid).join("\n")}\n`);
  const result = await closed;

  if (parseError) throw parseError;
  if (result.code !== 0) {
    throw new Error("Git blob inspection failed.");
  }
  if (blobIndex !== blobs.length || expectedBody || buffer.length !== 0) {
    throw new Error("Git blob inspection ended before every blob was scanned.");
  }

  return blobIndex;
}

function printFindings(findings) {
  const ordered = [...findings.values()].sort((left, right) => {
    const leftKey = [left.scope, left.path, left.line, left.rule, left.blob ?? ""].join(
      "\u0000",
    );
    const rightKey = [right.scope, right.path, right.line, right.rule, right.blob ?? ""].join(
      "\u0000",
    );
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  console.error(
    `Potential secret, private workstation state, or unscanned boundary was found (${ordered.length} finding${ordered.length === 1 ? "" : "s"}).`,
  );
  console.error("Matched values are intentionally never printed.");

  for (const finding of ordered.slice(0, MAX_REPORTED_FINDINGS)) {
    const location = `${safePath(finding.path)}${finding.line > 0 ? `:${finding.line}` : ""}`;
    const blob = finding.blob ? ` (blob ${finding.blob})` : "";
    console.error(`- [${finding.rule}] ${finding.scope}:${location}${blob}`);
  }
  if (ordered.length > MAX_REPORTED_FINDINGS) {
    console.error(
      `- ${ordered.length - MAX_REPORTED_FINDINGS} additional redacted finding(s) omitted.`,
    );
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(["--history", "--self-test", "--worktree"]);
  if ([...args].some((arg) => !allowed.has(arg))) {
    console.error(
      "Usage: node scripts/check-secrets.mjs [--worktree] [--history] [--self-test]",
    );
    process.exit(2);
  }
  if (args.has("--self-test")) {
    if (args.size !== 1) {
      console.error("--self-test cannot be combined with repository scan modes.");
      process.exit(2);
    }
    runSelfTest();
    return;
  }

  const scanExplicitMode = args.has("--worktree") || args.has("--history");
  const scanCurrentWorktree = !scanExplicitMode || args.has("--worktree");
  const scanGitHistory = !scanExplicitMode || args.has("--history");
  const root = gitText(["rev-parse", "--show-toplevel"], process.cwd()).trim();
  const findings = new Map();
  let worktreeFiles = 0;
  let historyBlobs = 0;

  if (scanCurrentWorktree) worktreeFiles = scanWorktree(root, findings);
  if (scanGitHistory) historyBlobs = await scanHistory(root, findings);

  console.log(
    `Secret scan inspected ${worktreeFiles} worktree file(s) and ${historyBlobs} reachable Git blob(s).`,
  );
  if (findings.size > 0) {
    printFindings(findings);
    process.exit(1);
  }

  console.log("Security scan passed; no configured credential pattern or private workstation state matched.");
}

main().catch((error) => {
  console.error(
    `Secret scan could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exit(2);
});
