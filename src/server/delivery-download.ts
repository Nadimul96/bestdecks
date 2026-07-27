import { createHash } from "node:crypto";

import { z } from "zod";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import { visualProfileVerificationSchema } from "@/src/domain/visual-profile";
import type { BinaryResponse, JsonRequestOptions } from "@/src/integrations/http";
import { parseOutboundHttpUrl, type OutboundUrlPolicy } from "@/src/integrations/url-policy";
import { parseVerifiedShareArtifacts } from "@/src/server/shareable-deck-contract";

export { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_DOWNLOADS_PER_USER = 2;
const MAX_CONCURRENT_DOWNLOADS_GLOBAL = 4;
const MAX_DOWNLOADS_PER_USER_PER_MINUTE = 30;
const DOWNLOAD_RATE_WINDOW_MS = 60_000;
const DOWNLOAD_STREAM_CHUNK_BYTES = 64 * 1024;
const DOWNLOAD_EGRESS_DEADLINE_MS = 2 * 60_000;
const HOSTED_PRESENTON_HOST = "api.presenton.ai";
const HOSTED_ARTIFACT_HOSTS = new Set([
  HOSTED_PRESENTON_HOST,
  "presenton.ai",
  "www.presenton.ai",
  "presenton-public.s3.amazonaws.com",
]);

const activeDownloadsByUser = new Map<string, number>();
const recentDownloadsByUser = new Map<string, number[]>();
let activeDownloadsGlobal = 0;

function reserveDownload(userId: string): (() => void) | null {
  const now = Date.now();
  const recent = (recentDownloadsByUser.get(userId) ?? [])
    .filter((timestamp) => now - timestamp < DOWNLOAD_RATE_WINDOW_MS);
  if (
    recent.length >= MAX_DOWNLOADS_PER_USER_PER_MINUTE
    || (activeDownloadsByUser.get(userId) ?? 0) >= MAX_CONCURRENT_DOWNLOADS_PER_USER
    || activeDownloadsGlobal >= MAX_CONCURRENT_DOWNLOADS_GLOBAL
  ) {
    recentDownloadsByUser.set(userId, recent);
    return null;
  }

  recent.push(now);
  recentDownloadsByUser.set(userId, recent);
  activeDownloadsByUser.set(userId, (activeDownloadsByUser.get(userId) ?? 0) + 1);
  activeDownloadsGlobal += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeDownloadsByUser.get(userId) ?? 1) - 1;
    if (remaining > 0) activeDownloadsByUser.set(userId, remaining);
    else activeDownloadsByUser.delete(userId);
    activeDownloadsGlobal = Math.max(0, activeDownloadsGlobal - 1);
  };
}

function streamVerifiedArtifact(
  body: Buffer,
  releaseReservation: () => void,
): ReadableStream<Uint8Array> {
  const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  let offset = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const clearDeadline = () => {
    if (deadline) clearTimeout(deadline);
    deadline = undefined;
  };
  const settle = () => {
    if (settled) return;
    settled = true;
    clearDeadline();
    releaseReservation();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // The verified artifact is already bounded and resident in memory. Do
      // not retain it or its concurrency reservation forever when a
      // downstream client stops reading.
      deadline = setTimeout(() => {
        try {
          controller.error(new Error("Deck download response deadline exceeded."));
        } finally {
          settle();
        }
      }, DOWNLOAD_EGRESS_DEADLINE_MS);
      deadline.unref?.();
    },
    pull(controller) {
      try {
        if (offset >= bytes.byteLength) {
          controller.close();
          settle();
          return;
        }
        const end = Math.min(offset + DOWNLOAD_STREAM_CHUNK_BYTES, bytes.byteLength);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      } catch (error) {
        settle();
        throw error;
      }
    },
    cancel() {
      settle();
    },
  });
}

const HttpUrlSchema = z.string().min(1).max(8_192).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      value !== value.trim()
      || !["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || url.hash
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid artifact URL." });
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid artifact URL." });
  }
});

const ReadinessSchema = z.object({
  requiredSlideFieldsPresent: z.literal(true),
  ctaPresent: z.literal(true),
  evidenceGatePassed: z.literal(true),
  artifactReadable: z.literal(true),
  providerProvenancePresent: z.literal(true),
  visualProfileVerified: z.literal(true),
}).strict();

const TimingSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
}).strict();

function canonicalUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

