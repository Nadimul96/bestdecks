import { lstat, readdir, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root")) {
  console.error("Usage: node scripts/check-standalone-boundary.mjs [--root <path>]");
  process.exit(2);
}
const root = resolve(process.cwd(), args[1] ?? ".next/standalone");
const forbiddenTopLevel = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".data",
  ".git",
  ".github",
  "app",
  "app_data",
  "components",
  "deploy",
  "dist",
  "docs",
  "examples",
  "hooks",
  "lib",
  "scripts",
  "src",
]);
const forbiddenRootFiles = new Set([
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "IMPLEMENTATION-PLAN.md",
  "PROJECT_CONTEXT.md",
  "README.md",
  "ROADMAP.md",
  "SECURITY.md",
  "next.config.ts",
  "proxy.ts",
  "render.yaml",
  "vercel.json",
]);

function isForbidden(relativePath) {
  const parts = relativePath.split(sep);
  const topLevel = parts[0] ?? "";
  const basename = parts.at(-1) ?? "";
  if (forbiddenTopLevel.has(topLevel)) return true;
  if (parts.length === 1 && forbiddenRootFiles.has(basename)) return true;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (/\.(?:sqlite|sqlite-(?:wal|shm)|db|db-(?:wal|shm))$/u.test(basename)) return true;
  if (/\.test\.[cm]?[jt]sx?$/u.test(basename)) return true;
  return false;
}

function isWithinRoot(rootPath, candidatePath) {
  const candidateRelative = relative(rootPath, candidatePath);
  return candidateRelative === ""
    || (candidateRelative !== ".." && !candidateRelative.startsWith(`..${sep}`));
}

function expectedLibsqlNativePackage() {
  if (process.platform === "darwin" && ["arm64", "x64"].includes(process.arch)) {
    return `darwin-${process.arch}`;
  }
  if (process.platform === "linux" && ["arm64", "x64"].includes(process.arch)) {
    const report = process.report?.getReport();
    const usesGlibc = Boolean(report?.header?.glibcVersionRuntime);
    return `linux-${process.arch}-${usesGlibc ? "gnu" : "musl"}`;
  }
  if (process.platform === "win32" && ["arm64", "x64"].includes(process.arch)) {
    return `win32-${process.arch}-msvc`;
  }
  throw new Error("Standalone native-package policy does not support this platform.");
}

async function collectViolations() {
  const rootRealPath = await realpath(root);
  const expectedNativePackage = expectedLibsqlNativePackage();
  const pending = [root];
  const violations = [];
  const libsqlPackages = new Set();
  const libsqlNativePackages = new Map();

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (isForbidden(relativePath)) {
        violations.push(relativePath);
        continue;
      }
      const normalized = relativePath.split(sep).join("/");
      const libsqlPackage = /^node_modules\/\.pnpm\/(libsql@[^/]+)\/node_modules\/libsql\/package\.json$/u.exec(
        normalized,
      )?.[1];
      if (libsqlPackage) libsqlPackages.add(libsqlPackage);
      const nativePackage = /^node_modules\/\.pnpm\/(libsql@[^/]+)\/node_modules\/@libsql\/([^/]+)\/index\.node$/u.exec(
        normalized,
      );
      if (nativePackage) {
        const packages = libsqlNativePackages.get(nativePackage[1]) ?? new Set();
        packages.add(nativePackage[2]);
        libsqlNativePackages.set(nativePackage[1], packages);
      }
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isSymbolicLink()) {
        const stat = await lstat(absolutePath);
        if (!stat.isSymbolicLink()) {
          throw new Error("Standalone boundary changed during verification.");
        }
        const resolvedTarget = await realpath(absolutePath);
        if (!isWithinRoot(rootRealPath, resolvedTarget)) {
          violations.push(`escaping-symlink:${relativePath}`);
        }
      }
    }
  }

  for (const packageName of libsqlPackages) {
    if (!libsqlNativePackages.get(packageName)?.has(expectedNativePackage)) {
      violations.push(`missing-native-package:${packageName}:${expectedNativePackage}`);
    }
  }
  if (libsqlPackages.size === 0) {
    violations.push("missing-runtime-package:libsql");
  }

  return violations.sort();
}

let violations;
try {
  violations = await collectViolations();
} catch {
  console.error("Standalone runtime boundary could not be verified.");
  process.exitCode = 1;
  process.exit();
}

if (violations.length > 0) {
  console.error("Standalone runtime contains forbidden project or operator state:");
  for (const path of violations) console.error(`- ${path}`);
  process.exitCode = 1;
} else {
  console.log("Standalone runtime boundary verified.");
}
