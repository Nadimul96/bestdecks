import { randomBytes, randomUUID } from "node:crypto";

import { getDb } from "@/src/server/db";
import {
  hasVerifiedShareArtifacts,
  mapSlidePlanToPublicSlides,
  parseVerifiedShareArtifacts,
  shareCheckpointKey,
  type PublicShareSlide,
} from "@/src/server/shareable-deck-contract";

export {
  hasVerifiedShareArtifacts,
  mapSlidePlanToPublicSlides,
  parseVerifiedShareArtifacts,
  shareCheckpointKey,
} from "@/src/server/shareable-deck-contract";
export type { PublicShareSlide } from "@/src/server/shareable-deck-contract";

const SHAREABLE_ARTIFACT_TYPES = [
  "company_brief",
  "slide_plan",
  "presentation_delivery",
] as const;
const SECURE_SHARE_SLUG_PATTERN = /^[A-Za-z0-9_-]{24}$/u;
const SHARE_LINK_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

/**
 * Share rows are retained as an audit trail, so mutation limits must bound
 * both currently reachable links and lifetime row growth. Reusing a valid
 * active link is idempotent and does not consume any of these allowances.
 */
export const SHARE_LINK_QUOTAS = Object.freeze({
  creationsPerWindow: 100,
  activeLinks: 1_000,
  totalLinks: 10_000,
  windowSeconds: SHARE_LINK_CREATION_WINDOW_MS / 1_000,
});

export type ShareLinkQuotaKind = "creation_window" | "active" | "total";
export type ShareLinkQuotaCode =
  | "share_link_creation_rate_limit"
  | "share_link_active_limit"
  | "share_link_total_limit";

export interface ShareLinkQuotaUsage {
  createdInWindow: number;
  activeLinks: number;
  totalLinks: number;
}

const SHARE_LINK_QUOTA_CODES: Record<ShareLinkQuotaKind, ShareLinkQuotaCode> = {
  creation_window: "share_link_creation_rate_limit",
  active: "share_link_active_limit",
  total: "share_link_total_limit",
};

export class ShareLinkQuotaExceededError extends Error {
  public readonly code: ShareLinkQuotaCode;

  public constructor(
    public readonly quota: ShareLinkQuotaKind,
    public readonly retryAfterSeconds: number,
  ) {
    super("Share link quota exceeded.");
    this.name = "ShareLinkQuotaExceededError";
    this.code = SHARE_LINK_QUOTA_CODES[quota];
  }
}

export function evaluateShareLinkQuotaUsage(
  usage: ShareLinkQuotaUsage,
): ShareLinkQuotaKind | null {
  for (const [label, count] of Object.entries(usage)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Invalid share link quota usage: ${label}.`);
    }
  }

  if (usage.totalLinks >= SHARE_LINK_QUOTAS.totalLinks) return "total";
  if (usage.activeLinks >= SHARE_LINK_QUOTAS.activeLinks) return "active";
  if (usage.createdInWindow >= SHARE_LINK_QUOTAS.creationsPerWindow) {
    return "creation_window";
  }
  return null;
}

type ShareableArtifactType = (typeof SHAREABLE_ARTIFACT_TYPES)[number];

interface PersistedShareableDeckRow {
  id: string;
  slug: string;
  run_id: string;
  target_id: string;
  created_by: string;
  is_active: number;
  expires_at: string | null;
  view_count: number;
  created_at: string;
}

interface DeliveryDeckContextRow {
  target_id: string;
  run_id: string;
  target_status: string;
  run_status: string;
  user_id: string | null;
  company_name: string | null;
  website_url: string;
  target_created_at: string;
  seller_context_json: string;
  questionnaire_json: string;
  run_created_at: string;
}

interface PersistedArtifactRow {
  id: string;
  artifact_type: ShareableArtifactType;
  artifact_json: string;
}

interface PersistedShareCheckpointRow {
  checkpoint_key: string;
  stage: string;
  metadata_json: string | null;
}

interface PersistedShareQuotaRow {
  total_count: number | bigint | string;
  active_count: number | bigint | string;
  recent_count: number | bigint | string;
  oldest_recent_created_at: string | null;
  next_active_expires_at: string | null;
}

interface ShareableDeckArtifacts {
  companyBrief?: unknown;
  slidePlan?: unknown;
  presentationDelivery?: unknown;
}

interface ShareableDeckCheckpoints {
  planning?: unknown;
  rendering?: unknown;
}

export interface ShareableLink {
  id: string;
  slug: string;
  runId: string;
  targetId: string;
  createdBy: string;
  isActive: boolean;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

export interface OwnedDeliveryDeck {
  targetId: string;
  runId: string;
  status: string;
  runStatus: string;
  userId: string | null;
  companyName: string;
  websiteUrl: string;
  createdAt: string;
  runCreatedAt: string;
  sellerContext: Record<string, unknown>;
  questionnaire: Record<string, unknown>;
  artifacts: ShareableDeckArtifacts;
  shareCheckpoints: ShareableDeckCheckpoints;
}

export interface ShareableDeckPayload {
  share: {
    expiresAt: string;
  };
  target: {
    companyName: string;
    websiteUrl: string;
  };
  viewer: {
    title: string;
    preparedFor: string;
    watermark: string;
    coverEyebrow: string;
    coverFooter: string;
    defaultThemeKey: string;
    slides: PublicShareSlide[];
  };
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function isDeliveryEligibleRunStatus(status: string) {
  return status === "delivered" || status === "partially_completed";
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return true;
  const timestamp = new Date(expiresAt).getTime();
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function slugifyShareCandidate() {
  return randomBytes(18).toString("base64url");
}

function parsePersistedCount(
  value: number | bigint | string,
  label: string,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid persisted share quota count: ${label}.`);
  }
  return parsed;
}

