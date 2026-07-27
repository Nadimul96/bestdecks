import { createHash, randomUUID } from "node:crypto";

import { loadEnv } from "@/src/config/env";
import {
  cloudflareIntegrationConfigSchema,
  integrationProviderSchema,
  presentonIntegrationConfigSchema,
  type OnboardingPayload,
} from "@/src/domain/onboarding";
import { intakeRunSchema, type IntakeRun, type SellerKnowledge } from "@/src/domain/schemas";
import { isRichStaticQuestionnaire } from "@/src/domain/visual-profile";
import { decryptSecret, encryptSecret } from "@/src/server/crypto";
import { getDb, type DbSession } from "@/src/server/db";
import {
  INTEGRATION_ARCHIVE_QUOTA,
  reserveIntegrationArchiveCapacity,
  type IntegrationArchiveUsage,
} from "@/src/server/integration-archive-policy";
import {
  parseVerifiedShareArtifacts,
  shareCheckpointKey,
  type ShareCheckpointStage,
} from "@/src/server/shareable-deck-contract";
import {
  IntegrationSettingsValidationError,
  type IntegrationProviderKey,
  validateCloudflareIntegrationRecord,
  validatePresentonIntegrationRecord,
} from "@/src/server/settings";
import { DEFAULT_MAX_RUN_ATTEMPTS } from "@/src/server/run-queue";

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null) {
  return value ? (JSON.parse(value) as T) : undefined;
}

function parseStoredIntegrationConfig(
  value: string | null,
  provider: IntegrationProviderKey,
): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Stored provider config is not an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new IntegrationSettingsValidationError(
      provider,
      "Stored provider configuration is invalid; explicitly reset it before updating.",
    );
  }
}

function decryptStoredIntegrationSecret(
  ciphertext: string,
  userId: string,
  provider: IntegrationProviderKey,
) {
  try {
    return decryptSecret(ciphertext, { userId, provider });
  } catch {
    throw new IntegrationSettingsValidationError(
      provider,
      "Stored provider credentials are invalid; explicitly reset them before updating.",
    );
  }
}

function archiveMetric(value: number | bigint | null | undefined, label: string) {
  const metric = Number(value ?? 0);
  if (!Number.isSafeInteger(metric) || metric < 0) {
    throw new Error(`Integration archive ${label} is invalid.`);
  }
  return metric;
}

async function loadIntegrationArchiveUsage(
  transaction: DbSession,
  userId: string,
  timestamp: string,
): Promise<IntegrationArchiveUsage> {
  const windowStart = new Date(
    Date.parse(timestamp) - INTEGRATION_ARCHIVE_QUOTA.windowMs,
  ).toISOString();
  const row = await transaction.execute(
    `SELECT
       COUNT(*) AS retained_rows,
       COALESCE(SUM(payload_bytes), 0) AS retained_payload_bytes,
       COALESCE(SUM(CASE WHEN archived_at >= ? THEN 1 ELSE 0 END), 0) AS rows_in_window,
       MIN(CASE WHEN archived_at >= ? THEN archived_at ELSE NULL END) AS oldest_row_in_window_at
     FROM (
       SELECT length(CAST(config_json AS BLOB)) AS payload_bytes, archived_at
       FROM integration_config_archive
       WHERE user_id = ?
       UNION ALL
       SELECT length(CAST(secret_ciphertext AS BLOB)) AS payload_bytes, archived_at
       FROM integration_secret_archive
       WHERE user_id = ?
     )`,
    [windowStart, windowStart, userId, userId],
  ) as {
    retained_rows: number | bigint;
    retained_payload_bytes: number | bigint;
    rows_in_window: number | bigint;
    oldest_row_in_window_at: string | null;
  } | undefined;

  return {
    retainedRows: archiveMetric(row?.retained_rows, "row count"),
    retainedPayloadBytes: archiveMetric(
      row?.retained_payload_bytes,
      "payload byte count",
    ),
    rowsInWindow: archiveMetric(row?.rows_in_window, "window row count"),
    ...(row?.oldest_row_in_window_at
      ? { oldestRowInWindowAt: row.oldest_row_in_window_at }
      : {}),
  };
}

