import { randomUUID } from "node:crypto";

import { intakeRunSchema, type IntakeRun, type SellerKnowledge } from "@/src/domain/schemas";
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

export async function saveOnboarding(payload: OnboardingPayload, userId: string = "default") {
  const db = await getDb();
  const timestamp = now();

  await db.run(
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
      payload.sellerContext ? JSON.stringify(payload.sellerContext) : null,
      payload.questionnaire ? JSON.stringify(payload.questionnaire) : null,
      payload.intakeDraft?.websitesText ?? null,
      payload.intakeDraft?.contactsCsvText ?? null,
      timestamp,
      timestamp,
    ],
  );

  // Insert all integration settings in parallel
  await Promise.all(
    (payload.integrations ?? []).map((integration) =>
      db.run(
        `
          DELETE FROM integration_settings WHERE provider = ? AND user_id = ?
        `,
        [integration.provider, userId],
      ).then(() =>
        db.run(
          `
            INSERT INTO integration_settings (provider, user_id, display_name, config_json, secret_ciphertext, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            integration.provider,
            userId,
            integration.displayName ?? null,
            integration.config ? JSON.stringify(integration.config) : null,
            integration.secret ? encryptSecret(integration.secret) : null,
            timestamp,
          ],
        ),
      ),
    ),
  );
}

export async function saveSellerBriefMd(markdown: string, userId: string = "default") {
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

export async function getSellerBriefMd(userId: string = "default"): Promise<string | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT seller_brief_md FROM workspace_state WHERE id = ? OR user_id = ? LIMIT 1",
    [userId, userId],
  ) as { seller_brief_md: string | null } | undefined;

  return row?.seller_brief_md ?? null;
}

export async function saveAudienceContext(context: Record<string, unknown>, userId: string = "default") {
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

export async function getAudienceContext(userId: string = "default"): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT audience_context_json FROM workspace_state WHERE id = ? OR user_id = ? LIMIT 1",
    [userId, userId],
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

export async function saveSellerKnowledge(knowledge: SellerKnowledge, userId: string = "default") {
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

export async function getSellerKnowledge(userId: string = "default"): Promise<SellerKnowledge | null> {
  const db = await getDb();
  const row = await db.execute(
    "SELECT seller_knowledge_json, seller_context_json FROM workspace_state WHERE id = ? OR user_id = ? LIMIT 1",
    [userId, userId],
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

export async function getOnboarding(userId: string = "default") {
  const db = await getDb();
  const resolved = await resolveIntegrationConfig(userId);
  const row = await db.execute(
    "SELECT * FROM workspace_state WHERE id = ? OR user_id = ? LIMIT 1",
    [userId, userId],
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
  ) as unknown as Array<{
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
      config:
        resolved.presentonBaseUrl || resolved.presentonTemplate
          ? {
              ...(resolved.presentonBaseUrl
                ? { baseUrl: resolved.presentonBaseUrl }
                : {}),
              ...(resolved.presentonTemplate
                ? { template: resolved.presentonTemplate }
                : {}),
            }
          : undefined,
      hasSecret: Boolean(
        byProvider.get("presenton")?.secret_ciphertext ?? resolved.presentonApiKey,
      ),
    },
    {
      provider: "plusai" as const,
      displayName: byProvider.get("plusai")?.display_name ?? undefined,
      config: undefined,
      hasSecret: Boolean(
        byProvider.get("plusai")?.secret_ciphertext ?? resolved.plusaiApiKey,
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
    sellerBriefMd: row?.seller_brief_md ?? undefined,
    sellerKnowledge: parseJson<SellerKnowledge>(row?.seller_knowledge_json ?? null),
    intakeDraft: {
      websitesText: row?.draft_websites_text ?? undefined,
      contactsCsvText: row?.draft_contacts_csv_text ?? undefined,
    },
    integrations: effectiveIntegrations,
  };
}

export async function createRun(input: IntakeRun, userId?: string) {
  const parsed = intakeRunSchema.parse(input);
  const db = await getDb();
  const runId = randomUUID();
  const timestamp = now();
  const creditsCharged = parsed.targets.length; // 1 credit per target

  await db.run(
    `
      INSERT INTO runs (
        id, status, seller_context_json, questionnaire_json, target_count, delivery_format,
        review_gate_enabled, user_id, credits_charged, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runId,
      "queued",
      JSON.stringify(parsed.sellerContext),
      JSON.stringify(parsed.questionnaire),
      parsed.targets.length,
      parsed.questionnaire.outputFormat,
      parsed.questionnaire.optionalReview ? 1 : 0,
      userId ?? null,
      creditsCharged,
      timestamp,
      timestamp,
    ],
  );

  // Batch insert all targets in parallel for speed
  await Promise.all(
    parsed.targets.map((target) =>
      db.run(
        `
          INSERT INTO run_targets (
            id, run_id, website_url, company_name, first_name, last_name, role, campaign_goal, notes,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
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
        ],
      ),
    ),
  );

  await addRunEvent(runId, {
    level: "info",
    stage: "run_created",
    message: `Run created with ${parsed.targets.length} target rows.`,
  });

  return runId;
}

export async function getRun(runId: string, userId?: string, opts?: { isAdmin?: boolean }) {
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
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!run) {
    return null;
  }

  // Ownership check: verify the requesting user owns this run
  if (userId && !opts?.isAdmin) {
    const runUserId = (run as Record<string, unknown>).user_id as string | null;
    if (runUserId && runUserId !== userId) {
      return null; // Treat as "not found" to prevent enumeration
    }
  }

  // Fetch targets, artifacts, and events in parallel for faster loading
  const [targets, artifacts, events] = await Promise.all([
    db.executeAll(
      "SELECT * FROM run_targets WHERE run_id = ? ORDER BY created_at ASC",
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

export async function listRuns(userId?: string) {
  const db = await getDb();
  if (userId) {
    return db.executeAll(
      `SELECT r.id, r.status, r.target_count, r.delivery_format, r.created_at, r.updated_at,
              (SELECT rt.website_url FROM run_targets rt WHERE rt.run_id = r.id ORDER BY rt.created_at ASC LIMIT 1) AS first_target_url
       FROM runs r WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      [userId],
    );
  }
  return db.executeAll(
    `SELECT r.id, r.status, r.target_count, r.delivery_format, r.created_at, r.updated_at,
            (SELECT rt.website_url FROM run_targets rt WHERE rt.run_id = r.id ORDER BY rt.created_at ASC LIMIT 1) AS first_target_url
     FROM runs r ORDER BY r.created_at DESC`,
  );
}

/** Lightweight count query — avoids fetching full run data just for a count. */
export async function countRuns(userId?: string): Promise<number> {
  const db = await getDb();
  if (userId) {
    const row = await db.execute("SELECT COUNT(*) AS cnt FROM runs WHERE user_id = ?", [userId]) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }
  const row = await db.execute("SELECT COUNT(*) AS cnt FROM runs") as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Bulk fetch all data needed for the Delivery page in just 3 DB queries.
 * Replaces the N+1 pattern of: listRuns() + getRun(id) per run.
 *
 * Returns runs that have at least one completed/delivered target, along with
 * their targets and delivery artifacts (skipping crawl/enrichment artifacts
 * which aren't needed for the delivery gallery).
 */
export async function listDeliveryDecks(userId?: string) {
  const db = await getDb();
  const currentTime = now();

  // 1. Get all runs that are relevant for delivery
  const userFilter = userId ? " AND r.user_id = ?" : "";
  const userArgs = userId ? [userId] : [];
  const runs = await db.executeAll(
    `SELECT r.id, r.status, r.delivery_format, r.created_at
     FROM runs r
     WHERE r.status IN ('completed', 'partially_completed', 'running')${userFilter}
     ORDER BY r.created_at DESC`,
    userArgs,
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
           AND sd.is_active = 1
           AND (sd.expires_at IS NULL OR sd.expires_at > ?)
         ORDER BY sd.created_at DESC
         LIMIT 1
       ) AS share_slug,
       EXISTS(
         SELECT 1
         FROM run_artifacts share_slide_plan
         WHERE share_slide_plan.target_id = run_targets.id
           AND share_slide_plan.artifact_type = 'slide_plan'
       ) AS has_slide_plan
     FROM run_targets
     WHERE run_id IN (${placeholders})
     ORDER BY created_at ASC`,
    [currentTime, ...runIds],
  ) as unknown as Array<{
    id: string;
    run_id: string;
    website_url: string;
    company_name: string | null;
    status: string;
    last_error: string | null;
    created_at: string;
    share_slug: string | null;
    has_slide_plan: number;
  }>;

  // 3. Get only delivery artifacts (the only ones the delivery page needs)
  const artifacts = await db.executeAll(
    `SELECT id, run_id, target_id, artifact_type, artifact_json, created_at
     FROM run_artifacts
     WHERE run_id IN (${placeholders})
       AND artifact_type = 'presentation_delivery'
     ORDER BY created_at ASC`,
    runIds,
  ) as unknown as Array<{
    id: string;
    run_id: string;
    target_id: string | null;
    artifact_type: string;
    artifact_json: string;
    created_at: string;
  }>;

  // Index artifacts by target_id
  const artifactsByTarget = new Map<string, Array<{
    id: string;
    run_id: string;
    target_id: string | null;
    artifact_type: string;
    artifact_json: unknown;
    created_at: string;
  }>>();
  for (const a of artifacts) {
    const key = a.target_id ?? "general";
    const parsed = {
      ...a,
      artifact_json: typeof a.artifact_json === "string" ? JSON.parse(a.artifact_json) : a.artifact_json,
    };
    const list = artifactsByTarget.get(key) ?? [];
    list.push(parsed);
    artifactsByTarget.set(key, list);
  }

  // Index runs by id
  const runMap = new Map(runs.map((r) => [r.id, r]));

  // Build flat deck cards
  return targets.map((target) => {
    const run = runMap.get(target.run_id)!;
    return {
      targetId: target.id,
      runId: target.run_id,
      companyName: target.company_name ?? "",
      websiteUrl: target.website_url,
      status: target.status,
      format: run.delivery_format,
      createdAt: target.created_at,
      artifacts: artifactsByTarget.get(target.id) ?? [],
      shareSlug: target.share_slug ?? undefined,
      canShare: Boolean(target.has_slide_plan),
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
  artifactType: string;
  artifactJson: unknown;
}) {
  const db = await getDb();
  await db.run(
    `
      INSERT INTO run_artifacts (id, run_id, target_id, artifact_type, artifact_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      runId,
      input.targetId ?? null,
      input.artifactType,
      JSON.stringify(input.artifactJson),
      now(),
    ],
  );
}

export async function addRunEvent(runId: string, input: {
  targetId?: string;
  stage?: string;
  level: "info" | "warning" | "error";
  message: string;
}) {
  const db = await getDb();
  await db.run(
    `
      INSERT INTO run_events (id, run_id, target_id, stage, level, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      runId,
      input.targetId ?? null,
      input.stage ?? null,
      input.level,
      input.message,
      now(),
    ],
  );
}

/* ─────────────────────────────────────────────
   Credit operations
   ───────────────────────────────────────────── */

/** Deduct credits from a user. Returns false if insufficient balance.
 *  Uses a single atomic UPDATE to prevent race conditions (TOCTOU). */
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const db = await getDb();

  // Atomic: deduct only if balance is sufficient, in a single query
  const result = await db.execute(
    `UPDATE "user_credits"
     SET "balance" = "balance" - ?, "updated_at" = datetime('now')
     WHERE "user_id" = ? AND "balance" >= ?
     RETURNING "balance"`,
    [amount, userId, amount],
  );

  // If no row was returned, either user doesn't exist or insufficient balance
  return result !== undefined;
}

/** Refund credits to a user (e.g. when targets fail). */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE "user_credits"
     SET "balance" = "balance" + ?, "updated_at" = datetime('now')
     WHERE "user_id" = ?`,
    [amount, userId],
  );
}

/** Get the user_id and credits_charged for a run. */
export async function getRunOwner(runId: string): Promise<{ userId: string | null; creditsCharged: number }> {
  const db = await getDb();
  const row = await db.execute(
    'SELECT "user_id", "credits_charged" FROM "runs" WHERE "id" = ?',
    [runId],
  ) as { user_id: string | null; credits_charged: number } | undefined;

  return {
    userId: row?.user_id ?? null,
    creditsCharged: row?.credits_charged ?? 0,
  };
}

export {
  createShareableLink,
  deactivateShareableLink,
  getOwnedDeliveryDeck,
  getPublicShareableDeck,
  getShareableLink,
  getShareableLinkByTarget,
  incrementShareViews,
  mapSlidePlanToExampleSlides,
} from "./shareable-decks";