function secondsUntil(
  timestamp: string | null,
  nowMs: number,
  fallbackSeconds: number,
): number {
  if (!timestamp) return fallbackSeconds;
  const targetMs = new Date(timestamp).getTime();
  if (!Number.isFinite(targetMs)) return fallbackSeconds;
  return Math.max(
    1,
    Math.min(
      SHARE_LINK_QUOTAS.windowSeconds,
      Math.ceil((targetMs - nowMs) / 1_000),
    ),
  );
}

function quotaRetryAfterSeconds(
  quota: ShareLinkQuotaKind,
  row: PersistedShareQuotaRow,
  nowMs: number,
): number {
  switch (quota) {
    case "creation_window": {
      const oldestCreatedAtMs = row.oldest_recent_created_at
        ? new Date(row.oldest_recent_created_at).getTime()
        : Number.NaN;
      const nextCreationAt = Number.isFinite(oldestCreatedAtMs)
        ? new Date(oldestCreatedAtMs + SHARE_LINK_CREATION_WINDOW_MS).toISOString()
        : null;
      return secondsUntil(
        nextCreationAt,
        nowMs,
        SHARE_LINK_QUOTAS.windowSeconds,
      );
    }
    case "active":
      return secondsUntil(
        row.next_active_expires_at,
        nowMs,
        SHARE_LINK_QUOTAS.windowSeconds,
      );
    case "total":
      // Lifetime retention does not clear automatically. A long retry delay
      // prevents tight retry loops while an operator reviews account state.
      return SHARE_LINK_QUOTAS.windowSeconds;
  }
}

function safeCompanyName(companyName: string | null | undefined, websiteUrl: string) {
  if (companyName?.trim()) return companyName.trim();

  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Company";
  }
}

/**
 * Public shares display only a normalized HTTPS origin. Paths and query
 * strings belong to crawl inputs and may contain private campaign material.
 */
function publicWebsiteOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (
      !["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || !hostname
      || hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".home.arpa")
      || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
      || hostname.includes(":")
    ) {
      return null;
    }

    return new URL(`https://${hostname}`).origin;
  } catch {
    return null;
  }
}

function inferDefaultThemeKey(questionnaire: Record<string, unknown>) {
  const visualStyle = typeof questionnaire.visualStyle === "string"
    ? questionnaire.visualStyle
    : undefined;

  switch (visualStyle) {
    case "minimal":
    case "editorial":
      return "simple-light";
    case "sales_polished":
      return "royal-blue";
    case "premium_modern":
      return "aurora-flux";
    case "playful":
      return "prismatica";
    case "dark_executive":
      return "midnight-ember";
    case "dark_minimal":
      return "simple-dark";
    default:
      return "simple-dark";
  }
}