export async function saveOnboarding(payload: OnboardingPayload, userId: string) {
  const db = await getDb();
  const timestamp = now();

  await db.transaction(async (transaction) => {
    for (const provider of ["cloudflare", "presenton"] as const) {
      if ((payload.integrations ?? []).some((integration) => integration.provider === provider)) {
        continue;
      }

      const prior = await transaction.execute(
        `SELECT config_json, secret_ciphertext
         FROM integration_settings
         WHERE provider = ? AND user_id = ?
         LIMIT 1`,
        [provider, userId],
      ) as {
        config_json: string | null;
        secret_ciphertext: string | null;
      } | undefined;

      if (!prior?.config_json && !prior?.secret_ciphertext) continue;

      const record = {
        config: prior.config_json
          ? parseStoredIntegrationConfig(prior.config_json, provider)
          : undefined,
        secret: prior.secret_ciphertext
          ? decryptStoredIntegrationSecret(prior.secret_ciphertext, userId, provider)
          : undefined,
      };
      if (provider === "cloudflare") {
        validateCloudflareIntegrationRecord(record);
      } else {
        const env = loadEnv();
        validatePresentonIntegrationRecord(
          record,
          {
            nodeEnv: env.NODE_ENV,
            allowUserProviderEndpoints: env.ALLOW_USER_PROVIDER_ENDPOINTS === "1",
          },
        );
      }
    }

    let archiveUsage: IntegrationArchiveUsage | undefined;
    async function reserveArchive(payloadBytes: number) {
      archiveUsage ??= await loadIntegrationArchiveUsage(transaction, userId, timestamp);
      archiveUsage = reserveIntegrationArchiveCapacity(
        archiveUsage,
        payloadBytes,
        timestamp,
      );
    }

    const existingDrafts = await transaction.execute(
      `SELECT seller_context_json, questionnaire_json
       FROM workspace_state
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    ) as {
      seller_context_json: string | null;
      questionnaire_json: string | null;
    } | undefined;
    const sellerContextJson = payload.sellerContext
      ? JSON.stringify({
          ...(parseJson<Record<string, unknown>>(existingDrafts?.seller_context_json ?? null) ?? {}),
          ...payload.sellerContext,
        })
      : null;
    const questionnaireJson = payload.questionnaire
      ? JSON.stringify({
          ...(parseJson<Record<string, unknown>>(existingDrafts?.questionnaire_json ?? null) ?? {}),
          ...payload.questionnaire,
        })
      : null;

    await transaction.run(
    `
      INSERT INTO workspace_state (
        id, user_id, owner_name, owner_email, company_name, website_url, timezone, default_signature,
        seller_context_json, questionnaire_json, draft_websites_text, draft_contacts_csv_text,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, workspace_state.user_id),
        owner_name = COALESCE(excluded.owner_name, workspace_state.owner_name),
        owner_email = COALESCE(excluded.owner_email, workspace_state.owner_email),
        company_name = COALESCE(excluded.company_name, workspace_state.company_name),
        website_url = COALESCE(excluded.website_url, workspace_state.website_url),
        timezone = COALESCE(excluded.timezone, workspace_state.timezone),
        default_signature = COALESCE(excluded.default_signature, workspace_state.default_signature),
        seller_context_json = COALESCE(excluded.seller_context_json, workspace_state.seller_context_json),
        seller_knowledge_json = CASE WHEN excluded.seller_context_json IS NOT NULL THEN NULL ELSE workspace_state.seller_knowledge_json END,
        questionnaire_json = COALESCE(excluded.questionnaire_json, workspace_state.questionnaire_json),
        draft_websites_text = COALESCE(excluded.draft_websites_text, workspace_state.draft_websites_text),
        draft_contacts_csv_text = COALESCE(excluded.draft_contacts_csv_text, workspace_state.draft_contacts_csv_text),
        updated_at = excluded.updated_at
    `,
    [
      userId,
      userId,
      payload.profile.ownerName ?? null,
      payload.profile.ownerEmail ?? null,
      payload.profile.companyName ?? null,
      payload.profile.websiteUrl ?? null,
      payload.profile.timezone ?? null,
      payload.profile.defaultSignature ?? null,
      sellerContextJson,
      questionnaireJson,
      payload.intakeDraft?.websitesText ?? null,
      payload.intakeDraft?.contactsCsvText ?? null,
      timestamp,
      timestamp,
    ],
    );

    // Config and secret changes are computed from this tenant's prior row and
    // validated before either value is written. The write transaction makes a
    // partial authentication state impossible even under concurrent requests.
    for (const integration of payload.integrations ?? []) {
      const prior = await transaction.execute(
        `SELECT display_name, config_json, secret_ciphertext
         FROM integration_settings
         WHERE provider = ? AND user_id = ?
         LIMIT 1`,
        [integration.provider, userId],
      ) as {
        display_name: string | null;
        config_json: string | null;
        secret_ciphertext: string | null;
      } | undefined;
      const configChanged = integration.clearConfig || integration.config !== undefined;
      const secretChanged = integration.clearSecret || integration.secret !== undefined;
      const priorConfig = integration.clearConfig
        ? {}
        : parseStoredIntegrationConfig(prior?.config_json ?? null, integration.provider);
      let effectiveConfig = integration.config === undefined
        ? priorConfig
        : { ...priorConfig, ...integration.config };
      let effectiveConfigJson = configChanged
        ? integration.clearConfig && integration.config === undefined
          ? null
          : JSON.stringify(effectiveConfig)
        : prior?.config_json ?? null;
      let effectiveSecret = integration.clearSecret
        ? undefined
        : integration.secret;

      if (
        (integration.provider === "cloudflare" || integration.provider === "presenton")
        && !secretChanged
        && prior?.secret_ciphertext
      ) {
        effectiveSecret = decryptStoredIntegrationSecret(
          prior.secret_ciphertext,
          userId,
          integration.provider,
        );
      }

      if (integration.provider === "cloudflare") {
        const validated = validateCloudflareIntegrationRecord({
          config: effectiveConfigJson ? effectiveConfig : undefined,
          secret: effectiveSecret,
        });
        effectiveConfig = validated.config ?? {};
        if (configChanged) {
          effectiveConfigJson = effectiveConfigJson
            ? JSON.stringify(validated.config)
            : null;
        }
      }

      if (integration.provider === "presenton") {
        const env = loadEnv();
        const validated = validatePresentonIntegrationRecord(
          {
            config: effectiveConfigJson ? effectiveConfig : undefined,
            secret: effectiveSecret,
          },
          {
            nodeEnv: env.NODE_ENV,
            allowUserProviderEndpoints: env.ALLOW_USER_PROVIDER_ENDPOINTS === "1",
          },
        );
        effectiveConfig = validated.config;
        if (configChanged) {
          effectiveConfigJson = effectiveConfigJson
            ? JSON.stringify(validated.config)
            : null;
        }
      }

      if (
        prior?.config_json
        && configChanged
        && prior.config_json !== effectiveConfigJson
      ) {
        await reserveArchive(Buffer.byteLength(prior.config_json, "utf8"));
        await transaction.run(
          `INSERT INTO integration_config_archive (
             id, provider, user_id, config_json, config_sha256, reason, archived_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            integration.provider,
            userId,
            prior.config_json,
            createHash("sha256").update(prior.config_json).digest("hex"),
            integration.clearConfig
              ? integration.config === undefined
                ? "explicit_user_clear"
                : "explicit_user_reset"
              : "explicit_user_update",
            timestamp,
          ],
        );
      }

      if (prior?.secret_ciphertext && secretChanged) {
        await reserveArchive(Buffer.byteLength(prior.secret_ciphertext, "utf8"));
        await transaction.run(
          `INSERT INTO integration_secret_archive (
             id, provider, user_id, secret_ciphertext, ciphertext_sha256, reason, archived_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            integration.provider,
            userId,
            prior.secret_ciphertext,
            createHash("sha256").update(prior.secret_ciphertext).digest("hex"),
            integration.clearSecret ? "explicit_user_revoke" : "explicit_user_replace",
            timestamp,
          ],
        );
      }

      const effectiveSecretCiphertext = integration.clearSecret
        ? null
        : integration.secret
          ? encryptSecret(integration.secret, {
              userId,
              provider: integration.provider,
            })
          : prior?.secret_ciphertext ?? null;

      await transaction.run(
        `
          INSERT INTO integration_settings (
            provider, user_id, display_name, config_json, secret_ciphertext, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, user_id) DO UPDATE SET
            display_name = excluded.display_name,
            config_json = excluded.config_json,
            secret_ciphertext = excluded.secret_ciphertext,
            updated_at = excluded.updated_at
        `,
        [
          integration.provider,
          userId,
          integration.displayName ?? prior?.display_name ?? null,
          effectiveConfigJson,
          effectiveSecretCiphertext,
          timestamp,
        ],
      );
    }
  });
}

export async function saveSellerBriefMd(markdown: string, userId: string) {
  const db = await getDb();
  const timestamp = now();

  await db.run(
    `
      INSERT INTO workspace_state (id, user_id, seller_brief_md, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, workspace_state.user_id),
        seller_brief_md = excluded.seller_brief_md,
        updated_at = excluded.updated_at
    `,
    [userId, userId, markdown, timestamp, timestamp],
  );
}

export async function getSellerBriefMd(userId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT seller_brief_md FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ) as { seller_brief_md: string | null } | undefined;

  return row?.seller_brief_md ?? null;
}

export async function saveAudienceContext(context: Record<string, unknown>, userId: string) {
  const db = await getDb();
  const timestamp = now();

  await db.run(
    `
      INSERT INTO workspace_state (id, user_id, audience_context_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, workspace_state.user_id),
        audience_context_json = excluded.audience_context_json,
        updated_at = excluded.updated_at
    `,
    [userId, userId, JSON.stringify(context), timestamp, timestamp],
  );
}

export async function getAudienceContext(userId: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT audience_context_json FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ) as { audience_context_json: string | null } | undefined;

  if (!row?.audience_context_json) return null;
  try {
    return JSON.parse(row.audience_context_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────
   Seller Knowledge (rich context — superset of SellerContext)
   ───────────────────────────────────────────── */

export async function saveSellerKnowledge(knowledge: SellerKnowledge, userId: string) {
  const db = await getDb();
  const timestamp = now();

  const backwardCompat: IntakeRun["sellerContext"] = {
    websiteUrl: knowledge.websiteUrl,
    companyName: knowledge.companyName,
    offerSummary: knowledge.offerSummary,
    services: knowledge.services,
    differentiators: knowledge.differentiators,
    targetCustomer: knowledge.targetCustomer,
    desiredOutcome: knowledge.desiredOutcome,
    proofPoints: knowledge.proofPoints,
    constraints: knowledge.constraints,
  };

  await db.run(
    `
      INSERT INTO workspace_state (id, user_id, seller_knowledge_json, seller_context_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, workspace_state.user_id),
        seller_knowledge_json = excluded.seller_knowledge_json,
        seller_context_json = excluded.seller_context_json,
        updated_at = excluded.updated_at
    `,
    [userId, userId, JSON.stringify(knowledge), JSON.stringify(backwardCompat), timestamp, timestamp],
  );
}

export async function getSellerKnowledge(userId: string): Promise<SellerKnowledge | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT seller_knowledge_json, seller_context_json FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ) as { seller_knowledge_json: string | null; seller_context_json: string | null } | undefined;

  if (!row) return null;

  // Prefer rich knowledge if it exists
  if (row.seller_knowledge_json) {
    try {
      return JSON.parse(row.seller_knowledge_json) as SellerKnowledge;
    } catch {
      // fall through to legacy
    }
  }

  // Fall back to old sellerContext shape, augmenting with empty defaults for new fields
  if (row.seller_context_json) {
    try {
      const legacy = JSON.parse(row.seller_context_json) as IntakeRun["sellerContext"];
      return {
        websiteUrl: legacy.websiteUrl,
        companyName: legacy.companyName,
        offerSummary: legacy.offerSummary,
        services: legacy.services,
        differentiators: legacy.differentiators,
        targetCustomer: legacy.targetCustomer,
        desiredOutcome: legacy.desiredOutcome,
        proofPoints: legacy.proofPoints ?? [],
        constraints: legacy.constraints ?? [],
        caseStudies: [],
        clientLogos: [],
        awards: [],
        commonObjections: [],
      };
    } catch {
      return null;
    }
  }

  return null;
}

interface StoredIntegrationProjectionRow {
  provider: string;
  display_name: string | null;
  config_json: string | null;
  secret_ciphertext: string | null;
}

interface OnboardingIntegrationProjection {
  provider: IntegrationProviderKey;
  displayName?: string;
  config?: Record<string, unknown>;
  hasSecret: boolean;
  needsRepair?: true;
}

function projectStoredIntegrationForOnboarding(
  row: StoredIntegrationProjectionRow,
  userId: string,
  presentonPolicy: {
    nodeEnv: "development" | "test" | "production";
    allowUserProviderEndpoints: boolean;
  },
): OnboardingIntegrationProjection | undefined {
  const parsedProvider = integrationProviderSchema.safeParse(row.provider);
  if (!parsedProvider.success) return undefined;

  const provider = parsedProvider.data;
  const hasSecret = Boolean(row.secret_ciphertext);
  const displayName = row.display_name?.trim() ? row.display_name : undefined;
  if (!row.config_json && !hasSecret && !displayName) return undefined;

  let config: Record<string, unknown> | undefined;
  let needsRepair = false;
  if (row.config_json) {
    try {
      config = parseStoredIntegrationConfig(row.config_json, provider);
    } catch {
      needsRepair = true;
    }
  }

  if (provider === "presenton") {
    const parsedConfig = presentonIntegrationConfigSchema.safeParse(config ?? {});
    if (parsedConfig.success) {
      config = config === undefined ? undefined : parsedConfig.data;
    } else {
      config = undefined;
      needsRepair = true;
    }

    let secret: string | undefined;
    if (row.secret_ciphertext) {
      try {
        secret = decryptSecret(row.secret_ciphertext, { userId, provider });
      } catch {
        needsRepair = true;
      }
    }

    try {
      validatePresentonIntegrationRecord({ config, secret }, presentonPolicy);
    } catch {
      needsRepair = true;
    }
  } else if (provider === "cloudflare") {
    const parsedConfig = cloudflareIntegrationConfigSchema.safeParse(config ?? {});
    if (row.config_json && !parsedConfig.success) {
      config = undefined;
      needsRepair = true;
    } else {
      config = row.config_json ? parsedConfig.data : undefined;
    }

    let secret: string | undefined;
    if (row.secret_ciphertext) {
      try {
        secret = decryptSecret(row.secret_ciphertext, { userId, provider });
      } catch {
        needsRepair = true;
      }
    }

    try {
      validateCloudflareIntegrationRecord({ config, secret });
    } catch {
      needsRepair = true;
    }
  } else if (config && Object.keys(config).length > 0) {
    config = undefined;
    needsRepair = true;
  } else {
    config = undefined;
  }

  if (!config && !hasSecret && !displayName && !needsRepair) return undefined;

  return {
    provider,
    displayName,
    config,
    hasSecret,
    ...(needsRepair ? { needsRepair: true as const } : {}),
  };
}

export async function getOnboarding(userId: string) {
  const db = await getDb();
  const row = await db.execute(
    "SELECT * FROM workspace_state WHERE user_id = ? LIMIT 1",
    [userId],
  ) as
    | {
        owner_name: string | null;
        owner_email: string | null;
        company_name: string | null;
        website_url: string | null;
        timezone: string | null;
        default_signature: string | null;
        seller_context_json: string | null;
        questionnaire_json: string | null;
        draft_websites_text: string | null;
        draft_contacts_csv_text: string | null;
        seller_brief_md: string | null;
        seller_knowledge_json: string | null;
      }
    | undefined;

  const integrations = await db.executeAll(
    `
      SELECT provider, display_name, config_json, secret_ciphertext
      FROM integration_settings
      WHERE user_id = ?
      ORDER BY provider
    `,
    [userId],
  ) as unknown as StoredIntegrationProjectionRow[];

  const env = loadEnv();
  const effectiveIntegrations = integrations.flatMap((integration) => {
    const projected = projectStoredIntegrationForOnboarding(
      integration,
      userId,
      {
        nodeEnv: env.NODE_ENV,
        allowUserProviderEndpoints: env.ALLOW_USER_PROVIDER_ENDPOINTS === "1",
      },
    );
    return projected ? [projected] : [];
  });

  return {
    profile: row
      ? {
          ownerName: row.owner_name ?? undefined,
          ownerEmail: row.owner_email ?? undefined,
          companyName: row.company_name ?? undefined,
          websiteUrl: row.website_url ?? undefined,
          timezone: row.timezone ?? undefined,
          defaultSignature: row.default_signature ?? undefined,
        }
      : {},
    sellerContext: parseJson<IntakeRun["sellerContext"]>(row?.seller_context_json ?? null),
    questionnaire: parseJson<IntakeRun["questionnaire"]>(row?.questionnaire_json ?? null),
    sellerBriefMd: row?.seller_brief_md ?? undefined,
    sellerKnowledge: parseJson<SellerKnowledge>(row?.seller_knowledge_json ?? null),
    intakeDraft: {
      websitesText: row?.draft_websites_text ?? undefined,
      contactsCsvText: row?.draft_contacts_csv_text ?? undefined,
    },
    integrations: effectiveIntegrations,
  };
}

export async function createRun(input: IntakeRun, userId: string) {
  return createRunWithOptions(input, userId);
}

const RUN_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const MAX_ACTIVE_RUNS_PER_USER = 3;
const MAX_ACTIVE_TARGETS_PER_USER = 100;
const MAX_RUNS_PER_USER_PER_HOUR = 10;
const MAX_TARGETS_PER_USER_PER_HOUR = 300;
const MAX_RUN_ADMISSION_REQUESTS_PER_HOUR = 30;
const RUN_ADMISSION_WINDOW_MS = 60 * 60 * 1_000;

export class RunAdmissionError extends Error {
  public constructor(
    public readonly code:
      | "idempotency_conflict"
      | "active_run_limit"
      | "hourly_run_limit"
      | "request_rate_limit",
  ) {
    super(`Run admission rejected (${code}).`);
    this.name = "RunAdmissionError";
  }
}

export interface RunAdmissionPreflightResult {
  replay?: {
    runId: string;
    state: string;
  };
}

function assertReferenceRunProfile(input: IntakeRun) {
  if (input.questionnaire.outputFormat !== "pptx") {
    throw new RangeError("Reference run admission requires PPTX output.");
  }
  if (!isRichStaticQuestionnaire(input.questionnaire)) {
    throw new RangeError(
      "Reference run admission requires the verified rich-static vector profile.",
    );
  }
}

/**
 * Reserve one authenticated admission attempt before any DNS work. The final
 * create transaction repeats paid-work quotas, so this early check is an
 * abuse boundary rather than a replacement for atomic admission.
 */
export async function preflightRunAdmission(
  input: IntakeRun,
  userId: string,
  idempotencyKey: string,
  options: { now?: Date } = {},
): Promise<RunAdmissionPreflightResult> {
  const parsed = intakeRunSchema.parse(input);
  assertReferenceRunProfile(parsed);
  if (!userId.trim() || !RUN_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new RangeError("Run admission preflight input is invalid.");
  }
  const timestamp = (options.now ?? new Date()).toISOString();
  const timestampMs = Date.parse(timestamp);
  const requestSha256 = createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
  const db = await getDb();

  return db.transaction(async (transaction) => {
    const existing = await transaction.execute(
      `SELECT a.run_id, a.request_sha256, j.state
       FROM run_admissions AS a
       JOIN run_jobs AS j ON j.run_id = a.run_id
       WHERE a.user_id = ? AND a.idempotency_key = ?
       LIMIT 1`,
      [userId, idempotencyKey],
    ) as { run_id: string; request_sha256: string; state: string } | undefined;
    if (existing) {
      if (existing.request_sha256 !== requestSha256) {
        throw new RunAdmissionError("idempotency_conflict");
      }
      return { replay: { runId: existing.run_id, state: existing.state } };
    }

    const rateLimit = await transaction.execute(
      `SELECT window_started_at, request_count
       FROM run_admission_rate_limits
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    ) as { window_started_at: string; request_count: number | bigint } | undefined;
    const windowStartedMs = rateLimit ? Date.parse(rateLimit.window_started_at) : Number.NaN;
    const inCurrentWindow = Number.isFinite(windowStartedMs)
      && timestampMs - windowStartedMs >= 0
      && timestampMs - windowStartedMs < RUN_ADMISSION_WINDOW_MS;
    if (inCurrentWindow && Number(rateLimit?.request_count ?? 0) >= MAX_RUN_ADMISSION_REQUESTS_PER_HOUR) {
      throw new RunAdmissionError("request_rate_limit");
    }
    if (rateLimit && inCurrentWindow) {
      await transaction.run(
        `UPDATE run_admission_rate_limits
         SET request_count = request_count + 1, updated_at = ?
         WHERE user_id = ?`,
        [timestamp, userId],
      );
    } else {
      await transaction.run(
        `INSERT INTO run_admission_rate_limits (
           user_id, window_started_at, request_count, updated_at
         ) VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           request_count = 1,
           updated_at = excluded.updated_at`,
        [userId, timestamp, timestamp],
      );
    }

    const active = await transaction.execute(
      `SELECT COUNT(*) AS run_count, COALESCE(SUM(r.target_count), 0) AS target_count
       FROM run_jobs AS j
       JOIN runs AS r ON r.id = j.run_id
       WHERE r.user_id = ?
         AND j.state NOT IN ('delivered', 'partially_completed', 'failed', 'cancelled')`,
      [userId],
    ) as { run_count: number | bigint; target_count: number | bigint } | undefined;
    if (
      Number(active?.run_count ?? 0) >= MAX_ACTIVE_RUNS_PER_USER
      || Number(active?.target_count ?? 0) + parsed.targets.length > MAX_ACTIVE_TARGETS_PER_USER
    ) {
      throw new RunAdmissionError("active_run_limit");
    }

    const oneHourAgo = new Date(timestampMs - RUN_ADMISSION_WINDOW_MS).toISOString();
    const hourly = await transaction.execute(
      `SELECT COUNT(*) AS run_count, COALESCE(SUM(target_count), 0) AS target_count
       FROM runs
       WHERE user_id = ? AND created_at >= ?`,
      [userId, oneHourAgo],
    ) as { run_count: number | bigint; target_count: number | bigint } | undefined;
    if (
      Number(hourly?.run_count ?? 0) >= MAX_RUNS_PER_USER_PER_HOUR
      || Number(hourly?.target_count ?? 0) + parsed.targets.length > MAX_TARGETS_PER_USER_PER_HOUR
    ) {
      throw new RunAdmissionError("hourly_run_limit");
    }

    return {};
  });
}