const PresentationDeliverySchema = z.object({
  outcome: z.literal("delivered"),
  result: z.object({
    presentationId: z.string().trim().min(1).max(200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
    editorUrl: HttpUrlSchema.optional(),
    exportUrl: HttpUrlSchema.optional(),
    usage: z.object({
      unit: z.literal("credits"),
      amount: z.number().finite().nonnegative(),
    }).strict().optional(),
  }).strict(),
  verification: z.object({
    url: HttpUrlSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive().max(MAX_DELIVERY_ARTIFACT_BYTES),
    contentType: z.string().trim().min(1).max(200).optional(),
    verifiedAt: z.string().datetime({ offset: true }),
    contentVerification: z.object({
      method: z.literal("pptx_ooxml_rich_static_v2"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      slideCount: z.number().int().positive().max(60),
    }).strict(),
    visualProfile: visualProfileVerificationSchema,
  }).strict(),
  readiness: ReadinessSchema,
  timing: TimingSchema,
}).strict().superRefine((delivery, context) => {
  if (!delivery.result.exportUrl) return;
  const exportUrl = canonicalUrl(delivery.result.exportUrl);
  const verifiedUrl = canonicalUrl(delivery.verification.url);
  if (!exportUrl || !verifiedUrl || exportUrl !== verifiedUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The verified artifact does not match the export URL.",
      path: ["verification", "url"],
    });
  }
});

interface DeliverySession {
  user: { id: string };
}

interface OwnedDeck {
  userId: string | null;
  companyName: string;
  status: string;
  runStatus: string;
  artifacts: {
    presentationDelivery?: unknown;
  };
  shareCheckpoints: {
    planning?: unknown;
    rendering?: unknown;
  };
}

export interface DeliveryRendererConfig {
  presentonBaseUrl?: string;
  presentonApiKey?: string;
  presentonAuthUsername?: string;
  presentonAuthPassword?: string;
  allowPrivateProviderUrls?: boolean;
}

interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

export interface DeliveryDownloadDependencies {
  getSession(): Promise<DeliverySession | null>;
  getOwnedDeliveryDeck(deckId: string, userId: string): Promise<OwnedDeck | null>;
  resolveIntegrationConfig(userId: string): Promise<DeliveryRendererConfig>;
  resolveSafeOutboundTarget(
    url: string,
    policy?: OutboundUrlPolicy,
  ): Promise<ResolvedTarget>;
  requestBytes(url: string, options: JsonRequestOptions): Promise<BinaryResponse>;
}

interface RendererAccess {
  baseUrl: URL;
  authorization: string;
}

type ExportFormat = "pdf" | "pptx";

function jsonError(status: number, code: string, error: string): Response {
  return Response.json(
    { error, code },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function resolveRendererAccess(config: DeliveryRendererConfig): RendererAccess {
  if (!config.presentonBaseUrl || config.presentonBaseUrl.length > 8_192) {
    throw new Error("renderer_configuration");
  }

  const baseUrl = parseOutboundHttpUrl(config.presentonBaseUrl);
  baseUrl.search = "";
  baseUrl.hash = "";
  const hosted = baseUrl.hostname.toLowerCase() === HOSTED_PRESENTON_HOST;
  const username = config.presentonAuthUsername;
  const password = config.presentonAuthPassword;
  const apiKey = config.presentonApiKey;
  const hasUsername = Boolean(username);
  const hasPassword = Boolean(password);
  const hasBasic = hasUsername && hasPassword;
  const hasBearer = Boolean(config.presentonApiKey);

  if (
    hasUsername !== hasPassword
    || username !== username?.trim()
    || username?.includes(":")
    || (username !== undefined && username.length > 256)
    || (password !== undefined && (password.length < 6 || password.length > 8_192))
    || apiKey !== apiKey?.trim()
    || (apiKey !== undefined && apiKey.length > 8_192)
    || (hasBasic && hasBearer)
  ) {
    throw new Error("renderer_configuration");
  }

  if (hosted) {
    if (baseUrl.protocol !== "https:" || !apiKey || hasBasic) {
      throw new Error("renderer_configuration");
    }
    return { baseUrl, authorization: `Bearer ${apiKey}` };
  }

  if (!username || !password || hasBearer) {
    throw new Error("renderer_configuration");
  }
  return {
    baseUrl,
    authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
  };
}

function resolveAllowedArtifactUrl(baseUrl: URL, candidate: string): URL {
  const artifactUrl = parseOutboundHttpUrl(candidate);
  if (artifactUrl.hash) throw new Error("unsupported_artifact");

  if (baseUrl.hostname.toLowerCase() === HOSTED_PRESENTON_HOST) {
    if (
      artifactUrl.protocol !== "https:"
      || !HOSTED_ARTIFACT_HOSTS.has(artifactUrl.hostname.toLowerCase())
    ) {
      throw new Error("unsupported_artifact");
    }
  } else if (artifactUrl.origin !== baseUrl.origin) {
    throw new Error("unsupported_artifact");
  }

  return artifactUrl;
}

function exportFormat(url: URL): ExportFormat {
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".pdf")) return "pdf";
  if (pathname.endsWith(".pptx")) return "pptx";
  throw new Error("unsupported_artifact");
}

function normalizedContentType(value: string | undefined): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || undefined;
}