async function getDeckContextByTarget(targetId: string): Promise<OwnedDeliveryDeck | null> {
  const db = await getDb();
  const context = await db.execute(
    `SELECT
       rt.id AS target_id,
       rt.run_id,
       rt.status AS target_status,
       r.status AS run_status,
       rt.company_name,
       rt.website_url,
       rt.created_at AS target_created_at,
       r.user_id,
       r.seller_context_json,
       r.questionnaire_json,
       r.created_at AS run_created_at
     FROM run_targets rt
     INNER JOIN runs r ON r.id = rt.run_id
     WHERE rt.id = ?
     LIMIT 1`,
    [targetId],
  ) as DeliveryDeckContextRow | undefined;

  if (!context) return null;

  const placeholders = SHAREABLE_ARTIFACT_TYPES.map(() => "?").join(",");
  const planningCheckpointKey = shareCheckpointKey(targetId, "planning");
  const renderingCheckpointKey = shareCheckpointKey(targetId, "rendering");
  const [artifacts, checkpointRows] = await Promise.all([
    db.executeAll(
      `SELECT id, artifact_type, artifact_json
       FROM run_artifacts
       WHERE target_id = ?
         AND artifact_type IN (${placeholders})
       ORDER BY created_at ASC, id ASC`,
      [targetId, ...SHAREABLE_ARTIFACT_TYPES],
    ) as unknown as Promise<PersistedArtifactRow[]>,
    db.executeAll(
      `SELECT checkpoint_key, stage, metadata_json
       FROM run_checkpoints
       WHERE run_id = ?
         AND checkpoint_key IN (?, ?)
       ORDER BY checkpoint_key ASC`,
      [context.run_id, planningCheckpointKey, renderingCheckpointKey],
    ) as unknown as Promise<PersistedShareCheckpointRow[]>,
  ]);

  const artifactMap: ShareableDeckArtifacts = {};
  const shareCheckpoints: ShareableDeckCheckpoints = {};

  for (const artifact of artifacts) {
    const parsed = parseJson<unknown>(artifact.artifact_json);
    if (parsed === undefined) continue;

    switch (artifact.artifact_type) {
      case "company_brief":
        artifactMap.companyBrief = parsed;
        break;
      case "slide_plan":
        artifactMap.slidePlan = parsed;
        break;
      case "presentation_delivery":
        artifactMap.presentationDelivery = parsed;
        break;
    }
  }

  for (const checkpoint of checkpointRows) {
    const parsed = parseJson<unknown>(checkpoint.metadata_json);
    if (parsed === undefined) continue;
    if (
      checkpoint.checkpoint_key === planningCheckpointKey
      && checkpoint.stage === "planning"
    ) {
      shareCheckpoints.planning = parsed;
    }
    if (
      checkpoint.checkpoint_key === renderingCheckpointKey
      && checkpoint.stage === "rendering"
    ) {
      shareCheckpoints.rendering = parsed;
    }
  }

  return {
    targetId: context.target_id,
    runId: context.run_id,
    status: context.target_status,
    runStatus: context.run_status,
    userId: context.user_id,
    companyName: safeCompanyName(context.company_name, context.website_url),
    websiteUrl: context.website_url,
    createdAt: context.target_created_at,
    runCreatedAt: context.run_created_at,
    sellerContext: parseJson<Record<string, unknown>>(context.seller_context_json) ?? {},
    questionnaire: parseJson<Record<string, unknown>>(context.questionnaire_json) ?? {},
    artifacts: artifactMap,
    shareCheckpoints,
  };
}

export async function getOwnedDeliveryDeck(
  targetId: string,
  userId: string,
): Promise<OwnedDeliveryDeck | null> {
  const context = await getDeckContextByTarget(targetId);

  if (!context) return null;
  if (context.userId !== userId) return null;

  return context;
}

function toShareableLink(row: PersistedShareableDeckRow): ShareableLink {
  return {
    id: row.id,
    slug: row.slug,
    runId: row.run_id,
    targetId: row.target_id,
    createdBy: row.created_by,
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    createdAt: row.created_at,
  };
}