export async function createRunWithOptions(
  input: IntakeRun,
  userId: string,
  options: { idempotencyKey?: string } = {},
) {
  const parsed = intakeRunSchema.parse(input);
  assertReferenceRunProfile(parsed);
  if (userId.trim().length === 0) {
    throw new RangeError("A run owner is required.");
  }
  const db = await getDb();
  const runId = randomUUID();
  const timestamp = now();
  const requestSha256 = createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
  if (
    options.idempotencyKey !== undefined
    && !RUN_IDEMPOTENCY_KEY_PATTERN.test(options.idempotencyKey)
  ) {
    throw new RangeError("Run idempotency key is invalid.");
  }

  return db.transaction(async (transaction) => {
    if (options.idempotencyKey) {
      const existing = await transaction.execute(
        `SELECT run_id, request_sha256
         FROM run_admissions
         WHERE user_id = ? AND idempotency_key = ?
         LIMIT 1`,
        [userId, options.idempotencyKey],
      ) as { run_id: string; request_sha256: string } | undefined;
      if (existing) {
        if (existing.request_sha256 !== requestSha256) {
          throw new RunAdmissionError("idempotency_conflict");
        }
        return existing.run_id;
      }

      const active = await transaction.execute(
        `SELECT COUNT(*) AS run_count, COALESCE(SUM(r.target_count), 0) AS target_count
         FROM run_jobs AS j
         JOIN runs AS r ON r.id = j.run_id
         WHERE r.user_id = ?
           AND j.state NOT IN ('delivered', 'partially_completed', 'failed', 'cancelled')`,
        [userId],
      ) as { run_count: number | bigint; target_count: number | bigint } | undefined;
      if (
        Number(active?.run_count ?? 0) >= MAX_ACTIVE_RUNS_PER_USER
        || Number(active?.target_count ?? 0) + parsed.targets.length > MAX_ACTIVE_TARGETS_PER_USER
      ) {
        throw new RunAdmissionError("active_run_limit");
      }

      const oneHourAgo = new Date(Date.parse(timestamp) - 60 * 60 * 1_000).toISOString();
      const hourly = await transaction.execute(
        `SELECT COUNT(*) AS run_count, COALESCE(SUM(target_count), 0) AS target_count
         FROM runs
         WHERE user_id = ? AND created_at >= ?`,
        [userId, oneHourAgo],
      ) as { run_count: number | bigint; target_count: number | bigint } | undefined;
      if (
        Number(hourly?.run_count ?? 0) >= MAX_RUNS_PER_USER_PER_HOUR
        || Number(hourly?.target_count ?? 0) + parsed.targets.length
          > MAX_TARGETS_PER_USER_PER_HOUR
      ) {
        throw new RunAdmissionError("hourly_run_limit");
      }
    }

    await transaction.run(
      `INSERT INTO runs (
         id, status, seller_context_json, questionnaire_json, target_count, delivery_format,
         review_gate_enabled, user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        "queued",
        JSON.stringify(parsed.sellerContext),
        JSON.stringify(parsed.questionnaire),
        parsed.targets.length,
        parsed.questionnaire.outputFormat,
        parsed.questionnaire.optionalReview ? 1 : 0,
        userId,
        timestamp,
        timestamp,
      ],
    );

    for (const [targetOrdinal, target] of parsed.targets.entries()) {
      await transaction.run(
        `
          INSERT INTO run_targets (
            id, run_id, target_ordinal, website_url, company_name, first_name, last_name,
            role, campaign_goal, notes, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          randomUUID(),
          runId,
          targetOrdinal,
          target.websiteUrl,
          target.companyName ?? null,
          target.firstName ?? null,
          target.lastName ?? null,
          target.role ?? null,
          target.campaignGoal ?? null,
          target.notes ?? null,
          "queued",
          timestamp,
          timestamp,
        ],
      );
    }

    await transaction.run(
      `INSERT INTO run_events (
         id, run_id, idempotency_key, stage, level, message, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        runId,
        "run-created",
        "run_created",
        "info",
        `Run created with ${parsed.targets.length} target rows.`,
        timestamp,
      ],
    );

    await transaction.run(
      `INSERT INTO run_jobs (
         run_id, state, attempt_count, max_attempts, next_attempt_at,
         state_changed_at, created_at, updated_at
       ) VALUES (?, 'queued', 0, ?, ?, ?, ?, ?)`,
      [
        runId,
        DEFAULT_MAX_RUN_ATTEMPTS,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      ],
    );

    if (options.idempotencyKey) {
      await transaction.run(
        `INSERT INTO run_admissions (
           user_id, idempotency_key, request_sha256, run_id, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [userId, options.idempotencyKey, requestSha256, runId, timestamp],
      );
    }
    return runId;
  });
}

