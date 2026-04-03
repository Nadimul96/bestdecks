import { randomBytes, randomUUID } from "node:crypto";

import { getDb } from "@/src/server/db";
import type { ExampleSlide } from "@/components/archetype-preview-modal";

const SHAREABLE_ARTIFACT_TYPES = [
  "company_brief",
  "slide_plan",
  "presentation_delivery",
] as const;

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
  user_id: string | null;
  company_name: string | null;
  website_url: string;
  target_created_at: string;
  seller_context_json: string;
  questionnaire_json: string;
  run_created_at: string;
}

interface PersistedArtifactRow {
  artifact_type: ShareableArtifactType;
  artifact_json: string;
}

interface LegacySlidePlan {
  slides?: Array<{
    role?: string;
    title?: string;
    subtitle?: string;
    bullets?: string[];
    keyMetric?: string;
    keyMetricLabel?: string;
    key_metric?: string;
    key_metric_label?: string;
  }>;
}

interface PlannerSlidePlan {
  title?: string;
  anchorMetric?: string;
  slides?: Array<{
    slideNumber?: number;
    purpose?: string;
    headline?: string;
    bulletPoints?: string[];
    speakerNotes?: string;
    suggestImage?: boolean;
    imagePrompt?: string;
  }>;
}

interface ShareableDeckArtifacts {
  companyBrief?: Record<string, unknown>;
  slidePlan?: Record<string, unknown>;
  presentationDelivery?: Record<string, unknown>;
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
  userId: string | null;
  companyName: string;
  websiteUrl: string;
  createdAt: string;
  runCreatedAt: string;
  sellerContext: Record<string, unknown>;
  questionnaire: Record<string, unknown>;
  artifacts: ShareableDeckArtifacts;
}

export interface ShareableDeckPayload {
  share: {
    slug: string;
    targetId: string;
    runId: string;
    viewCount: number;
    expiresAt: string | null;
    createdAt: string;
  };
  target: {
    id: string;
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
    slides: ExampleSlide[];
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

function nowIso() {
  return new Date().toISOString();
}

function isExpired(expiresAt: string | null | undefined) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

function slugifyShareCandidate() {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

function normalizeTextArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function safeCompanyName(companyName: string | null | undefined, websiteUrl: string) {
  if (companyName?.trim()) return companyName.trim();

  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
}

function cleanPurpose(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z]+/g, "_") ?? "";
}

function cleanRole(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z]+/g, "_") ?? "";
}

function extractMetric(...candidates: Array<string | undefined>) {
  const patterns = [
    /\$[\d,.]+(?:\s?[kmb])?/i,
    /<\s*\d+(?:\.\d+)?%/,
    /\b\d+(?:\.\d+)?%/,
    /\b\d+(?:\.\d+)?x\b/i,
    /\b\d+\+\s*(?:hours?|hrs?|days?|weeks?|months?|minutes?|mins?)\b/i,
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|days?|weeks?|months?|minutes?|mins?)\b/i,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match) return match[0];
    }
  }

  return undefined;
}