function validateArtifactBody(
  format: ExportFormat,
  response: BinaryResponse,
  expectedByteLength: number,
  expectedSha256: string,
): boolean {
  const { body } = response;
  if (
    response.status < 200
    || response.status >= 300
    || body.byteLength === 0
    || body.byteLength > MAX_DELIVERY_ARTIFACT_BYTES
    || body.byteLength !== expectedByteLength
  ) {
    return false;
  }

  const contentType = normalizedContentType(response.contentType);
  const acceptedContentTypes = format === "pdf"
    ? new Set(["application/pdf", "application/octet-stream"])
    : new Set([
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/octet-stream",
      ]);
  if (contentType && !acceptedContentTypes.has(contentType)) return false;

  const signatureValid = format === "pdf"
    ? body.subarray(0, 5).toString("ascii") === "%PDF-"
    : body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!signatureValid) return false;

  return createHash("sha256").update(body).digest("hex") === expectedSha256;
}

function safeDownloadFilename(companyName: string, format: ExportFormat): string {
  const stem = companyName
    .slice(0, 256)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return `${stem || "bestdecks"}-proposal.${format}`;
}

export function createDeliveryDownloadHandler(
  dependencies: DeliveryDownloadDependencies,
) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ deckId: string }> },
  ): Promise<Response> {
    let session: DeliverySession | null;
    let reservationTransferredToStream = false;
    try {
      session = await dependencies.getSession();
    } catch {
      return jsonError(500, "internal_error", "Unable to download deck.");
    }
    if (!session?.user.id) {
      return jsonError(401, "unauthorized", "Unauthorized");
    }

    let deckId: string;
    try {
      deckId = (await context.params).deckId;
    } catch {
      return jsonError(404, "deck_not_found", "Deck not found.");
    }
    if (!deckId || deckId.length > 512) {
      return jsonError(404, "deck_not_found", "Deck not found.");
    }

    let deck: OwnedDeck | null;
    try {
      deck = await dependencies.getOwnedDeliveryDeck(deckId, session.user.id);
    } catch {
      return jsonError(500, "internal_error", "Unable to download deck.");
    }
    if (!deck || deck.userId !== session.user.id) {
      return jsonError(404, "deck_not_found", "Deck not found.");
    }

    const runIsDeliverable = deck.runStatus === "delivered"
      || deck.runStatus === "partially_completed";
    const committed = runIsDeliverable && deck.status === "delivered"
      ? parseVerifiedShareArtifacts(
          deck.shareCheckpoints.planning,
          deck.shareCheckpoints.rendering,
        )
      : null;
    const delivery = PresentationDeliverySchema.safeParse(committed?.delivery);
    if (!delivery.success || !delivery.data.result.exportUrl) {
      return jsonError(410, "artifact_unavailable", "Deck download is unavailable.");
    }

    let access: RendererAccess;
    let rendererConfig: DeliveryRendererConfig;
    try {
      rendererConfig = await dependencies.resolveIntegrationConfig(session.user.id);
      access = resolveRendererAccess(rendererConfig);
    } catch {
      return jsonError(503, "renderer_unavailable", "Deck renderer is unavailable.");
    }

    let artifactUrl: URL;
    let format: ExportFormat;
    try {
      artifactUrl = resolveAllowedArtifactUrl(
        access.baseUrl,
        delivery.data.result.exportUrl,
      );
      format = exportFormat(artifactUrl);
    } catch {
      return jsonError(410, "artifact_unavailable", "Deck download is unavailable.");
    }

    const releaseDownload = reserveDownload(session.user.id);
    if (!releaseDownload) {
      return new Response(
        JSON.stringify({ error: "Too many deck downloads. Try again shortly.", code: "download_limited" }),
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": "application/json",
            "Retry-After": "5",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    try {
      const target = await dependencies.resolveSafeOutboundTarget(
        artifactUrl.toString(),
        { allowPrivateNetwork: Boolean(rendererConfig.allowPrivateProviderUrls) },
      );
      const authorization = artifactUrl.origin === access.baseUrl.origin
        ? { Authorization: access.authorization }
        : undefined;
      const response = await dependencies.requestBytes(artifactUrl.toString(), {
        pinnedAddress: target.address,
        pinnedFamily: target.family,
        headers: {
          Accept: format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ...(authorization ?? {}),
        },
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        maxResponseBytes: MAX_DELIVERY_ARTIFACT_BYTES,
      });
      if (!validateArtifactBody(
        format,
        response,
        delivery.data.verification.byteLength,
        delivery.data.verification.sha256,
      )) {
        return jsonError(502, "artifact_fetch_failed", "Unable to download deck.");
      }

      const contentType = format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      // The verified body remains resident until the client drains or cancels
      // the response, so the stream owns the scarce reservation from here.
      const responseBody = streamVerifiedArtifact(response.body, releaseDownload);
      const downloadResponse = new Response(responseBody, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${safeDownloadFilename(deck.companyName, format)}"`,
          "Content-Length": String(response.body.byteLength),
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
      reservationTransferredToStream = true;
      return downloadResponse;
    } catch {
      return jsonError(502, "artifact_fetch_failed", "Unable to download deck.");
    } finally {
      if (!reservationTransferredToStream) releaseDownload();
    }
  };
}