/**
 * Full internal run record used by focused repository/worker tests. Do not
 * expose this result through an HTTP route; it includes retained artifacts.
 * User-facing reads must use getRunPipelineDetail or a purpose-built projection.
 */
export async function getRun(runId: string, userId: string) {
  const db = await getDb();
  const run = await db.execute("SELECT * FROM runs WHERE id = ? LIMIT 1", [runId]) as
    | {
        id: string;
        status: string;
        seller_context_json: string;
        questionnaire_json: string;
        target_count: number;
        delivery_format: string;
        review_gate_enabled: number;
        seller_brief_json: string | null;
        last_error: string | null;
        user_id: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!run) {
    return null;
  }

  // Ownership check: verify the requesting user owns this run
  if (run.user_id !== userId) {
    return null; // Treat as "not found" to prevent enumeration
  }

  // Fetch targets, artifacts, and events in parallel for faster loading
  const [targets, artifacts, events] = await Promise.all([
    db.executeAll(
      "SELECT * FROM run_targets WHERE run_id = ? ORDER BY target_ordinal ASC, id ASC",
      [runId],
    ),
    db.executeAll(
      "SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC",
      [runId],
    ),
    db.executeAll(
      "SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at ASC",
      [runId],
    ),
  ]);

  return {
    id: run.id,
    status: run.status,
    targetCount: run.target_count,
    deliveryFormat: run.delivery_format,
    reviewGateEnabled: Boolean(run.review_gate_enabled),
    sellerContext: JSON.parse(run.seller_context_json),
    questionnaire: JSON.parse(run.questionnaire_json),
    sellerBrief: parseJson(run.seller_brief_json),
    lastError: run.last_error ?? undefined,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    targets,
    artifacts: (artifacts as unknown as Array<{ artifact_json: string | unknown; [key: string]: unknown }>).map((artifact) => ({
      ...artifact,
      artifact_json:
        typeof artifact.artifact_json === "string"
          ? JSON.parse(artifact.artifact_json)
          : artifact.artifact_json,
    })),
    events,
  };
}