function trimSubtitle(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferSlideType(input: {
  role?: string;
  purpose?: string;
  index: number;
  total: number;
  hasStat: boolean;
}): ExampleSlide["type"] {
  const role = cleanRole(input.role);
  const purpose = cleanPurpose(input.purpose);

  switch (role) {
    case "cover":
      return "cover";
    case "tension":
    case "problem":
      return "tension";
    case "data":
    case "roi":
      return "data";
    case "vision":
      return "vision";
    case "solution":
      return "solution";
    case "proof":
      return "proof";
    case "cta":
    case "next_step":
      return "cta";
    case "contact":
    case "about":
    case "closing":
      return "contact";
    default:
      break;
  }

  switch (purpose) {
    case "hook":
      return input.index === 0 ? "cover" : "tension";
    case "shift":
      return input.hasStat ? "data" : "tension";
    case "vision":
      return "vision";
    case "solution":
      return "solution";
    case "proof":
      return "proof";
    case "path_forward":
      return input.index === input.total - 1 ? "contact" : "cta";
    default:
      if (input.index === 0) return "cover";
      if (input.index === input.total - 1) return "contact";
      return input.hasStat ? "data" : "solution";
  }
}

function inferLayout(type: ExampleSlide["type"], hasStat: boolean): ExampleSlide["layout"] {
  switch (type) {
    case "cover":
    case "vision":
    case "cta":
    case "contact":
      return "centered";
    case "proof":
      return hasStat ? "split" : "quote";
    case "tension":
    case "solution":
      return hasStat ? "stat-left" : "split";
    case "data":
      return hasStat ? "split" : "stat-left";
  }
}

function inferVisual(type: ExampleSlide["type"]): ExampleSlide["visual"] {
  switch (type) {
    case "cover":
    case "vision":
      return "gradient-orb";
    case "tension":
      return "bar-chart";
    case "data":
      return "metric-grid";
    case "solution":
      return "metrics-row";
    case "proof":
      return "testimonial";
    case "cta":
    case "contact":
      return "none";
  }
}

function inferBg(type: ExampleSlide["type"]): ExampleSlide["bg"] {
  switch (type) {
    case "cover":
    case "contact":
      return "dark-mesh";
    case "tension":
    case "solution":
      return "dark";
    case "data":
    case "proof":
      return "subtle";
    case "vision":
    case "cta":
      return "accent-gradient";
  }
}

export function mapSlidePlanToExampleSlides(slidePlan: unknown): ExampleSlide[] {
  if (!slidePlan || typeof slidePlan !== "object") {
    return [];
  }

  const planner = slidePlan as PlannerSlidePlan;
  const legacy = slidePlan as LegacySlidePlan;
  const plannerSlides = Array.isArray(planner.slides)
    ? planner.slides.filter((slide) => slide && typeof slide === "object" && "headline" in slide)
    : [];

  if (plannerSlides.length > 0) {
    return plannerSlides.map((slide, index, allSlides) => {
      const stat = extractMetric(
        planner.anchorMetric,
        slide.headline,
        ...(slide.bulletPoints ?? []),
      );
      const type = inferSlideType({
        purpose: slide.purpose,
        index,
        total: allSlides.length,
        hasStat: Boolean(stat),
      });

      return {
        title: slide.headline?.trim() || `Slide ${index + 1}`,
        subtitle: trimSubtitle(slide.speakerNotes),
        bullets: normalizeTextArray(slide.bulletPoints),
        stat,
        statLabel: stat && planner.anchorMetric ? planner.anchorMetric : undefined,
        type,
        layout: inferLayout(type, Boolean(stat)),
        visual: inferVisual(type),
        bg: inferBg(type),
      };
    });
  }

  const legacySlides = Array.isArray(legacy.slides)
    ? legacy.slides.filter((slide) => slide && typeof slide === "object")
    : [];

  return legacySlides.map((slide, index, allSlides) => {
    const stat = slide.keyMetric ?? slide.key_metric;
    const type = inferSlideType({
      role: slide.role,
      index,
      total: allSlides.length,
      hasStat: Boolean(stat),
    });

    return {
      title: slide.title?.trim() || `Slide ${index + 1}`,
      subtitle: trimSubtitle(slide.subtitle),
      bullets: normalizeTextArray(slide.bullets),
      stat,
      statLabel: slide.keyMetricLabel ?? slide.key_metric_label,
      type,
      layout: inferLayout(type, Boolean(stat)),
      visual: inferVisual(type),
      bg: inferBg(type),
    };
  });
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
  const artifacts = await db.executeAll(
    `SELECT artifact_type, artifact_json
     FROM run_artifacts
     WHERE target_id = ?
       AND artifact_type IN (${placeholders})
     ORDER BY created_at ASC`,
    [targetId, ...SHAREABLE_ARTIFACT_TYPES],
  ) as unknown as PersistedArtifactRow[];

  const artifactMap: ShareableDeckArtifacts = {};

  for (const artifact of artifacts) {
    const parsed = parseJson<Record<string, unknown>>(artifact.artifact_json);
    if (!parsed) continue;

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

  return {
    targetId: context.target_id,
    runId: context.run_id,
    userId: context.user_id,
    companyName: safeCompanyName(context.company_name, context.website_url),
    websiteUrl: context.website_url,
    createdAt: context.target_created_at,
    runCreatedAt: context.run_created_at,
    sellerContext: parseJson<Record<string, unknown>>(context.seller_context_json) ?? {},
    questionnaire: parseJson<Record<string, unknown>>(context.questionnaire_json) ?? {},
    artifacts: artifactMap,
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

  if (!deck.artifacts.slidePlan || !deck.artifacts.presentationDelivery) {
    throw new Error("Deck is not ready to share.");
  }

  const existing = await getShareableLinkByTarget(targetId);
  if (existing) {
    return { slug: existing.slug };
  }

  const db = await getDb();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = slugifyShareCandidate();

    try {
      await db.run(
        `INSERT INTO shareable_decks (
           id, slug, run_id, target_id, created_by, is_active, expires_at, view_count, created_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
        [
          randomUUID(),
          slug,
          runId,
          targetId,
          userId,
          expiresAt ?? null,
          nowIso(),
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
}

export async function getShareableLink(slug: string): Promise<ShareableLink | null> {
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

export async function incrementShareViews(slug: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE shareable_decks
     SET view_count = view_count + 1
     WHERE slug = ?`,
    [slug],
  );
}

export async function getShareableLinkByTarget(
  targetId: string,
): Promise<{ slug: string } | null> {
  const db = await getDb();
  const row = await db.execute(
    `SELECT slug
     FROM shareable_decks
     WHERE target_id = ?
       AND is_active = 1
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 1`,
    [targetId, nowIso()],
  ) as { slug: string } | undefined;

  return row ?? null;
}

export async function getPublicShareableDeck(
  slug: string,
  options: { incrementViews?: boolean } = {},
): Promise<ShareableDeckPayload | null> {
  const incrementViewsOnLoad = options.incrementViews ?? false;
  const share = await getShareableLink(slug);

  if (!share || !share.isActive || isExpired(share.expiresAt)) {
    return null;
  }

  const deck = await getDeckContextByTarget(share.targetId);
  if (!deck?.artifacts.slidePlan) {
    return null;
  }

  const slides = mapSlidePlanToExampleSlides(deck.artifacts.slidePlan);
  if (slides.length === 0) {
    return null;
  }

  if (incrementViewsOnLoad) {
    await incrementShareViews(slug);
  }

  const sellerName = safeCompanyName(
    typeof deck.sellerContext.companyName === "string" ? deck.sellerContext.companyName : null,
    typeof deck.sellerContext.websiteUrl === "string" ? deck.sellerContext.websiteUrl : "https://bestdecks.co",
  );
  const preparedFor = deck.companyName;
  const title = typeof (deck.artifacts.slidePlan as { title?: unknown }).title === "string"
    ? (deck.artifacts.slidePlan as { title: string }).title
    : slides[0]?.title ?? `Prepared for ${preparedFor}`;

  return {
    share: {
      slug: share.slug,
      targetId: share.targetId,
      runId: share.runId,
      viewCount: share.viewCount + (incrementViewsOnLoad ? 1 : 0),
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
    },
    target: {
      id: deck.targetId,
      companyName: preparedFor,
      websiteUrl: deck.websiteUrl,
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
