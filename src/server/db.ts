import {
  createClient,
  type Client,
  type InValue,
  type Row,
} from "@libsql/client";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnv } from "@/src/config/env";

let client: Client | null = null;
let clientInitializationPromise: Promise<void> | null = null;
let migrated = false;
let migrationPromise: Promise<void> | null = null;
let inMemoryTransactionTail: Promise<void> = Promise.resolve();

/* ─────────────────────────────────────────────
   Turso / libSQL client
   - Production: remote Turso DB (TURSO_DATABASE_URL)
   - Local dev:  file-based SQLite (.data/custom-proposals.sqlite)
   ───────────────────────────────────────────── */

function resolveDbUrl(): string {
  if (process.env.LOCAL_DB_PATH) {
    return `file:${process.env.LOCAL_DB_PATH}`;
  }

  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }

  return "file:.data/custom-proposals.sqlite";
}

function resolveLocalDbPath(): string | null {
  if (process.env.LOCAL_DB_PATH === ":memory:") return null;
  if (process.env.LOCAL_DB_PATH) {
    return resolve(/* turbopackIgnore: true */ process.env.LOCAL_DB_PATH);
  }
  if (process.env.TURSO_DATABASE_URL) return null;
  return resolve(/* turbopackIgnore: true */ ".data/custom-proposals.sqlite");
}

function secureLocalDatabasePath() {
  const path = resolveLocalDbPath();
  if (!path) return;

  // New SQLite files, WALs, and shared-memory files inherit private modes.
  process.umask(0o077);
  mkdirSync(
    /* turbopackIgnore: true */ dirname(
      /* turbopackIgnore: true */ path,
    ),
    { recursive: true, mode: 0o700 },
  );
  if (!existsSync(/* turbopackIgnore: true */ path)) return;
  if (lstatSync(/* turbopackIgnore: true */ path).isSymbolicLink()) {
    throw new Error("LOCAL_DB_PATH must not reference a symbolic link.");
  }
  chmodSync(/* turbopackIgnore: true */ path, 0o600);
}

export function getClient(): Client {
  if (client) return client;

  client = createDatabaseClient();

  return client;
}

/* ─────────────────────────────────────────────
   Thin wrapper that mimics the old sync API
   but returns Promises. Keeps call-site changes
   minimal (just add `await`).
   ───────────────────────────────────────────── */

export interface DbSession {
  execute(sql: string, args?: InValue[]): Promise<Row | undefined>;
  executeAll(sql: string, args?: InValue[]): Promise<Row[]>;
  run(sql: string, args?: InValue[]): Promise<void>;
}

export interface DbWrapper extends DbSession {
  batch(sql: string): Promise<void>;
  transaction<T>(operation: (transaction: DbSession) => Promise<T>): Promise<T>;
}

const SCHEMA_VERSION = "18"; // v18: cross-process leased migration serialization
const MIGRATION_LOCK_LEASE_MS = 5 * 60 * 1_000;
const MIGRATION_LOCK_HEARTBEAT_MS = 30 * 1_000;
const MIGRATION_WAIT_TIMEOUT_MS = 10 * 60 * 1_000;
const MIGRATION_BUSY_RETRY_MS = 100;
const MIGRATION_LOCK_POLL_MS = 500;
const LOCAL_SQLITE_BUSY_TIMEOUT_MS = 5_000;

type SqlExecutor = Pick<Client, "execute">;

function isDatabaseBusy(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      candidate.code === "SQLITE_BUSY"
      || (typeof candidate.message === "string" && candidate.message.includes("SQLITE_BUSY"))
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

async function retryMigrationContention<T>(
  operation: () => Promise<T>,
  waitStartedAt: number,
): Promise<T> {
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isDatabaseBusy(error)
        || Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS
      ) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_BUSY_RETRY_MS));
    }
  }
}

/**
 * Retry a schema reconciliation only when SQLite confirms the current attempt
 * did not run because the database was busy. The callback must re-read current
 * schema state on every invocation and must not perform external side effects.
 */
export function retryReconcilingMigrationContention<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return retryMigrationContention(operation, Date.now());
}