const MAX_PIPELINE_TARGETS = 100;
const MAX_PIPELINE_EVENTS = 200;

export class RunDetailCursorError extends Error {
  public constructor() {
    super("Run event cursor is invalid.");
    this.name = "RunDetailCursorError";
  }
}

export class RunDetailLimitError extends Error {
  public constructor() {
    super("Run detail exceeds the supported projection boundary.");
    this.name = "RunDetailLimitError";
  }
}

export interface RunEventCursor {
  createdAt: string;
  id: string;
}

export function decodeRunEventCursor(value: string): RunEventCursor {
  if (!value || value.length > 1_024) throw new RunDetailCursorError();
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new RunDetailCursorError();
    const [createdAt, id] = decoded;
    if (
      typeof createdAt !== "string"
      || createdAt.length > 64
      || !Number.isFinite(Date.parse(createdAt))
      || typeof id !== "string"
      || id.length < 1
      || id.length > 512
    ) {
      throw new RunDetailCursorError();
    }
    return { createdAt, id };
  } catch (error) {
    if (error instanceof RunDetailCursorError) throw error;
    throw new RunDetailCursorError();
  }
}

function encodeRunEventCursor(cursor: RunEventCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id]), "utf8").toString("base64url");
}

/**
 * Project only the bounded state consumed by the pipeline UI. Raw artifacts,
 * full model inputs, and provider payloads deliberately stay off this route.
 */
