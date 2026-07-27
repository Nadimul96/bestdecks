import { createHash, randomUUID } from "node:crypto";

import { integrationProviderSchema } from "@/src/domain/onboarding";
import {
  getIntegrationSecretCodec,
  type IntegrationSecretCodec,
} from "@/src/server/crypto";
import { getDb, type DbWrapper } from "@/src/server/db";

const ROTATION_ARCHIVE_REASON = "key_rotation_rewrap_v1";

interface StoredIntegrationSecretRow {
  provider: string;
  user_id: string;
  secret_ciphertext: string;
}

export interface IntegrationSecretRewrapSummary {
  scanned: number;
  rewrapped: number;
  alreadyCurrent: number;
}

export interface IntegrationSecretRewrapOptions {
  db?: DbWrapper;
  codec?: IntegrationSecretCodec;
  now?: () => string;
  createArchiveId?: () => string;
}

/**
 * Re-encrypt every legacy or previous-key integration secret with the current key.
 *
 * The old ciphertext is archived before replacement inside the same write
 * transaction. Any malformed row, authentication failure, archive collision, or
 * compare-and-swap miss rolls the entire operation back. The function returns
 * counts only and never emits secret material.
 */
export async function rewrapIntegrationSecrets(
  options: IntegrationSecretRewrapOptions = {},
): Promise<IntegrationSecretRewrapSummary> {
  const codec = options.codec ?? getIntegrationSecretCodec();
  const db = options.db ?? await getDb();
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const createArchiveId = options.createArchiveId ?? randomUUID;

  return db.transaction(async (transaction) => {
    const rows = await transaction.executeAll(
      `SELECT provider, user_id, secret_ciphertext
       FROM integration_settings
       WHERE secret_ciphertext IS NOT NULL
       ORDER BY user_id, provider`,
    ) as unknown as StoredIntegrationSecretRow[];

    let rewrapped = 0;
    let alreadyCurrent = 0;

    for (const row of rows) {
      const providerResult = integrationProviderSchema.safeParse(row.provider);
      if (
        !providerResult.success
        || typeof row.user_id !== "string"
        || typeof row.secret_ciphertext !== "string"
      ) {
        throw new Error("Stored integration secret ownership metadata is invalid.");
      }

      const context = { userId: row.user_id, provider: providerResult.data };
      const plaintext = codec.decrypt(row.secret_ciphertext, context);
      if (codec.isCurrentEnvelope(row.secret_ciphertext)) {
        alreadyCurrent += 1;
        continue;
      }

      const replacement = codec.encrypt(plaintext, context);
      await transaction.run(
        `INSERT INTO integration_secret_archive (
           id, provider, user_id, secret_ciphertext, ciphertext_sha256, reason, archived_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          createArchiveId(),
          row.provider,
          row.user_id,
          row.secret_ciphertext,
          createHash("sha256").update(row.secret_ciphertext).digest("hex"),
          ROTATION_ARCHIVE_REASON,
          timestamp,
        ],
      );

      const updated = await transaction.execute(
        `UPDATE integration_settings
         SET secret_ciphertext = ?, updated_at = ?
         WHERE provider = ? AND user_id = ? AND secret_ciphertext = ?
         RETURNING provider`,
        [
          replacement,
          timestamp,
          row.provider,
          row.user_id,
          row.secret_ciphertext,
        ],
      );
      if (!updated) {
        throw new Error("Integration secret changed during transactional rewrap.");
      }
      rewrapped += 1;
    }

    return {
      scanned: rows.length,
      rewrapped,
      alreadyCurrent,
    };
  });
}