/**
 * Establish and verify every connection-local SQLite invariant before use.
 *
 * The client-level `timeout` option covers physical connections that libSQL
 * opens lazily after `transaction()`. These explicit PRAGMAs make the active
 * connection fail closed if the driver or its defaults ever drift. Remote
 * libSQL transports intentionally bypass local-only initialization.
 */
export async function initializeLocalDatabaseConnection(
  c: SqlExecutor,
  url = resolveDbUrl(),
): Promise<void> {
  if (!url.startsWith("file:")) return;

  const waitStartedAt = Date.now();
  await retryMigrationContention(
    () => c.execute(`PRAGMA busy_timeout = ${LOCAL_SQLITE_BUSY_TIMEOUT_MS}`),
    waitStartedAt,
  );
  await retryMigrationContention(
    () => c.execute("PRAGMA foreign_keys = ON"),
    waitStartedAt,
  );

  const foreignKeys = await retryMigrationContention(
    () => c.execute("PRAGMA foreign_keys"),
    waitStartedAt,
  );
  if (Number(foreignKeys.rows[0]?.foreign_keys) !== 1) {
    throw new Error("Could not enable foreign-key enforcement for the local SQLite connection.");
  }
  const busyTimeout = await retryMigrationContention(
    () => c.execute("PRAGMA busy_timeout"),
    waitStartedAt,
  );
  if (Number(busyTimeout.rows[0]?.timeout) !== LOCAL_SQLITE_BUSY_TIMEOUT_MS) {
    throw new Error("Could not configure the local SQLite connection busy timeout.");
  }

  if (url === "file::memory:") return;

  // WAL is database-persistent. Enabling it once per client startup lets the
  // web and worker coexist without rollback-journal readers starving writes.
  while (true) {
    const current = await retryMigrationContention(
      () => c.execute("PRAGMA journal_mode"),
      waitStartedAt,
    );
    const currentMode = String(current.rows[0]?.journal_mode ?? "").toLowerCase();
    if (currentMode === "wal") return;

    try {
      const updated = await c.execute("PRAGMA journal_mode = WAL");
      const updatedMode = String(updated.rows[0]?.journal_mode ?? "").toLowerCase();
      if (updatedMode === "wal") return;
      throw new Error(`Could not enable SQLite WAL mode (received ${updatedMode || "unknown"}).`);
    } catch (error) {
      if (!isDatabaseBusy(error)) throw error;
      if (Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_BUSY_RETRY_MS));
    }
  }
}

async function ensureApplicationDatabaseConnection(c: Client) {
  if (!clientInitializationPromise) {
    clientInitializationPromise = initializeLocalDatabaseConnection(c).catch((error) => {
      clientInitializationPromise = null;
      throw error;
    });
  }
  await clientInitializationPromise;
}

async function ensureMigrationLockTable(c: Client, waitStartedAt: number) {
  while (true) {
    try {
      await c.executeMultiple(`
        CREATE TABLE IF NOT EXISTS _migration_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          owner TEXT,
          lease_expires_at TEXT
        );
      `);
      return;
    } catch (error) {
      if (!isDatabaseBusy(error)) throw error;
      if (Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS) throw error;

      // Another process may have created the table while this connection was
      // blocked. Probe sqlite_master read-only before attempting more DDL so a
      // lock waiter cannot keep disturbing the active schema writer.
      const table = await retryMigrationContention(
        () => c.execute({
          sql: `SELECT name FROM sqlite_master
                WHERE type = 'table' AND name = '_migration_lock' LIMIT 1`,
          args: [],
        }),
        waitStartedAt,
      );
      if (table.rows.length > 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_BUSY_RETRY_MS));
    }
  }
}

/**
 * Run schema-changing work under the one durable database migration lease.
 *
 * The application and Better Auth use different database clients, and the web
 * and worker are separate processes in production. A process-local promise or
 * SQLite connection lock therefore cannot serialize all migration paths. This
 * leased row is the shared coordination boundary for every schema migrator.
 */
