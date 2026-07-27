import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@libsql/client";

const databaseModuleUrl = pathToFileURL(resolve("src/server/db.ts")).href;
const authModuleUrl = pathToFileURL(resolve("src/server/auth.ts")).href;
const artifactRoot = process.env.BESTDECKS_TEST_ARTIFACT_ROOT
  ?? join(tmpdir(), "bestdecks-retained-test-artifacts");

mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });

interface SynchronizedChild {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  completed: Promise<void>;
  waitForOutput(marker: string): Promise<void>;
}

function freshDatabasePath(label: string) {
  // The project archive policy forbids deleting test artifacts. Keep each
  // concurrency database at a unique path for post-failure inspection.
  const directory = mkdtempSync(join(artifactRoot, `${label}-`));
  return join(directory, "concurrency.sqlite");
}

function spawnSynchronizedChild(
  source: string,
  databasePath: string,
  extraEnv: Record<string, string | undefined> = {},
): SynchronizedChild {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    NODE_ENV: "test",
    LOCAL_DB_PATH: databasePath,
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "a".repeat(32),
    SEED_ADMIN_ON_STARTUP: "0",
  };
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 25_000,
    },
  );

  let stdout = "";
  let stderr = "";
  let readySettled = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!readySettled && stdout.includes("READY\n")) {
      readySettled = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const completed = new Promise<void>((resolvePromise, rejectPromise) => {
    child.once("error", (error) => {
      if (!readySettled) {
        readySettled = true;
        rejectReady(error);
      }
      rejectPromise(error);
    });
    child.once("exit", (code, signal) => {
      if (!readySettled) {
        readySettled = true;
        rejectReady(new Error(`Child exited before ready (code=${code}, signal=${signal}).`));
      }
      if (code === 0 && stdout.includes("DONE\n")) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `Child failed (code=${code}, signal=${signal}). stdout=${stdout.trim()} stderr=${stderr.trim()}`,
        ),
      );
    });
  });

  const waitForOutput = (marker: string) => {
    if (stdout.includes(marker)) return Promise.resolve();
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const cleanup = () => {
        child.stdout.off("data", handleData);
        child.off("exit", handleExit);
      };
      const handleData = () => {
        if (!stdout.includes(marker)) return;
        cleanup();
        resolvePromise();
      };
      const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        rejectPromise(
          new Error(`Child exited before output ${marker.trim()} (code=${code}, signal=${signal}).`),
        );
      };
      child.stdout.on("data", handleData);
      child.once("exit", handleExit);
    });
  };

  return { child, ready, completed, waitForOutput };
}

async function releaseTogether(children: SynchronizedChild[]) {
  await Promise.all(children.map((candidate) => candidate.ready));
  for (const candidate of children) candidate.child.stdin.end("GO\n");
  await Promise.all(children.map((candidate) => candidate.completed));
}

async function releaseLeaseContenders(children: SynchronizedChild[]) {
  await Promise.all(children.map((candidate) => candidate.ready));
  for (const candidate of children) candidate.child.stdin.write("GO\n");
  await Promise.all(children.map((candidate) => candidate.waitForOutput("CONTENDING\n")));
  for (const candidate of children) candidate.child.stdin.end("ACQUIRE\n");
  await Promise.all(children.map((candidate) => candidate.completed));
}

test("the durable migration lease excludes synchronized schema work across processes", {
  timeout: 30_000,
}, async () => {
  const databasePath = freshDatabasePath("migration-lease");
  const logPath = join(dirname(databasePath), "lease-events.log");

  const source = `
    const { appendFileSync } = await import("node:fs");
    const { withDatabaseMigrationLease } = await import(${JSON.stringify(databaseModuleUrl)});
    process.stdout.write("READY\\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdout.write("CONTENDING\\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await withDatabaseMigrationLease(async () => {
      appendFileSync(
        process.env.PROBE_LOG_PATH,
        "enter:" + process.env.PROBE_WORKER_ID + "\\n",
        { encoding: "utf8", flag: "a", mode: 0o600 },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      appendFileSync(
        process.env.PROBE_LOG_PATH,
        "exit:" + process.env.PROBE_WORKER_ID + "\\n",
        { encoding: "utf8", flag: "a", mode: 0o600 },
      );
    });
    process.stdout.write("DONE\\n");
  `;

  const children = ["one", "two"].map((workerId) => spawnSynchronizedChild(
    source,
    databasePath,
    { PROBE_LOG_PATH: logPath, PROBE_WORKER_ID: workerId },
  ));
  await releaseLeaseContenders(children);

  const events = readFileSync(logPath, "utf8").trim().split("\n");
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((event) => event.split(":")[0]), ["enter", "exit", "enter", "exit"]);
  assert.equal(events[0]?.split(":")[1], events[1]?.split(":")[1]);
  assert.equal(events[2]?.split(":")[1], events[3]?.split(":")[1]);
  assert.notEqual(events[0]?.split(":")[1], events[2]?.split(":")[1]);

  const inspector = createClient({ url: `file:${databasePath}` });
  const lock = await inspector.execute(
    "SELECT owner, lease_expires_at FROM _migration_lock WHERE id = 1",
  );
  const journalMode = await inspector.execute("PRAGMA journal_mode");
  inspector.close();
  assert.equal(lock.rows[0]?.owner, null);
  assert.equal(lock.rows[0]?.lease_expires_at, null);
  assert.equal(journalMode.rows[0]?.journal_mode, "wal");
});

