import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { loadEnv } from "@/src/config/env";

let database: DatabaseSync | null = null;

function ensureColumn(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string,
) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function getDefaultDatabasePath() {
  if (process.env.LOCAL_DB_PATH) {
    return process.env.LOCAL_DB_PATH;
  }

  if (process.env.VERCEL === "1") {
    return "/tmp/bestdecks.sqlite";
  }

  return ".data/custom-proposals.sqlite";
}

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS workspace_state (
      id TEXT PRIMARY KEY,
      owner_name TEXT,
      owner_email TEXT,
      company_name TEXT,
      website_url TEXT,
      timezone TEXT,
      default_signature TEXT,
      seller_context_json TEXT,
      questionnaire_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integration_settings (
      provider TEXT PRIMARY KEY,
      display_name TEXT,
      config_json TEXT,
      secret_ciphertext TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      seller_context_json TEXT NOT NULL,
      questionnaire_json TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      delivery_format TEXT NOT NULL,
      review_gate_enabled INTEGER NOT NULL,
      seller_brief_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS run_targets (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      website_url TEXT NOT NULL,
      company_name TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT,
      campaign_goal TEXT,
      notes TEXT,
      status TEXT NOT NULL,
      crawl_provider TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_id TEXT,
      artifact_type TEXT NOT NULL,
      artifact_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES run_targets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_id TEXT,
      stage TEXT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES run_targets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_run_targets_run_id ON run_targets(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id);
  `);

  ensureColumn(db, "workspace_state", "draft_websites_text", "TEXT");
  ensureColumn(db, "workspace_state", "draft_contacts_csv_text", "TEXT");
}

export function getDb() {
  if (database) {
    return database;
  }

  const env = loadEnv();
  const filePath = resolve(process.cwd(), env.LOCAL_DB_PATH ?? getDefaultDatabasePath());
  mkdirSync(dirname(filePath), { recursive: true });
  database = new DatabaseSync(filePath);
  migrate(database);
  return database;
}