export async function withDatabaseMigrationLease<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const c = getClient();
  const waitStartedAt = Date.now();
  await ensureApplicationDatabaseConnection(c);
  await ensureMigrationLockTable(c, waitStartedAt);

  const owner = randomUUID();
  while (true) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + MIGRATION_LOCK_LEASE_MS).toISOString();
    const currentLease = await retryMigrationContention(
      () => c.execute({
        sql: "SELECT owner, lease_expires_at FROM _migration_lock WHERE id = 1",
        args: [],
      }),
      waitStartedAt,
    );
    const currentRow = currentLease.rows[0] as Record<string, unknown> | undefined;
    const currentOwner = currentRow?.owner;
    const currentExpiry = currentRow?.lease_expires_at;
    const mayAcquire = !currentRow
      || currentOwner === null
      || currentExpiry === null
      || (typeof currentExpiry === "string" && currentExpiry <= now.toISOString());
    if (!mayAcquire) {
      if (Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS) {
        throw new Error("Timed out waiting for the database migration lock.");
      }
      // Waiting must remain read-mostly. Repeated conditional UPSERT attempts
      // contend with the owner's DDL even though they cannot acquire the row,
      // and can surface SQLITE_BUSY inside the protected migration itself.
      await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_LOCK_POLL_MS));
      continue;
    }
    let acquired;
    try {
      acquired = await c.execute({
        sql: `INSERT INTO _migration_lock (id, owner, lease_expires_at)
              VALUES (1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                owner = excluded.owner,
                lease_expires_at = excluded.lease_expires_at
              WHERE _migration_lock.owner IS NULL
                 OR _migration_lock.lease_expires_at IS NULL
                 OR _migration_lock.lease_expires_at <= ?
              RETURNING owner`,
        args: [owner, leaseExpiresAt, now.toISOString()],
      });
    } catch (error) {
      if (!isDatabaseBusy(error)) throw error;
      if (Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS) throw error;
      // Re-read ownership before another write attempt. Blindly retrying this
      // UPSERT would continue taking SQLite write locks after a peer won.
      await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_BUSY_RETRY_MS));
      continue;
    }
    if ((acquired.rows[0] as Record<string, unknown> | undefined)?.owner === owner) break;
    if (Date.now() - waitStartedAt >= MIGRATION_WAIT_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the database migration lock.");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_LOCK_POLL_MS));
  }

  const heartbeat = setInterval(() => {
    const expiresAt = new Date(Date.now() + MIGRATION_LOCK_LEASE_MS).toISOString();
    void c.execute({
      sql: "UPDATE _migration_lock SET lease_expires_at = ? WHERE id = 1 AND owner = ?",
      args: [expiresAt, owner],
    }).catch(() => undefined);
  }, MIGRATION_LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();

  let result!: T;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    clearInterval(heartbeat);
  }

  try {
    const released = await retryMigrationContention(
      () => c.execute({
        sql: `UPDATE _migration_lock
              SET owner = NULL, lease_expires_at = NULL
              WHERE id = 1 AND owner = ?`,
        args: [owner],
      }),
      Date.now(),
    );
    if (released.rowsAffected !== 1) {
      throw new Error("Database migration lease ownership was lost before release.");
    }
  } catch (releaseError) {
    if (!operationFailed) throw releaseError;
  }

  if (operationFailed) throw operationError;
  return result;
}

function createDbSession(executor: SqlExecutor): DbSession {
  return {
    async execute(sql: string, args: InValue[] = []): Promise<Row | undefined> {
      const result = await executor.execute({ sql, args });
      return result.rows[0] ?? undefined;
    },

    async executeAll(sql: string, args: InValue[] = []): Promise<Row[]> {
      const result = await executor.execute({ sql, args });
      return [...result.rows];
    },

    async run(sql: string, args: InValue[] = []): Promise<void> {
      await executor.execute({ sql, args });
    },
  };
}

