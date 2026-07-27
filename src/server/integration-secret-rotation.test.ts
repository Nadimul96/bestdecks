import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";

import type { IntegrationProviderKey } from "@/src/domain/onboarding";
import { createIntegrationSecretCodec } from "./crypto";
import { rewrapIntegrationSecrets } from "./integration-secret-rotation";

process.env.APP_SECRETS_KEY = "0".repeat(32);
process.env.LOCAL_DB_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const { getDb } = await import("./db");

const OLD_KEY = "rotation-test-old-key-material-0001";
const NEW_KEY = "rotation-test-new-key-material-0002";
const FIXED_TIME = "2026-07-13T12:00:00.000Z";

interface StoredRow {
  provider: IntegrationProviderKey;
  user_id: string;
  secret_ciphertext: string;
}

function encryptLegacy(value: string, source: string): string {
  const key = createHash("sha256").update(source).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

test("transactional rewrap archives prior ciphertext, preserves archives, and is idempotent", async () => {
  const db = await getDb();
  const oldCodec = createIntegrationSecretCodec({ current: OLD_KEY });
  const rotatedCodec = createIntegrationSecretCodec({
    current: NEW_KEY,
    previous: OLD_KEY,
  });
  const oldCloudflare = encryptLegacy("cloudflare-fixture", OLD_KEY);
  const oldGemini = oldCodec.encrypt("gemini-fixture", {
    userId: "tenant-b",
    provider: "gemini",
  });
  const currentPerplexity = rotatedCodec.encrypt("perplexity-fixture", {
    userId: "tenant-c",
    provider: "perplexity",
  });

  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["cloudflare", "tenant-a", oldCloudflare, "2026-07-12T00:00:00.000Z"],
  );
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["gemini", "tenant-b", oldGemini, "2026-07-12T00:00:00.000Z"],
  );
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["perplexity", "tenant-c", currentPerplexity, "2026-07-12T00:00:00.000Z"],
  );
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["openai", "tenant-d", null, "2026-07-12T00:00:00.000Z"],
  );
  await db.run(
    `INSERT INTO integration_secret_archive (
       id, provider, user_id, secret_ciphertext, ciphertext_sha256, reason, archived_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      "preexisting-archive",
      "plusai",
      "tenant-z",
      oldCloudflare,
      createHash("sha256").update(oldCloudflare).digest("hex"),
      "explicit_user_revoke",
      "2026-07-01T00:00:00.000Z",
    ],
  );

  let archiveSequence = 0;
  const createArchiveId = () => `rotation-archive-${archiveSequence += 1}`;
  const summary = await rewrapIntegrationSecrets({
    db,
    codec: rotatedCodec,
    now: () => FIXED_TIME,
    createArchiveId,
  });

  assert.deepEqual(summary, { scanned: 3, rewrapped: 2, alreadyCurrent: 1 });

  const rows = await db.executeAll(
    `SELECT provider, user_id, secret_ciphertext
     FROM integration_settings
     WHERE secret_ciphertext IS NOT NULL
     ORDER BY user_id`,
  ) as unknown as StoredRow[];
  assert.equal(rows.length, 3);
  const expectedSecrets = new Map<IntegrationProviderKey, string>([
    ["cloudflare", "cloudflare-fixture"],
    ["gemini", "gemini-fixture"],
    ["perplexity", "perplexity-fixture"],
  ]);
  for (const row of rows) {
    const context = { userId: row.user_id, provider: row.provider };
    assert.equal(rotatedCodec.isCurrentEnvelope(row.secret_ciphertext), true);
    assert.equal(rotatedCodec.decrypt(row.secret_ciphertext, context), expectedSecrets.get(row.provider));
  }

  const archives = await db.executeAll(
    `SELECT id, secret_ciphertext, ciphertext_sha256, reason, archived_at
     FROM integration_secret_archive
     ORDER BY id`,
  ) as unknown as Array<{
    id: string;
    secret_ciphertext: string;
    ciphertext_sha256: string;
    reason: string;
    archived_at: string;
  }>;
  assert.equal(archives.length, 3);
  assert.ok(archives.some((archive) => archive.id === "preexisting-archive"));
  const rotationArchives = archives.filter((archive) => archive.reason === "key_rotation_rewrap_v1");
  assert.equal(rotationArchives.length, 2);
  assert.deepEqual(
    new Set(rotationArchives.map((archive) => archive.secret_ciphertext)),
    new Set([oldCloudflare, oldGemini]),
  );
  for (const archive of rotationArchives) {
    assert.equal(
      archive.ciphertext_sha256,
      createHash("sha256").update(archive.secret_ciphertext).digest("hex"),
    );
    assert.equal(archive.archived_at, FIXED_TIME);
  }

  const second = await rewrapIntegrationSecrets({
    db,
    codec: rotatedCodec,
    now: () => FIXED_TIME,
    createArchiveId,
  });
  assert.deepEqual(second, { scanned: 3, rewrapped: 0, alreadyCurrent: 3 });
  const archiveCountAfterSecondRun = await db.execute(
    "SELECT COUNT(*) AS count FROM integration_secret_archive",
  ) as { count: number } | undefined;
  assert.equal(Number(archiveCountAfterSecondRun?.count), 3);

  const rollbackCandidate = oldCodec.encrypt("rollback-fixture", {
    userId: "tenant-e",
    provider: "plusai",
  });
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["plusai", "tenant-e", rollbackCandidate, "2026-07-12T00:00:00.000Z"],
  );
  await db.run(
    `INSERT INTO integration_settings (
       provider, user_id, secret_ciphertext, updated_at
     ) VALUES (?, ?, ?, ?)`,
    ["alai", "tenant-f", "malformed", "2026-07-12T00:00:00.000Z"],
  );

  await assert.rejects(
    rewrapIntegrationSecrets({
      db,
      codec: rotatedCodec,
      now: () => FIXED_TIME,
      createArchiveId,
    }),
    { message: "Stored integration secret payload is invalid or cannot be decrypted." },
  );
  const rolledBack = await db.execute(
    `SELECT secret_ciphertext
     FROM integration_settings
     WHERE provider = ? AND user_id = ?`,
    ["plusai", "tenant-e"],
  ) as { secret_ciphertext: string } | undefined;
  assert.equal(rolledBack?.secret_ciphertext, rollbackCandidate);
  const archiveCountAfterRollback = await db.execute(
    "SELECT COUNT(*) AS count FROM integration_secret_archive",
  ) as { count: number } | undefined;
  assert.equal(Number(archiveCountAfterRollback?.count), 3);
});
