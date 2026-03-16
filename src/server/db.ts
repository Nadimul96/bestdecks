import { createClient, type Client, type Row, type InValue } from "@libsql/client";
import { loadEnv } from "@/src/config/env";

let client: Client | null = null;
let migrated = false;

/* ─────────────────────────────────────────────
   Turso / libSQL client
   - Production: remote Turso DB (TURSO_DATABASE_URL)
   - Local dev:  file-based SQLite (.data/custom-proposals.sqlite)
   ───────────────────────────────────────────── */

function resolveDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }

  if (process.env.LOCAL_DB_PATH) {
    return `file:${process.env.LOCAL_DB_PATH}`;
  }

  return "file:.data/custom-proposals.sqlite";
}

export function getClient(): Client {
  if (client) return client;

  const env = loadEnv();
  const url = resolveDbUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN;

  client = createClient({
    url,
    authToken: url.startsWith("libsql://") ? authToken : undefined,
  });

  return client;
}

/* ─────────────────────────────────────────────
   Thin wrapper that mimics the old sync API
   but returns Promises. Keeps call-site changes
   minimal (just add `await`).
   ───────────────────────────────────────────── */

export interface DbWrapper {
  execute(sql: string, args?: InValue[]): Promise<Row | undefined>;
  executeAll(sql: string, args?: InValue[]): Promise<Row[]>;
  run(sql: string, args?: InValue[]): Promise<void>;
  batch(sql: string): Promise<void>;
}

export async function getDb(): Promise<DbWrapper> {
  const c = getClient();

  if (!migrated) {
    await migrate(c);
    migrated = true;
  }

  return {
    async execute(sql: string, args: InValue[] = []): Promise<Row | undefined> {
      const result = await c.execute({ sql, args });
      return result.rows[0] ?? undefined;
    },

    async executeAll(sql: string, args: InValue[] = []): Promise<Row[]> {
      const result = await c.execute({ sql, args });
      return [...result.rows];
    },

    async run(sql: string, args: InValue[] = []): Promise<void> {
      await c.execute({ sql, args });
    },

    async batch(sql: string): Promise<void> {
      await c.executeMultiple(sql);
    },
  };
}

/* ─────────────────────────────────────────────
   Database URL + token for better-auth
   (it has native libSQL support)
   ───────────────────────────────────────────── */

export function getDbConnectionInfo() {
  const env = loadEnv();
  const url = resolveDbUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN;

  return {
    url,
    authToken: url.startsWith("libsql://") ? authToken : undefined,
  };
}

/* ─────────────────────────────────────────────
   Migrations
   ───────────────────────────────────────────── */

async function ensureColumn(
  c: Client,
  tableName: string,
  columnName: string,
  definition: string,
) {
  const result = await c.execute(`PRAGMA table_info(${tableName})`);
  const hasColumn = result.rows.some(
    (row) => (row as unknown as { name: string }).name === columnName,
  );

  if (!hasColumn) {
    await c.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function migrate(c: Client) {
  await c.executeMultiple(`
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

    CREATE TABLE IF NOT EXISTS user_credits (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      plan_tier TEXT NOT NULL DEFAULT 'free',
      monthly_allowance INTEGER NOT NULL DEFAULT 0,
      bonus_credits INTEGER NOT NULL DEFAULT 0,
      reset_date TEXT,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_run_targets_run_id ON run_targets(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id);
  `);

  await ensureColumn(c, "workspace_state", "draft_websites_text", "TEXT");
  await ensureColumn(c, "workspace_state", "draft_contacts_csv_text", "TEXT");
  await ensureColumn(c, "workspace_state", "seller_brief_md", "TEXT");
  await ensureColumn(c, "workspace_state", "audience_context_json", "TEXT");

  // Ensure user_credits has all columns (some were added later)
  await ensureColumn(c, "user_credits", "plan_tier", "TEXT NOT NULL DEFAULT 'free'");
  await ensureColumn(c, "user_credits", "monthly_allowance", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(c, "user_credits", "bonus_credits", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(c, "user_credits", "reset_date", "TEXT");
  await ensureColumn(c, "user_credits", "stripe_customer_id", "TEXT");
  await ensureColumn(c, "user_credits", "stripe_subscription_id", "TEXT");
}
