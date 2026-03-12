import { randomUUID } from "node:crypto";

import { intakeRunSchema, type IntakeRun } from "@/src/domain/schemas";
import { encryptSecret } from "@/src/server/crypto";
import { getDb } from "@/src/server/db";
import {
  resolveIntegrationConfig,
  type IntegrationProviderKey,
} from "@/src/server/settings";

export interface OnboardingPayload {
  profile: {
    ownerName?: string;
    ownerEmail?: string;
    companyName?: string;
    websiteUrl?: string;
    timezone?: string;
    defaultSignature?: string;
  };
  sellerContext?: IntakeRun["sellerContext"];
  questionnaire?: IntakeRun["questionnaire"];
  integrations?: Array<{
    provider: IntegrationProviderKey;
    displayName?: string;
    config?: Record<string, unknown>;
    secret?: string;
  }>;
  intakeDraft?: {
    websitesText?: string;
    contactsCsvText?: string;
  };
}

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null) {
  return value ? (JSON.parse(value) as T) : undefined;
}

export function saveOnboarding(payload: OnboardingPayload) {
  const db = getDb();
  const timestamp = now();

  db.prepare(
    `
      INSERT INTO workspace_state (
        id, owner_name, owner_email, company_name, website_url, timezone, default_signature,
        seller_context_json, questionnaire_json, draft_websites_text, draft_contacts_csv_text,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_name = excluded.owner_name,
        owner_email = excluded.owner_email,
        company_name = excluded.company_name,
        website_url = excluded.website_url,
        timezone = excluded.timezone,
        default_signature = excluded.default_signature,
        seller_context_json = excluded.seller_context_json,
        questionnaire_json = excluded.questionnaire_json,
        draft_websites_text = excluded.draft_websites_text,
        draft_contacts_csv_text = excluded.draft_contacts_csv_text,
        updated_at = excluded.updated_at
    `,
  ).run(
    "default",
    payload.profile.ownerName ?? null,
    payload.profile.ownerEmail ?? null,
    payload.profile.companyName ?? null,
    payload.profile.websiteUrl ?? null,
    payload.profile.timezone ?? null,
    payload.profile.defaultSignature ?? null,
    payload.sellerContext ? JSON.stringify(payload.sellerContext) : null,
    payload.questionnaire ? JSON.stringify(payload.questionnaire) : null,
    payload.intakeDraft?.websitesText ?? null,
    payload.intakeDraft?.contactsCsvText ?? null,
    timestamp,
    timestamp,
  );

  for (const integration of payload.integrations ?? []) {
    db.prepare(
      `
        INSERT INTO integration_settings (provider, display_name, config_json, secret_ciphertext, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(provider) DO UPDATE SET
          display_name = excluded.display_name,
          config_json = excluded.config_json,
          secret_ciphertext = COALESCE(excluded.secret_ciphertext, integration_settings.secret_ciphertext),
          updated_at = excluded.updated_at
      `,
    ).run(
      integration.provider,
      integration.displayName ?? null,
      integration.config ? JSON.stringify(integration.config) : null,
      integration.secret ? encryptSecret(integration.secret) : null,
      timestamp,
    );
  }
}

export function getOnboarding() {
  const db = getDb();
  const resolved = resolveIntegrationConfig();
  const row = db
    .prepare("SELECT * FROM workspace_state WHERE id = ? LIMIT 1")
    .get("default") as
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
      }
    | undefined;

  const integrations = db
    .prepare(
      `
        SELECT provider, display_name, config_json, secret_ciphertext
        FROM integration_settings
        ORDER BY provider
      `,
    )
    .all() as Array<{
    provider: string;
    display_name: string | null;
    config_json: string | null;
    secret_ciphertext: string | null;
  }>;

  const byProvider = new Map(
    integrations.map((integration) => [
      integration.provider as IntegrationProviderKey,
      integration,
    ]),
  );

  const effectiveIntegrations: Array<{
    provider: IntegrationProviderKey;
    displayName?: string;
    config?: Record<string, unknown>;
    hasSecret?: boolean;
  }> = [
    {
      provider: "cloudflare" as const,
      displayName: byProvider.get("cloudflare")?.display_name ?? undefined,
      config: resolved.cloudflareAccountId
        ? { accountId: resolved.cloudflareAccountId }
        : undefined,
      hasSecret: Boolean(
        byProvider.get("cloudflare")?.secret_ciphertext ?? resolved.cloudflareApiToken,
      ),
    },
    {
      provider: "deepcrawl" as const,
      displayName: byProvider.get("deepcrawl")?.display_name ?? undefined,
      config: undefined,
      hasSecret: Boolean(
        byProvider.get("deepcrawl")?.secret_ciphertext ?? resolved.deepcrawlApiKey,
      ),
    },
    {
      provider: "perplexity" as const,
      displayName: byProvider.get("perplexity")?.display_name ?? undefined,
      config: undefined,
      hasSecret: Boolean(
        byProvider.get("perplexity")?.secret_ciphertext ?? resolved.perplexityApiKey,
      ),
    },
    {
      provider: "gemini" as const,
      displayName: byProvider.get("gemini")?.display_name ?? undefined,
      config: undefined,
      hasSecret: Boolean(
        byProvider.get("gemini")?.secret_ciphertext ?? resolved.geminiApiKey,
      ),
    },
    {
      provider: "openai" as const,
      displayName: byProvider.get("openai")?.display_name ?? undefined,
      config: undefined,
      hasSecret: Boolean(
        byProvider.get("openai")?.secret_ciphertext ?? resolved.openaiApiKey,
      ),
    },
    {
      provider: "presenton" as const,
      displayName: byProvider.get("presenton")?.display_name ?? undefined,
      config: resolved.presentonBaseUrl
        ? { baseUrl: resolved.presentonBaseUrl }
        : undefined,
      hasSecret: Boolean(
        byProvider.get("presenton")?.secret_ciphertext ?? resolved.presentonApiKey,
      ),
    },
  ].filter((integration) => integration.config || integration.hasSecret);

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
    intakeDraft: {
      websitesText: row?.draft_websites_text ?? undefined,
      contactsCsvText: row?.draft_contacts_csv_text ?? undefined,
    },
    integrations: effectiveIntegrations,
  };
}