export async function getRunPipelineDetail(
  runId: string,
  userId: string,
  options: {
    eventCursor?: RunEventCursor;
    eventLimit?: number;
  } = {},
) {
  const eventLimit = options.eventLimit ?? MAX_PIPELINE_EVENTS;
  if (!Number.isSafeInteger(eventLimit) || eventLimit < 1 || eventLimit > MAX_PIPELINE_EVENTS) {
    throw new RunDetailLimitError();
  }

  const db = await getDb();
  const run = await db.execute(
    `SELECT id, status, seller_context_json, target_count, last_error, user_id,
            created_at, updated_at
     FROM runs
     WHERE id = ?
     LIMIT 1`,
    [runId],
  ) as {
    id: string;
    status: string;
    seller_context_json: string;
    target_count: number | bigint;
    last_error: string | null;
    user_id: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!run || run.user_id !== userId) return null;

  const eventCursor = options.eventCursor;
  const [targets, eventRows] = await Promise.all([
    db.executeAll(
      `SELECT id, website_url, company_name, status, crawl_provider,
              substr(last_error, 1, 1000) AS last_error, created_at
       FROM run_targets
       WHERE run_id = ?
       ORDER BY target_ordinal ASC, id ASC
       LIMIT ?`,
      [runId, MAX_PIPELINE_TARGETS + 1],
    ),
    db.executeAll(
      `SELECT id, substr(stage, 1, 100) AS stage, level,
              substr(message, 1, 256) AS message, created_at
       FROM run_events
       WHERE run_id = ?
         ${eventCursor
          ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
          : ""}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      eventCursor
        ? [
            runId,
            eventCursor.createdAt,
            eventCursor.createdAt,
            eventCursor.id,
            eventLimit + 1,
          ]
        : [runId, eventLimit + 1],
    ),
  ]);

  if (targets.length > MAX_PIPELINE_TARGETS) throw new RunDetailLimitError();

  const hasMoreEvents = eventRows.length > eventLimit;
  const selectedEvents = eventRows.slice(0, eventLimit) as unknown as Array<{
    id: string;
    stage: string | null;
    level: string;
    message: string;
    created_at: string;
  }>;
  const oldestEvent = selectedEvents.at(-1);
  const sellerContext = JSON.parse(run.seller_context_json) as { companyName?: unknown };

  return {
    id: run.id,
    status: run.status,
    targetCount: Number(run.target_count),
    sellerContext: {
      companyName: typeof sellerContext.companyName === "string"
        ? sellerContext.companyName.slice(0, 300)
        : undefined,
    },
    lastError: run.last_error?.slice(0, 1_000) || undefined,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    targets,
    events: selectedEvents.reverse().map((event) => ({
      ...event,
      level: event.level === "info" || event.level === "warning" || event.level === "error"
        ? event.level
        : "error",
    })),
    eventPage: {
      hasMore: hasMoreEvents,
      nextCursor: hasMoreEvents && oldestEvent
        ? encodeRunEventCursor({ createdAt: oldestEvent.created_at, id: oldestEvent.id })
        : undefined,
    },
  };
}

/** Lightweight owner check for launch/cancel controls; never loads artifacts. */
export async function getOwnedRunState(runId: string, userId: string) {
  const db = await getDb();
  return await db.execute(
    `SELECT id, status, delivery_format AS deliveryFormat
     FROM runs
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [runId, userId],
  ) as { id: string; status: string; deliveryFormat: string } | undefined;
}

export interface RunExecutionTarget {
  id: string;
  ordinal: number;
  input: IntakeRun["targets"][number];
}

export interface RunExecutionContext {
  runId: string;
  userId: string;
  input: Omit<IntakeRun, "targets">;
  targets: RunExecutionTarget[];
  sellerContactInfo: {
    companyName?: string;
    email?: string;
    website?: string;
  };
}

/**
 * Load the immutable, owner-bound input used by the background worker. The
 * worker never relies on an unauthenticated API-shaped repository read.
 */
export async function getRunExecutionContext(
  runId: string,
): Promise<RunExecutionContext | null> {
  const db = await getDb();
  const run = await db.execute(
    `SELECT id, user_id, seller_context_json, questionnaire_json, target_count
     FROM runs WHERE id = ? LIMIT 1`,
    [runId],
  ) as {
    id: string;
    user_id: string | null;
    seller_context_json: string;
    questionnaire_json: string;
    target_count: number | bigint;
  } | undefined;

  if (!run) return null;
  if (!run.user_id?.trim()) {
    throw new Error("Run execution is blocked because the run has no explicit owner.");
  }

  const rows = await db.executeAll(
    `SELECT id, target_ordinal, website_url, company_name, first_name, last_name,
            role, campaign_goal, notes
     FROM run_targets
     WHERE run_id = ?
     ORDER BY target_ordinal ASC, id ASC`,
    [runId],
  ) as unknown as Array<{
    id: string;
    target_ordinal: number | bigint;
    website_url: string;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    campaign_goal: string | null;
    notes: string | null;
  }>;

  const targets = rows.map((row, index): RunExecutionTarget => {
    const ordinal = Number(row.target_ordinal);
    if (!Number.isSafeInteger(ordinal) || ordinal !== index) {
      throw new Error("Run execution is blocked because target ordering is inconsistent.");
    }
    return {
      id: row.id,
      ordinal,
      input: {
        websiteUrl: row.website_url,
        ...(row.company_name ? { companyName: row.company_name } : {}),
        ...(row.first_name ? { firstName: row.first_name } : {}),
        ...(row.last_name ? { lastName: row.last_name } : {}),
        ...(row.role ? { role: row.role } : {}),
        ...(row.campaign_goal ? { campaignGoal: row.campaign_goal } : {}),
        ...(row.notes ? { notes: row.notes } : {}),
      },
    };
  });

  if (targets.length !== Number(run.target_count)) {
    throw new Error("Run execution is blocked because its target count is inconsistent.");
  }

  const parsed = intakeRunSchema.parse({
    sellerContext: JSON.parse(run.seller_context_json),
    questionnaire: JSON.parse(run.questionnaire_json),
    targets: targets.map((target) => target.input),
  });
  const profile = await db.execute(
    `SELECT company_name, owner_email, website_url
     FROM workspace_state WHERE user_id = ? LIMIT 1`,
    [run.user_id],
  ) as {
    company_name: string | null;
    owner_email: string | null;
    website_url: string | null;
  } | undefined;

  return {
    runId: run.id,
    userId: run.user_id,
    input: {
      sellerContext: parsed.sellerContext,
      questionnaire: parsed.questionnaire,
    },
    targets,
    sellerContactInfo: {
      ...(profile?.company_name ? { companyName: profile.company_name } : {}),
      ...(profile?.owner_email ? { email: profile.owner_email } : {}),
      ...(profile?.website_url ? { website: profile.website_url } : {}),
    },
  };
}

export async function listRuns(userId: string) {
  const db = await getDb();
  return db.executeAll(
    `SELECT r.id, r.status, r.target_count, r.delivery_format, r.created_at, r.updated_at,
            (SELECT rt.website_url FROM run_targets rt WHERE rt.run_id = r.id ORDER BY rt.target_ordinal ASC, rt.id ASC LIMIT 1) AS first_target_url
     FROM runs r WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT ?`,
    [userId, 100],
  );
}

/** Lightweight count query — avoids fetching full run data just for a count. */
export async function countRuns(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.execute("SELECT COUNT(*) AS cnt FROM runs WHERE user_id = ?", [userId]) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

function parseArtifactJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function deliveryEvidenceSummary(
  verified: NonNullable<ReturnType<typeof parseVerifiedShareArtifacts>>,
) {
  const { coverage, unsupportedFactualClaimIds } = verified.planning.evidenceEvaluation;
  return {
    coverage,
    unsupportedFactualClaimCount: unsupportedFactualClaimIds.length,
    readiness: verified.delivery.readiness,
  };
}

/**
 * Bulk fetch the most recent delivery data in just 3 DB queries.
 * Replaces the N+1 pattern of: listRuns() + getRun(id) per run.
 *
 * Returns runs that have at least one completed/delivered target, along with
 * their targets and a bounded delivery/evidence projection. Raw provider URLs,
 * full slide plans, and crawl/enrichment artifacts never leave this endpoint.
 */
export async function listDeliveryDecks(userId: string) {
  const db = await getDb();
  const currentTime = now();

  // 1. Get all runs that are relevant for delivery
  const runs = await db.executeAll(
    `SELECT r.id, r.status, r.delivery_format, r.created_at
     FROM runs r
     WHERE r.status IN ('delivered', 'partially_completed')
       AND r.user_id = ?
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [userId, 25],
  ) as unknown as Array<{
    id: string;
    status: string;
    delivery_format: string;
    created_at: string;
  }>;

  if (runs.length === 0) return [];

  // 2. Get all targets for these runs in ONE query
  const runIds = runs.map((r) => r.id);
  const placeholders = runIds.map(() => "?").join(",");

  const targets = await db.executeAll(
    `SELECT
       id,
       run_id,
       website_url,
       company_name,
       status,
       last_error,
       created_at,
       (
         SELECT sd.slug
         FROM shareable_decks sd
         WHERE sd.target_id = run_targets.id
           AND run_targets.status = 'delivered'
           AND sd.is_active = 1
           AND sd.expires_at IS NOT NULL
           AND sd.expires_at > ?
           AND sd.run_id = run_targets.run_id
           AND sd.created_by = ?
         ORDER BY sd.created_at DESC
         LIMIT 1
       ) AS share_slug
     FROM run_targets
     WHERE run_id IN (${placeholders})
     ORDER BY target_ordinal ASC, id ASC`,
    [currentTime, userId, ...runIds],
  ) as unknown as Array<{
    id: string;
    run_id: string;
    website_url: string;
    company_name: string | null;
    status: string;
    last_error: string | null;
    created_at: string;
    share_slug: string | null;
  }>;

  // 3. Delivery and share eligibility come only from committed state-machine
  // checkpoints, never artifact mirrors written immediately before a lease loss.
  const checkpointRows = await db.executeAll(
    `SELECT run_id, checkpoint_key, stage, metadata_json, completed_at
     FROM run_checkpoints
     WHERE run_id IN (${placeholders})
       AND stage IN ('planning', 'rendering')
     ORDER BY completed_at ASC, checkpoint_key ASC`,
    runIds,
  ) as unknown as Array<{
    run_id: string;
    checkpoint_key: string;
    stage: string;
    metadata_json: string | null;
    completed_at: string;
  }>;

  const checkpointOwners = new Map<string, {
    targetId: string;
    stage: ShareCheckpointStage;
  }>();
  for (const target of targets) {
    for (const stage of ["planning", "rendering"] as const) {
      checkpointOwners.set(
        `${target.run_id}\u0000${shareCheckpointKey(target.id, stage)}`,
        { targetId: target.id, stage },
      );
    }
  }

  const checkpointsByTarget = new Map<string, Map<ShareCheckpointStage, unknown>>();
  for (const checkpoint of checkpointRows) {
    const owner = checkpointOwners.get(
      `${checkpoint.run_id}\u0000${checkpoint.checkpoint_key}`,
    );
    if (!owner || checkpoint.stage !== owner.stage) continue;

    const byStage = checkpointsByTarget.get(owner.targetId)
      ?? new Map<ShareCheckpointStage, unknown>();
    byStage.set(owner.stage, parseArtifactJson(checkpoint.metadata_json));
    checkpointsByTarget.set(owner.targetId, byStage);
  }

  // Index runs by id
  const runMap = new Map(runs.map((r) => [r.id, r]));

  // Build flat deck cards
  return targets.map((target) => {
    const run = runMap.get(target.run_id)!;
    const shareCheckpoints = checkpointsByTarget.get(target.id);
    const verified = target.status === "delivered"
      ? parseVerifiedShareArtifacts(
          shareCheckpoints?.get("planning"),
          shareCheckpoints?.get("rendering"),
        )
      : null;
    return {
      targetId: target.id,
      runId: target.run_id,
      companyName: target.company_name ?? "",
      websiteUrl: target.website_url,
      status: target.status,
      format: run.delivery_format,
      createdAt: target.created_at,
      downloadAvailable: Boolean(verified?.delivery.result.exportUrl),
      evidence: verified ? deliveryEvidenceSummary(verified) : undefined,
      shareSlug: target.status === "delivered" ? target.share_slug ?? undefined : undefined,
      canShare: Boolean(verified),
    };
  });
}

export async function updateRun(runId: string, values: {
  status?: string;
  sellerBriefJson?: unknown;
  lastError?: string | null;
}) {
  const db = await getDb();
  const existing = await db.execute("SELECT * FROM runs WHERE id = ? LIMIT 1", [runId]) as
    | { status: string; seller_brief_json: string | null; last_error: string | null }
    | undefined;
  if (!existing) {
    throw new Error(`Run ${runId} was not found.`);
  }

  await db.run(
    `
      UPDATE runs
      SET status = ?, seller_brief_json = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      values.status ?? existing.status,
      values.sellerBriefJson === undefined
        ? existing.seller_brief_json
        : JSON.stringify(values.sellerBriefJson),
      values.lastError === undefined ? existing.last_error : values.lastError,
      now(),
      runId,
    ],
  );
}

export async function updateRunTarget(
  targetId: string,
  values: {
    status?: string;
    crawlProvider?: string | null;
    lastError?: string | null;
  },
) {
  const db = await getDb();
  const existing = await db.execute(
    "SELECT status, crawl_provider, last_error FROM run_targets WHERE id = ? LIMIT 1",
    [targetId],
  ) as
    | { status: string; crawl_provider: string | null; last_error: string | null }
    | undefined;

  if (!existing) {
    throw new Error(`Run target ${targetId} was not found.`);
  }

  await db.run(
    `
      UPDATE run_targets
      SET status = ?, crawl_provider = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      values.status ?? existing.status,
      values.crawlProvider === undefined ? existing.crawl_provider : values.crawlProvider,
      values.lastError === undefined ? existing.last_error : values.lastError,
      now(),
      targetId,
    ],
  );
}

export async function addArtifact(runId: string, input: {
  targetId?: string;
  idempotencyKey?: string;
  artifactType: string;
  artifactJson: unknown;
}) {
  const db = await getDb();
  const artifactId = randomUUID();
  await db.run(
    `
      INSERT INTO run_artifacts (
        id, run_id, target_id, idempotency_key, artifact_type, artifact_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET
        target_id = excluded.target_id,
        artifact_type = excluded.artifact_type,
        artifact_json = excluded.artifact_json
    `,
    [
      artifactId,
      runId,
      input.targetId ?? null,
      input.idempotencyKey ?? null,
      input.artifactType,
      JSON.stringify(input.artifactJson),
      now(),
    ],
  );
  return artifactId;
}

export async function addRunEvent(runId: string, input: {
  targetId?: string;
  idempotencyKey?: string;
  stage?: string;
  level: "info" | "warning" | "error";
  message: string;
}) {
  const db = await getDb();
  await db.run(
    `
      INSERT INTO run_events (
        id, run_id, target_id, idempotency_key, stage, level, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    `,
    [
      randomUUID(),
      runId,
      input.targetId ?? null,
      input.idempotencyKey ?? null,
      input.stage ?? null,
      input.level,
      input.message,
      now(),
    ],
  );
}

export {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
  getPublicShareableDeck,
  getShareableLink,
  mapSlidePlanToPublicSlides,
} from "./shareable-decks";