export async function createShareableLink(
  targetId: string,
  runId: string,
  userId: string,
  expiresAt?: string,
): Promise<{ slug: string }> {
  const deck = await getOwnedDeliveryDeck(targetId, userId);

  if (!deck || deck.runId !== runId) {
    throw new Error("Deck not found.");
  }

  if (
    !isDeliveryEligibleRunStatus(deck.runStatus)
    ||
    deck.status !== "delivered"
    || !hasVerifiedShareArtifacts(
      deck.shareCheckpoints.planning,
      deck.shareCheckpoints.rendering,
    )
  ) {
    throw new Error("Deck is not ready to share.");
  }

  const db = await getDb();
  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs).toISOString();
  const creationWindowStart = new Date(
    createdAtMs - SHARE_LINK_CREATION_WINDOW_MS,
  ).toISOString();
  const effectiveExpiresAt = expiresAt
    ?? new Date(createdAtMs + 30 * 24 * 60 * 60 * 1_000).toISOString();
  const effectiveExpiryMs = new Date(effectiveExpiresAt).getTime();
  if (
    !Number.isFinite(effectiveExpiryMs)
    || effectiveExpiryMs <= createdAtMs
    || effectiveExpiryMs > createdAtMs + 365 * 24 * 60 * 60 * 1_000
  ) {
    throw new RangeError("Share expiry must be in the future and no more than 365 days away.");
  }

  return db.transaction(async (transaction) => {
    // A write transaction makes the lookup-and-insert sequence atomic across
    // concurrent requests, including requests served by different workers.
    const eligible = await transaction.execute(
      `SELECT rt.id
       FROM run_targets rt
       INNER JOIN runs r ON r.id = rt.run_id
       WHERE rt.id = ?
         AND rt.run_id = ?
         AND rt.status = 'delivered'
         AND r.user_id = ?
         AND r.status IN ('delivered', 'partially_completed')
       LIMIT 1`,
      [targetId, runId, userId],
    );
    if (!eligible) {
      throw new Error("Deck is not ready to share.");
    }

    const existing = await transaction.execute(
      `SELECT slug, expires_at
       FROM shareable_decks
       WHERE target_id = ?
         AND run_id = ?
         AND created_by = ?
         AND is_active = 1
         AND expires_at IS NOT NULL
         AND julianday(expires_at) > julianday(?)
         AND length(slug) = 24
         AND slug NOT GLOB '*[^A-Za-z0-9_-]*'
       ORDER BY created_at DESC
       LIMIT 1`,
      [targetId, runId, userId, createdAt],
    ) as { slug: string; expires_at: string } | undefined;

    if (existing && SECURE_SHARE_SLUG_PATTERN.test(existing.slug)) {
      const existingExpiryMs = new Date(existing.expires_at).getTime();
      if (!Number.isFinite(existingExpiryMs)) {
        throw new Error("Existing share expiry is invalid.");
      }
      // Reuse remains idempotent, but a shorter requested lifetime is a
      // privacy restriction and must take effect atomically. Never silently
      // lengthen an existing capability.
      if (effectiveExpiryMs < existingExpiryMs) {
        await transaction.run(
          `UPDATE shareable_decks
           SET expires_at = ?
           WHERE slug = ? AND target_id = ? AND run_id = ? AND created_by = ?`,
          [effectiveExpiresAt, existing.slug, targetId, runId, userId],
        );
      }
      return { slug: existing.slug };
    }

    const quotaRow = await transaction.execute(
      `SELECT
         COUNT(*) AS total_count,
         COALESCE(SUM(
           CASE
             WHEN is_active = 1
              AND expires_at IS NOT NULL
              AND julianday(expires_at) > julianday(?)
             THEN 1 ELSE 0
           END
         ), 0) AS active_count,
         COALESCE(SUM(
           CASE
             WHEN julianday(created_at) >= julianday(?)
             THEN 1 ELSE 0
           END
         ), 0) AS recent_count,
         MIN(
           CASE
             WHEN julianday(created_at) >= julianday(?)
             THEN created_at ELSE NULL
           END
         ) AS oldest_recent_created_at,
         MIN(
           CASE
             WHEN is_active = 1
              AND expires_at IS NOT NULL
              AND julianday(expires_at) > julianday(?)
             THEN expires_at ELSE NULL
           END
         ) AS next_active_expires_at
       FROM shareable_decks
       WHERE created_by = ?`,
      [createdAt, creationWindowStart, creationWindowStart, createdAt, userId],
    ) as unknown as PersistedShareQuotaRow | undefined;

    if (!quotaRow) {
      throw new Error("Failed to read share link quota usage.");
    }

    const exceededQuota = evaluateShareLinkQuotaUsage({
      totalLinks: parsePersistedCount(quotaRow.total_count, "total"),
      activeLinks: parsePersistedCount(quotaRow.active_count, "active"),
      createdInWindow: parsePersistedCount(quotaRow.recent_count, "recent"),
    });
    if (exceededQuota) {
      throw new ShareLinkQuotaExceededError(
        exceededQuota,
        quotaRetryAfterSeconds(exceededQuota, quotaRow, createdAtMs),
      );
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slug = slugifyShareCandidate();

      try {
        await transaction.run(
          `INSERT INTO shareable_decks (
             id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
           ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
          [
            randomUUID(),
            slug,
            runId,
            targetId,
            userId,
            effectiveExpiresAt,
            createdAt,
          ],
        );

        return { slug };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("unique")) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("Failed to generate a unique share slug.");
  });
}

export async function getShareableLink(slug: string): Promise<ShareableLink | null> {
  if (!SECURE_SHARE_SLUG_PATTERN.test(slug)) return null;

  const db = await getDb();
  const row = await db.execute(
    `SELECT id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
     FROM shareable_decks
     WHERE slug = ?
     LIMIT 1`,
    [slug],
  ) as PersistedShareableDeckRow | undefined;

  return row ? toShareableLink(row) : null;
}

export async function deactivateShareableLink(targetId: string, userId: string): Promise<void> {
  const deck = await getOwnedDeliveryDeck(targetId, userId);
  if (!deck) {
    throw new Error("Deck not found.");
  }

  const db = await getDb();
  await db.run(
    `UPDATE shareable_decks
     SET is_active = 0
     WHERE target_id = ?
       AND run_id = ?
       AND created_by = ?
       AND is_active = 1`,
    [targetId, deck.runId, userId],
  );
}

export async function getPublicShareableDeck(slug: string): Promise<ShareableDeckPayload | null> {
  const share = await getShareableLink(slug);

  if (!share || !share.isActive || isExpired(share.expiresAt)) {
    return null;
  }

  const deck = await getDeckContextByTarget(share.targetId);
  if (
    !deck
    || !deck.userId
    || share.createdBy !== deck.userId
    || share.runId !== deck.runId
    || share.targetId !== deck.targetId
    || deck.status !== "delivered"
    || !isDeliveryEligibleRunStatus(deck.runStatus)
  ) {
    return null;
  }

  const verifiedArtifacts = parseVerifiedShareArtifacts(
    deck.shareCheckpoints.planning,
    deck.shareCheckpoints.rendering,
  );
  if (!verifiedArtifacts) return null;

  const publicTargetOrigin = publicWebsiteOrigin(deck.websiteUrl);
  if (!publicTargetOrigin) return null;

  const slides = mapSlidePlanToPublicSlides(verifiedArtifacts.planning);
  if (slides.length === 0) {
    return null;
  }

  const sellerName = safeCompanyName(
    typeof deck.sellerContext.companyName === "string" ? deck.sellerContext.companyName : null,
    typeof deck.sellerContext.websiteUrl === "string" ? deck.sellerContext.websiteUrl : "https://bestdecks.co",
  );
  const preparedFor = deck.companyName;
  // The model-generated plan title is not part of the claim ledger. Keep the
  // public document label deterministic and expose only ledger-mapped slide
  // headlines/bullets as substantive content.
  const title = `Proposal for ${preparedFor}`;

  return {
    share: {
      expiresAt: share.expiresAt!,
    },
    target: {
      companyName: preparedFor,
      websiteUrl: publicTargetOrigin,
    },
    viewer: {
      title,
      preparedFor,
      watermark: sellerName,
      coverEyebrow: `Prepared for ${preparedFor}`,
      coverFooter: sellerName.toUpperCase(),
      defaultThemeKey: inferDefaultThemeKey(deck.questionnaire),
      slides,
    },
  };
}