export function createRun(input: IntakeRun) {
  const parsed = intakeRunSchema.parse(input);
  const db = getDb();
  const runId = randomUUID();
  const timestamp = now();

  db.prepare(
    `
      INSERT INTO runs (
        id, status, seller_context_json, questionnaire_json, target_count, delivery_format,
        review_gate_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    runId,
    "queued",
    JSON.stringify(parsed.sellerContext),
    JSON.stringify(parsed.questionnaire),
    parsed.targets.length,
    parsed.questionnaire.outputFormat,
    parsed.questionnaire.optionalReview ? 1 : 0,
    timestamp,
    timestamp,
  );

  const insertTarget = db.prepare(
    `
      INSERT INTO run_targets (
        id, run_id, website_url, company_name, first_name, last_name, role, campaign_goal, notes,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  for (const target of parsed.targets) {
    insertTarget.run(
      randomUUID(),
      runId,
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
    );
  }

  addRunEvent(runId, {
    level: "info",
    stage: "run_created",
    message: `Run created with ${parsed.targets.length} target rows.`,
  });

  return runId;
}

export function getRun(runId: string) {
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ? LIMIT 1").get(runId) as
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
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!run) {
    return null;
  }

  const targets = db
    .prepare("SELECT * FROM run_targets WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId);
  const artifacts = db
    .prepare("SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId);
  const events = db
    .prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId);

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
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      artifact_json:
        typeof artifact.artifact_json === "string"
          ? JSON.parse(artifact.artifact_json)
          : artifact.artifact_json,
    })),
    events,
  };
}

export function listRuns() {
  const db = getDb();
  return db
    .prepare("SELECT id, status, target_count, delivery_format, created_at, updated_at FROM runs ORDER BY created_at DESC")
    .all();
}

export function updateRun(runId: string, values: {
  status?: string;
  sellerBriefJson?: unknown;
  lastError?: string | null;
}) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM runs WHERE id = ? LIMIT 1").get(runId) as
    | { status: string; seller_brief_json: string | null; last_error: string | null }
    | undefined;
  if (!existing) {
    throw new Error(`Run ${runId} was not found.`);
  }

  db.prepare(
    `
      UPDATE runs
      SET status = ?, seller_brief_json = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(
    values.status ?? existing.status,
    values.sellerBriefJson === undefined
      ? existing.seller_brief_json
      : JSON.stringify(values.sellerBriefJson),
    values.lastError === undefined ? existing.last_error : values.lastError,
    now(),
    runId,
  );
}

export function updateRunTarget(
  targetId: string,
  values: {
    status?: string;
    crawlProvider?: string | null;
    lastError?: string | null;
  },
) {
  const db = getDb();
  const existing = db
    .prepare("SELECT status, crawl_provider, last_error FROM run_targets WHERE id = ? LIMIT 1")
    .get(targetId) as
    | { status: string; crawl_provider: string | null; last_error: string | null }
    | undefined;

  if (!existing) {
    throw new Error(`Run target ${targetId} was not found.`);
  }

  db.prepare(
    `
      UPDATE run_targets
      SET status = ?, crawl_provider = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(
    values.status ?? existing.status,
    values.crawlProvider === undefined ? existing.crawl_provider : values.crawlProvider,
    values.lastError === undefined ? existing.last_error : values.lastError,
    now(),
    targetId,
  );
}

export function addArtifact(runId: string, input: {
  targetId?: string;
  artifactType: string;
  artifactJson: unknown;
}) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    runId,
    input.targetId ?? null,
    input.artifactType,
    JSON.stringify(input.artifactJson),
    now(),
  );
}

export function addRunEvent(runId: string, input: {
  targetId?: string;
  stage?: string;
  level: "info" | "warning" | "error";
  message: string;
}) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO run_events (id, run_id, target_id, stage, level, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    runId,
    input.targetId ?? null,
    input.stage ?? null,
    input.level,
    input.message,
    now(),
  );
}
