import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getClient, getDb, initializeLocalDatabaseConnection } = await import("./db");

// Seed the exact provider-global shape shipped by schema v10 before getDb()
// performs migrations. The legacy rows stay in-memory for the process lifetime;
// no destructive cleanup is needed or permitted.
const preMigrationClient = getClient();
await preMigrationClient.executeMultiple(`
  CREATE TABLE integration_settings (
    provider TEXT PRIMARY KEY,
    user_id TEXT,
    display_name TEXT,
    config_json TEXT,
    secret_ciphertext TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
await preMigrationClient.execute({
  sql: `INSERT INTO integration_settings (
          provider, user_id, display_name, secret_ciphertext, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
  args: ["legacy-owned", "legacy-user", "Owned legacy setting", "opaque-owned", "2024-01-01"],
});
await preMigrationClient.execute({
  sql: `INSERT INTO integration_settings (
          provider, user_id, display_name, secret_ciphertext, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
  args: ["legacy-unowned", null, "Unowned legacy setting", "opaque-unowned", "2024-01-01"],
});

test("getDb returns the query, batch, and transaction APIs", async () => {
  const db = await getDb();

  assert.equal(typeof db.execute, "function");
  assert.equal(typeof db.executeAll, "function");
  assert.equal(typeof db.run, "function");
  assert.equal(typeof db.batch, "function");
  assert.equal(typeof db.transaction, "function");
});

test("getDb verifies local connection pragmas, including in-memory SQLite", async () => {
  await getDb();
  const foreignKeys = await getClient().execute("PRAGMA foreign_keys");
  const busyTimeout = await getClient().execute("PRAGMA busy_timeout");

  assert.equal(Number(foreignKeys.rows[0]?.foreign_keys), 1);
  assert.equal(Number(busyTimeout.rows[0]?.timeout), 5_000);
});

test("remote libSQL transports bypass local PRAGMA initialization", async () => {
  let calls = 0;
  const remoteProbe = {
    async execute() {
      calls += 1;
      throw new Error("Remote connection initialization must not execute local PRAGMAs.");
    },
  };

  await initializeLocalDatabaseConnection(remoteProbe, "libsql://database.example");
  assert.equal(calls, 0);
});

test("db.run inserts data and db.execute retrieves it", async () => {
  const db = await getDb();
  const id = `db-test-${randomUUID()}`;

  await db.run(
    "INSERT INTO workspace_state (id, owner_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, "Test User", "2024-01-01", "2024-01-01"],
  );

  const row = await db.execute(
    "SELECT owner_name FROM workspace_state WHERE id = ?",
    [id],
  ) as { owner_name: string } | undefined;

  assert.equal(row?.owner_name, "Test User");
});

test("db.transaction commits an atomic unit of work", async () => {
  const db = await getDb();
  const id = `db-transaction-test-${randomUUID()}`;

  await db.transaction(async (transaction) => {
    await transaction.run(
      "INSERT INTO workspace_state (id, owner_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [id, "Transactional User", "2024-01-01", "2024-01-01"],
    );
    const uncommitted = await transaction.execute(
      "SELECT owner_name FROM workspace_state WHERE id = ?",
      [id],
    ) as { owner_name: string } | undefined;
    assert.equal(uncommitted?.owner_name, "Transactional User");
  });

  const committed = await db.execute(
    "SELECT owner_name FROM workspace_state WHERE id = ?",
    [id],
  ) as { owner_name: string } | undefined;
  assert.equal(committed?.owner_name, "Transactional User");
});

test("db.execute returns undefined for missing rows", async () => {
  const db = await getDb();

  const row = await db.execute(
    "SELECT * FROM workspace_state WHERE id = ?",
    ["nonexistent-id"],
  );

  assert.equal(row, undefined);
});

test("integration settings allow the same provider for two users", async () => {
  const db = await getDb();
  const provider = `test-provider-${randomUUID()}`;
  const userOne = `user-${randomUUID()}`;
  const userTwo = `user-${randomUUID()}`;

  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, display_name, updated_at
     ) VALUES (?, ?, ?, ?)`,
    [provider, userOne, "Provider One", "2024-01-01"],
  );
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, display_name, updated_at
     ) VALUES (?, ?, ?, ?)`,
    [provider, userTwo, "Provider Two", "2024-01-01"],
  );

  const rows = await db.executeAll(
    "SELECT user_id FROM integration_settings WHERE provider = ? ORDER BY user_id",
    [provider],
  );

  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => String(row.user_id)),
    [userOne, userTwo].sort(),
  );
});

test("legacy settings preserve explicit owners and quarantine unowned secrets", async () => {
  const db = await getDb();

  const copied = await db.execute(
    "SELECT user_id, secret_ciphertext FROM integration_settings WHERE provider = ?",
    ["legacy-owned"],
  ) as { user_id: string; secret_ciphertext: string } | undefined;
  assert.deepEqual(copied, {
    user_id: "legacy-user",
    secret_ciphertext: "opaque-owned",
  });

  const exposed = await db.execute(
    "SELECT user_id FROM integration_settings WHERE provider = ?",
    ["legacy-unowned"],
  );
  assert.equal(exposed, undefined);

  const archived = await db.execute(
    `SELECT user_id, secret_ciphertext
     FROM integration_settings_legacy_v10
     WHERE provider = ?`,
    ["legacy-unowned"],
  ) as { user_id: null; secret_ciphertext: string } | undefined;
  assert.deepEqual(archived, {
    user_id: null,
    secret_ciphertext: "opaque-unowned",
  });

  const audit = await db.execute(
    "SELECT value FROM _migration_state WHERE key = ?",
    ["integration_settings_quarantined_unowned_count"],
  ) as { value: string } | undefined;
  assert.equal(audit?.value, "1");

  await assert.rejects(
    db.run(
      `INSERT INTO integration_settings (
         provider, user_id, display_name, updated_at
       ) VALUES (?, ?, ?, ?)`,
      [`null-owner-${randomUUID()}`, null, "Must fail closed", "2024-01-01"],
    ),
  );
});

test("db.executeAll returns empty array for no matches", async () => {
  const db = await getDb();

  const rows = await db.executeAll(
    "SELECT * FROM workspace_state WHERE id = ?",
    ["absolutely-nonexistent"],
  );

  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 0);
});

test("migration creates all expected tables", async () => {
  const db = await getDb();

  const tables = await db.executeAll(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ) as unknown as Array<{ name: string }>;

  const tableNames = tables.map((t) => t.name);

  assert.ok(tableNames.includes("_migration_lock"), "Missing _migration_lock table");
  assert.ok(tableNames.includes("workspace_state"), "Missing workspace_state table");
  assert.ok(tableNames.includes("integration_settings"), "Missing integration_settings table");
  assert.ok(
    tableNames.includes("integration_secret_archive"),
    "Missing integration_secret_archive table",
  );
  assert.ok(
    tableNames.includes("integration_config_archive"),
    "Missing integration_config_archive table",
  );
  assert.ok(
    tableNames.includes("integration_settings_legacy_v10"),
    "Missing integration_settings_legacy_v10 archival table",
  );
  assert.ok(tableNames.includes("runs"), "Missing runs table");
  assert.ok(tableNames.includes("run_targets"), "Missing run_targets table");
  assert.ok(tableNames.includes("run_artifacts"), "Missing run_artifacts table");
  assert.ok(tableNames.includes("run_events"), "Missing run_events table");
  assert.ok(
    tableNames.includes("run_admission_rate_limits"),
    "Missing run_admission_rate_limits table",
  );
  assert.ok(tableNames.includes("run_jobs"), "Missing run_jobs table");
  assert.ok(tableNames.includes("run_attempts"), "Missing run_attempts table");
  assert.ok(tableNames.includes("run_checkpoints"), "Missing run_checkpoints table");
  assert.ok(tableNames.includes("run_job_transitions"), "Missing run_job_transitions table");
  assert.ok(
    !tableNames.includes("user_credits"),
    "Fresh OSS databases must not create cloud billing tables",
  );
  assert.ok(tableNames.includes("shareable_decks"), "Missing shareable_decks table");
});

test("migration creates expected indexes", async () => {
  const db = await getDb();

  const indexes = await db.executeAll(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
  ) as unknown as Array<{ name: string }>;

  const indexNames = indexes.map((i) => i.name);

  assert.ok(indexNames.includes("idx_run_targets_run_id"), "Missing idx_run_targets_run_id");
  assert.ok(indexNames.includes("idx_run_artifacts_run_id"), "Missing idx_run_artifacts_run_id");
  assert.ok(indexNames.includes("idx_run_events_run_id"), "Missing idx_run_events_run_id");
  assert.ok(indexNames.includes("idx_run_artifacts_target_id"), "Missing idx_run_artifacts_target_id");
  assert.ok(indexNames.includes("idx_run_events_target_id"), "Missing idx_run_events_target_id");
  assert.ok(
    indexNames.includes("idx_run_artifacts_idempotency"),
    "Missing idx_run_artifacts_idempotency",
  );
  assert.ok(
    indexNames.includes("idx_run_events_idempotency"),
    "Missing idx_run_events_idempotency",
  );
  assert.ok(
    indexNames.includes("idx_integration_settings_v11_user_id"),
    "Missing idx_integration_settings_v11_user_id",
  );
  assert.ok(
    indexNames.includes("idx_integration_secret_archive_owner"),
    "Missing idx_integration_secret_archive_owner",
  );
  assert.ok(
    indexNames.includes("idx_integration_config_archive_owner"),
    "Missing idx_integration_config_archive_owner",
  );
  assert.ok(indexNames.includes("idx_run_jobs_claim"), "Missing idx_run_jobs_claim");
  assert.ok(indexNames.includes("idx_run_jobs_lease"), "Missing idx_run_jobs_lease");
  assert.ok(indexNames.includes("idx_run_attempts_run_id"), "Missing idx_run_attempts_run_id");
  assert.ok(indexNames.includes("idx_run_checkpoints_run_id"), "Missing idx_run_checkpoints_run_id");
  assert.ok(
    indexNames.includes("idx_run_job_transitions_run_id"),
    "Missing idx_run_job_transitions_run_id",
  );
  assert.ok(indexNames.includes("idx_runs_status"), "Missing idx_runs_status");
  assert.ok(indexNames.includes("idx_run_targets_status"), "Missing idx_run_targets_status");
  assert.ok(indexNames.includes("idx_run_artifacts_type"), "Missing idx_run_artifacts_type");
  assert.ok(indexNames.includes("idx_runs_created_at"), "Missing idx_runs_created_at");
  assert.ok(indexNames.includes("idx_shareable_decks_slug"), "Missing idx_shareable_decks_slug");
  assert.ok(indexNames.includes("idx_shareable_decks_target"), "Missing idx_shareable_decks_target");
});
