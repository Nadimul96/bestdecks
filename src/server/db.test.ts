import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "bestdecks-db-"));
process.env.APP_SECRETS_KEY = "unit-test-secret";
process.env.LOCAL_DB_PATH = join(tempDir, "db-test.sqlite");
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test("getDb returns a wrapper with execute, executeAll, run, and batch", async () => {
  const db = await getDb();

  assert.equal(typeof db.execute, "function");
  assert.equal(typeof db.executeAll, "function");
  assert.equal(typeof db.run, "function");
  assert.equal(typeof db.batch, "function");
});

test("db.run inserts data and db.execute retrieves it", async () => {
  const db = await getDb();

  await db.run(
    "INSERT INTO workspace_state (id, owner_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ["db-test-1", "Test User", "2024-01-01", "2024-01-01"],
  );

  const row = await db.execute(
    "SELECT owner_name FROM workspace_state WHERE id = ?",
    ["db-test-1"],
  ) as { owner_name: string } | undefined;

  assert.equal(row?.owner_name, "Test User");

  // Clean up
  await db.run("DELETE FROM workspace_state WHERE id = ?", ["db-test-1"]);
});

test("db.execute returns undefined for missing rows", async () => {
  const db = await getDb();

  const row = await db.execute(
    "SELECT * FROM workspace_state WHERE id = ?",
    ["nonexistent-id"],
  );

  assert.equal(row, undefined);
});

test("db.executeAll returns an array of rows", async () => {
  const db = await getDb();

  await db.run(
    "INSERT INTO integration_settings (provider, display_name, updated_at) VALUES (?, ?, ?)",
    ["test-provider-1", "Provider One", "2024-01-01"],
  );
  await db.run(
    "INSERT INTO integration_settings (provider, display_name, updated_at) VALUES (?, ?, ?)",
    ["test-provider-2", "Provider Two", "2024-01-01"],
  );

  const rows = await db.executeAll(
    "SELECT provider FROM integration_settings WHERE provider LIKE ?",
    ["test-provider-%"],
  );

  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);

  // Clean up
  await db.run("DELETE FROM integration_settings WHERE provider LIKE ?", ["test-provider-%"]);
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

  assert.ok(tableNames.includes("workspace_state"), "Missing workspace_state table");
  assert.ok(tableNames.includes("integration_settings"), "Missing integration_settings table");
  assert.ok(tableNames.includes("runs"), "Missing runs table");
  assert.ok(tableNames.includes("run_targets"), "Missing run_targets table");
  assert.ok(tableNames.includes("run_artifacts"), "Missing run_artifacts table");
  assert.ok(tableNames.includes("run_events"), "Missing run_events table");
  assert.ok(tableNames.includes("user_credits"), "Missing user_credits table");
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
  assert.ok(indexNames.includes("idx_runs_status"), "Missing idx_runs_status");
  assert.ok(indexNames.includes("idx_run_targets_status"), "Missing idx_run_targets_status");
  assert.ok(indexNames.includes("idx_run_artifacts_type"), "Missing idx_run_artifacts_type");
  assert.ok(indexNames.includes("idx_runs_created_at"), "Missing idx_runs_created_at");
});