async function withWriteTransaction<T>(
  c: Client,
  operation: (transaction: SqlExecutor) => Promise<T>,
): Promise<T> {
  // libSQL's interactive transaction object closes and reopens its SQLite
  // connection after commit. That is correct for files, but it erases a
  // `:memory:` database. Use a serialized SQL transaction for this test-only
  // transport so the same connection and database remain alive.
  if (resolveDbUrl() === "file::memory:") {
    const previous = inMemoryTransactionTail;
    let release: () => void = () => undefined;
    inMemoryTransactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    await c.execute("BEGIN IMMEDIATE");
    try {
      const result = await operation(c);
      await c.execute("COMMIT");
      return result;
    } catch (error) {
      try {
        await c.execute("ROLLBACK");
      } catch {
        // Preserve the operation error if SQLite already closed the transaction.
      }
      throw error;
    } finally {
      release();
    }
  }

  const transaction = await c.transaction("write");
  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    if (!transaction.closed) {
      try {
        await transaction.rollback();
      } catch {
        // Preserve the original operation error over a secondary rollback error.
      }
    }
    throw error;
  } finally {
    if (!transaction.closed) transaction.close();
  }
}

async function ensureMigrated(c: Client) {
  if (migrated) return;

  if (!migrationPromise) {
    migrationPromise = (async () => {
      const markerIsCurrent = async () => {
        try {
          const marker = await c.execute({
            sql: "SELECT value FROM _migration_state WHERE key = 'schema_version' LIMIT 1",
            args: [],
          });
          return Boolean(
            marker.rows[0]
            && (marker.rows[0] as Record<string, unknown>).value === SCHEMA_VERSION,
          );
        } catch {
          return false;
        }
      };
      if (await markerIsCurrent()) {
        migrated = true;
        return;
      }

      // The process-local promise coalesces callers here. The persisted lease
      // serializes this DDL with every web/worker and Better Auth migrator.
      await withDatabaseMigrationLease(async () => {
        // A previous owner may have completed immediately before this lease
        // was acquired. Recheck under ownership before touching DDL.
        if (!(await markerIsCurrent())) {
          // Every app step is a schema reconciliation: CREATE/INDEX statements
          // are conditional, column additions are preceded by introspection,
          // data backfills are deterministic, and the legacy table rebuild is
          // transactional. Retrying from fresh state cannot duplicate an
          // external or non-idempotent side effect.
          await retryReconcilingMigrationContention(async () => {
            await migrate(c);
            await c.executeMultiple(`
              CREATE TABLE IF NOT EXISTS _migration_state (key TEXT PRIMARY KEY, value TEXT);
            `);
            await c.execute({
              sql: `INSERT INTO _migration_state (key, value) VALUES ('schema_version', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              args: [SCHEMA_VERSION],
            });
          });
        }
      });
      migrated = true;
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  await migrationPromise;
}

export async function getDb(): Promise<DbWrapper> {
  const c = getClient();
  await ensureApplicationDatabaseConnection(c);
  await ensureMigrated(c);
  secureLocalDatabasePath();

  return {
    ...createDbSession(c),

    async batch(sql: string): Promise<void> {
      await c.executeMultiple(sql);
    },

    async transaction<T>(operation: (transaction: DbSession) => Promise<T>): Promise<T> {
      return withWriteTransaction(c, (transaction) => operation(createDbSession(transaction)));
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
    // libSQL reapplies this option to every local physical connection it opens,
    // including the replacement connection created after `transaction()`.
    timeout: url.startsWith("file:") ? LOCAL_SQLITE_BUSY_TIMEOUT_MS : undefined,
  };
}

export function createDatabaseClient(
  connectionInfo: ReturnType<typeof getDbConnectionInfo> = getDbConnectionInfo(),
) {
  // Better Auth creates its own local client before repository startup. Apply
  // the same file-permission boundary before either client can open the file.
  secureLocalDatabasePath();
  return createClient(connectionInfo);
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

const LEGACY_INTEGRATION_SETTINGS_TABLE = "integration_settings_legacy_v10";

interface TableColumnInfo {
  name: string;
  notnull: number | bigint;
  pk: number | bigint;
}

async function tableExists(executor: SqlExecutor, tableName: string) {
  const result = await executor.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [tableName],
  });
  return result.rows.length > 0;
}

async function tableColumns(executor: SqlExecutor, tableName: string) {
  const result = await executor.execute(`PRAGMA table_info(${tableName})`);
  return result.rows as unknown as TableColumnInfo[];
}

function isCanonicalIntegrationSettingsSchema(columns: TableColumnInfo[]) {
  const provider = columns.find((column) => column.name === "provider");
  const userId = columns.find((column) => column.name === "user_id");

  return Boolean(
    provider
      && userId
      && Number(provider.pk) === 1
      && Number(userId.pk) === 2
      && Number(userId.notnull) === 1,
  );
}

async function createCanonicalIntegrationSettings(executor: SqlExecutor) {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS integration_settings (
      provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
      user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
      display_name TEXT,
      config_json TEXT,
      secret_ciphertext TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, user_id)
    )
  `);
  await executor.execute(
    "CREATE INDEX IF NOT EXISTS idx_integration_settings_v11_user_id ON integration_settings(user_id)",
  );
}

async function copyExplicitlyOwnedLegacyIntegrationSettings(
  executor: SqlExecutor,
  legacyColumns: TableColumnInfo[],
) {
  const names = new Set(legacyColumns.map((column) => column.name));
  if (!names.has("provider") || !names.has("user_id")) return;

  const source = [
    "provider",
    "user_id",
    names.has("display_name") ? "display_name" : "NULL",
    names.has("config_json") ? "config_json" : "NULL",
    names.has("secret_ciphertext") ? "secret_ciphertext" : "NULL",
    names.has("updated_at") ? "updated_at" : "CURRENT_TIMESTAMP",
  ].join(", ");

  await executor.execute(`
    INSERT INTO integration_settings (
      provider, user_id, display_name, config_json, secret_ciphertext, updated_at
    )
    SELECT ${source}
    FROM ${LEGACY_INTEGRATION_SETTINGS_TABLE}
    WHERE user_id IS NOT NULL
      AND length(trim(user_id)) > 0
      AND length(trim(provider)) > 0
    ON CONFLICT(provider, user_id) DO NOTHING
  `);
}

/**
 * Rebuild the legacy provider-global settings table without discarding data.
 *
 * The old table is retained verbatim as an archival quarantine. Only rows that
 * already have an explicit owner are copied into the canonical tenant-scoped
 * table. Null/blank owners are deliberately never inferred from an admin user:
 * doing so would silently transfer credentials across a security boundary.
 */
async function ensureCanonicalIntegrationSettings(c: Client) {
  await withWriteTransaction(c, async (transaction) => {
    const currentColumns = await tableColumns(transaction, "integration_settings");
    const isCanonical = isCanonicalIntegrationSettingsSchema(currentColumns);
    let archiveExists = await tableExists(transaction, LEGACY_INTEGRATION_SETTINGS_TABLE);

    if (!isCanonical) {
      if (archiveExists) {
        throw new Error(
          "Cannot migrate integration_settings: the archival legacy table already exists.",
        );
      }

      await transaction.execute(
        `ALTER TABLE integration_settings RENAME TO ${LEGACY_INTEGRATION_SETTINGS_TABLE}`,
      );
      archiveExists = true;
      await createCanonicalIntegrationSettings(transaction);
    } else {
      await createCanonicalIntegrationSettings(transaction);
    }

    let quarantinedCount = 0;
    if (archiveExists) {
      const legacyColumns = await tableColumns(transaction, LEGACY_INTEGRATION_SETTINGS_TABLE);
      await copyExplicitlyOwnedLegacyIntegrationSettings(transaction, legacyColumns);

      const names = new Set(legacyColumns.map((column) => column.name));
      if (names.has("user_id")) {
        const count = await transaction.execute(
          `SELECT COUNT(*) AS count
           FROM ${LEGACY_INTEGRATION_SETTINGS_TABLE}
           WHERE user_id IS NULL OR length(trim(user_id)) = 0`,
        );
        quarantinedCount = Number(
          (count.rows[0] as unknown as { count: number | bigint } | undefined)?.count ?? 0,
        );
      } else {
        const count = await transaction.execute(
          `SELECT COUNT(*) AS count FROM ${LEGACY_INTEGRATION_SETTINGS_TABLE}`,
        );
        quarantinedCount = Number(
          (count.rows[0] as unknown as { count: number | bigint } | undefined)?.count ?? 0,
        );
      }
    }

    await transaction.execute(`
      CREATE TABLE IF NOT EXISTS _migration_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    await transaction.execute({
      sql: `INSERT INTO _migration_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: ["integration_settings_quarantined_unowned_count", String(quarantinedCount)],
    });
  });
}

async function migrate(c: Client) {
  // Enable foreign key enforcement
  await c.execute("PRAGMA foreign_keys = ON");

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
      provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
      user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
      display_name TEXT,
      config_json TEXT,
      secret_ciphertext TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, user_id)
    );

    CREATE TABLE IF NOT EXISTS integration_secret_archive (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      ciphertext_sha256 TEXT NOT NULL CHECK (length(ciphertext_sha256) = 64),
      reason TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_config_archive (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      config_json TEXT NOT NULL,
      config_sha256 TEXT NOT NULL CHECK (length(config_sha256) = 64),
      reason TEXT NOT NULL,
      archived_at TEXT NOT NULL
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
      target_ordinal INTEGER NOT NULL CHECK (target_ordinal >= 0),
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
      idempotency_key TEXT,
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
      idempotency_key TEXT,
      stage TEXT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES run_targets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_jobs (
      run_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (
        state IN (
          'queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering',
          'delivered', 'partially_completed', 'failed', 'cancelled'
        )
      ),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 100),
      current_attempt_id TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      next_attempt_at TEXT NOT NULL,
      cancel_requested_at TEXT,
      last_error TEXT,
      state_changed_at TEXT NOT NULL,
      state_changed_by_attempt_id TEXT,
      terminal_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id),
      CHECK (attempt_count <= max_attempts),
      CHECK (
        (lease_owner IS NULL AND lease_expires_at IS NULL)
        OR (
          lease_owner IS NOT NULL
          AND lease_expires_at IS NOT NULL
          AND current_attempt_id IS NOT NULL
        )
      ),
      CHECK (
        (
          state IN ('delivered', 'partially_completed', 'failed', 'cancelled')
          AND terminal_at IS NOT NULL
        )
        OR (
          state IN ('queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering')
          AND terminal_at IS NULL
        )
      )
    );

    CREATE TABLE IF NOT EXISTS run_admissions (
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
      run_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, idempotency_key),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    CREATE TABLE IF NOT EXISTS run_admission_rate_limits (
      user_id TEXT PRIMARY KEY,
      window_started_at TEXT NOT NULL,
      request_count INTEGER NOT NULL CHECK (request_count >= 1),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_attempts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
      lease_owner TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('running', 'released', 'completed', 'failed', 'cancelled', 'expired')
      ),
      reclaimed_from_attempt_id TEXT,
      started_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      finished_at TEXT,
      retry_at TEXT,
      final_state TEXT CHECK (
        final_state IS NULL OR final_state IN (
          'queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering',
          'delivered', 'partially_completed', 'failed', 'cancelled'
        )
      ),
      last_error TEXT,
      UNIQUE (run_id, attempt_number),
      FOREIGN KEY (run_id) REFERENCES run_jobs(run_id),
      FOREIGN KEY (reclaimed_from_attempt_id) REFERENCES run_attempts(id)
    );

    CREATE TABLE IF NOT EXISTS run_checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      checkpoint_key TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (
        stage IN (
          'queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering',
          'delivered', 'partially_completed', 'failed', 'cancelled'
        )
      ),
      attempt_id TEXT NOT NULL,
      metadata_json TEXT,
      completed_at TEXT NOT NULL,
      UNIQUE (run_id, checkpoint_key),
      FOREIGN KEY (run_id) REFERENCES run_jobs(run_id),
      FOREIGN KEY (attempt_id) REFERENCES run_attempts(id)
    );

    CREATE TABLE IF NOT EXISTS run_job_transitions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      from_state TEXT NOT NULL CHECK (
        from_state IN (
          'queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering',
          'delivered', 'partially_completed', 'failed', 'cancelled'
        )
      ),
      to_state TEXT NOT NULL CHECK (
        to_state IN (
          'queued', 'crawling', 'enriching', 'brief_ready', 'planning', 'rendering',
          'delivered', 'partially_completed', 'failed', 'cancelled'
        )
      ),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES run_jobs(run_id),
      FOREIGN KEY (attempt_id) REFERENCES run_attempts(id)
    );

    CREATE TABLE IF NOT EXISTS shareable_decks (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      run_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES run_targets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_run_targets_run_id ON run_targets(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_target_id ON run_artifacts(target_id);
    CREATE INDEX IF NOT EXISTS idx_run_events_target_id ON run_events(target_id);
    CREATE INDEX IF NOT EXISTS idx_run_jobs_claim ON run_jobs(state, next_attempt_at, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_run_jobs_lease ON run_jobs(lease_owner, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_run_attempts_run_id ON run_attempts(run_id, attempt_number);
    CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run_id ON run_checkpoints(run_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_run_job_transitions_run_id ON run_job_transitions(run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_run_admissions_created_at
      ON run_admissions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_run_targets_status ON run_targets(status);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_type ON run_artifacts(artifact_type);
    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
    CREATE INDEX IF NOT EXISTS idx_shareable_decks_slug ON shareable_decks(slug);
    CREATE INDEX IF NOT EXISTS idx_shareable_decks_target ON shareable_decks(target_id);
    CREATE INDEX IF NOT EXISTS idx_integration_secret_archive_owner
      ON integration_secret_archive(user_id, provider, archived_at);
    CREATE INDEX IF NOT EXISTS idx_integration_config_archive_owner
      ON integration_config_archive(user_id, provider, archived_at);
  `);

  await ensureColumn(c, "workspace_state", "draft_websites_text", "TEXT");
  await ensureColumn(c, "workspace_state", "draft_contacts_csv_text", "TEXT");
  await ensureColumn(c, "workspace_state", "seller_brief_md", "TEXT");
  await ensureColumn(c, "workspace_state", "audience_context_json", "TEXT");
  await ensureColumn(c, "workspace_state", "seller_knowledge_json", "TEXT");
  await ensureColumn(c, "run_artifacts", "idempotency_key", "TEXT");
  await ensureColumn(c, "run_events", "idempotency_key", "TEXT");
  await ensureColumn(c, "run_targets", "target_ordinal", "INTEGER");

  // Older schemas did not retain input order. Backfill a deterministic order
  // without discarding legacy rows; every new run writes the true input ordinal.
  await c.execute(`
    UPDATE run_targets AS target
    SET target_ordinal = (
      SELECT COUNT(*) - 1
      FROM run_targets AS preceding
      WHERE preceding.run_id = target.run_id
        AND (
          preceding.created_at < target.created_at
          OR (preceding.created_at = target.created_at AND preceding.id <= target.id)
        )
    )
    WHERE target_ordinal IS NULL
  `);

  // Legacy columns/tables remain in-place on upgraded databases; migrations do
  // not drop user state. Fresh OSS databases do not create cloud billing
  // schema, and current execution uses only the owner column.
  await ensureColumn(c, "runs", "user_id", "TEXT");

  // ── Multi-tenancy: scope workspace_state and rebuild provider settings ──
  await ensureColumn(c, "workspace_state", "user_id", "TEXT");
  await ensureCanonicalIntegrationSettings(c);

  // Create indexes for user-scoped queries
  await c.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_workspace_state_user_id ON workspace_state(user_id);
    CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_run_targets_ordinal
      ON run_targets(run_id, target_ordinal)
      WHERE target_ordinal IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_run_artifacts_idempotency
      ON run_artifacts(run_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_run_events_idempotency
      ON run_events(run_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);

  // Legacy rows without an explicit owner remain inaccessible. Record their
  // count for operator review instead of guessing ownership from an admin row.
  for (const [key, table] of [
    ["workspace_state_quarantined_unowned_count", "workspace_state"],
    ["runs_quarantined_unowned_count", "runs"],
  ] as const) {
    const count = await c.execute(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id IS NULL`);
    const value = String(
      Number((count.rows[0] as unknown as { count: number | bigint } | undefined)?.count ?? 0),
    );
    await c.execute({
      sql: `INSERT INTO _migration_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [key, value],
    });
  }
}