test("concurrent auth startup completes application and Better Auth migrations once at a time", {
  timeout: 30_000,
}, async () => {
  const databasePath = freshDatabasePath("auth-migration");
  const source = `
    const { ensureAuthDatabaseConnectionReady, ensureAuthReady } = await import(${JSON.stringify(authModuleUrl)});
    const { getDb } = await import(${JSON.stringify(databaseModuleUrl)});
    process.stdout.write("READY\\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdout.write("APP_MIGRATION_STARTED\\n");
    await getDb();
    process.stdout.write("APP_MIGRATION_DONE\\n");
    await ensureAuthDatabaseConnectionReady();
    await ensureAuthReady();
    process.stdout.write("DONE\\n");
  `;
  const children = Array.from(
    { length: 4 },
    () => spawnSynchronizedChild(source, databasePath),
  );
  await releaseTogether(children);

  const inspector = createClient({ url: `file:${databasePath}` });
  const tables = await inspector.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  const marker = await inspector.execute({
    sql: "SELECT value FROM _migration_state WHERE key = ?",
    args: ["schema_version"],
  });
  const lock = await inspector.execute(
    "SELECT owner, lease_expires_at FROM _migration_lock WHERE id = 1",
  );
  const journalMode = await inspector.execute("PRAGMA journal_mode");
  inspector.close();

  const tableNames = new Set(tables.rows.map((row) => String(row.name)));
  for (const tableName of ["user", "session", "account", "verification"]) {
    assert.ok(tableNames.has(tableName), `Missing Better Auth table: ${tableName}`);
  }
  assert.equal(marker.rows[0]?.value, "18");
  assert.equal(lock.rows[0]?.owner, null);
  assert.equal(lock.rows[0]?.lease_expires_at, null);
  assert.equal(journalMode.rows[0]?.journal_mode, "wal");
});

test("schema-current processes initialize local connection pragmas and enforce cascades", {
  timeout: 30_000,
}, async () => {
  const databasePath = freshDatabasePath("connection-pragmas");
  const bootstrap = createClient({ url: `file:${databasePath}` });
  await bootstrap.executeMultiple(`
    CREATE TABLE _migration_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO _migration_state (key, value) VALUES ('schema_version', '18');
    CREATE TABLE pragma_probe_parents (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE pragma_probe_children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES pragma_probe_parents(id) ON DELETE CASCADE
    );
    INSERT INTO pragma_probe_parents (id) VALUES ('retained-parent');
    INSERT INTO pragma_probe_children (id, parent_id)
      VALUES ('retained-child', 'retained-parent');
  `);
  bootstrap.close();

  const source = `
    const { getClient, getDb } = await import(${JSON.stringify(databaseModuleUrl)});
    process.stdout.write("READY\\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await getDb();
    const client = getClient();
    const foreignKeys = await client.execute("PRAGMA foreign_keys");
    const busyTimeout = await client.execute("PRAGMA busy_timeout");
    if (Number(foreignKeys.rows[0]?.foreign_keys) !== 1) {
      throw new Error("Foreign-key enforcement was not enabled for this process connection.");
    }
    if (Number(busyTimeout.rows[0]?.timeout) !== 5000) {
      throw new Error("The process connection did not receive the intended busy timeout.");
    }
    const transaction = await client.transaction("write");
    await transaction.execute("SELECT 1");
    await transaction.commit();
    const reopenedForeignKeys = await client.execute("PRAGMA foreign_keys");
    const reopenedBusyTimeout = await client.execute("PRAGMA busy_timeout");
    if (Number(reopenedForeignKeys.rows[0]?.foreign_keys) !== 1) {
      throw new Error("Foreign-key enforcement did not survive libSQL connection replacement.");
    }
    if (Number(reopenedBusyTimeout.rows[0]?.timeout) !== 5000) {
      throw new Error("The busy timeout did not survive libSQL connection replacement.");
    }
    if (process.env.PROBE_MUTATE === "1") {
      let rejectedOrphan = false;
      try {
        await client.execute(
          "INSERT INTO pragma_probe_children (id, parent_id) VALUES ('orphan', 'missing-parent')",
        );
      } catch {
        rejectedOrphan = true;
      }
      if (!rejectedOrphan) throw new Error("The process connection accepted an orphan row.");
      await client.execute("DELETE FROM pragma_probe_parents WHERE id = 'retained-parent'");
      const retainedChildren = await client.execute(
        "SELECT COUNT(*) AS count FROM pragma_probe_children WHERE parent_id = 'retained-parent'",
      );
      if (Number(retainedChildren.rows[0]?.count) !== 0) {
        throw new Error("The process connection did not apply ON DELETE CASCADE.");
      }
    }
    process.stdout.write("DONE\\n");
  `;
  const children = [
    spawnSynchronizedChild(source, databasePath, { PROBE_MUTATE: "1" }),
    spawnSynchronizedChild(source, databasePath, { PROBE_MUTATE: "0" }),
  ];

  await releaseTogether(children);
});
