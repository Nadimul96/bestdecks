import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import {
  isRichStaticQuestionnaire,
  RICH_STATIC_VISUAL_PROFILE,
  richStaticLayoutIdSchema,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";

import type {
  DeckCreateOptions,
  DeckGenerationInput,
  ArtifactVerification,
  ArtifactVerificationOptions,
  PresentonProvider,
  PresentonResult,
} from "./providers";
import {
  PptxContentVerificationError,
  verifyPptxVisibleText,
} from "./pptx-content-verifier";
import {
  buildPresentonRichStaticSlides,
  presentonRichStaticSlideContentSchema,
  presentonRichStaticSlideSchema,
  type PresentonRichStaticSlide,
} from "./presenton-rich-static-ui";
import {
  HttpError,
  requestBytes,
  requestJson,
  ResponseLengthMismatchError,
  ResponseSizeLimitError,
  sleep,
} from "./http";
import {
  parseOutboundHttpUrl,
  resolveSafeOutboundTarget,
} from "./url-policy";

const uuidSchema = z.string().uuid();

const presentonCreateResponseSchema = z.object({
  id: uuidSchema,
  version: z.literal("v2-standard"),
  content: z.string(),
  n_slides: z.number().int().positive().max(60),
  language: z.string(),
  include_table_of_contents: z.boolean(),
  include_title_slide: z.boolean(),
  web_search: z.boolean(),
}).passthrough();

const presentonUpdateResponseSchema = z.object({
  id: uuidSchema,
  n_slides: z.number().int().positive().max(60),
  title: z.string().nullable(),
  slides: z.array(presentonRichStaticSlideSchema).min(1).max(60),
}).passthrough();

const presentonExportResponseSchema = z.object({
  presentation_id: uuidSchema,
  path: z.string().trim().min(1).max(8_192),
  edit_path: z.string().trim().min(1).max(8_192),
}).strict();

function hasRendererActiveMarkup(value: string) {
  return /!?\[[^\]\r\n]{0,2000}\]\([^)\r\n]{1,8192}\)|!\[|^\s{0,3}\[[^\]\r\n]{1,2000}\]:|<\/?[a-z][^>\r\n]*>|<https?:\/\/[^>\r\n]+>/imu.test(value);
}

const presentonSlideContentSchema = z.object({
  headline: z.string().min(1).max(500)
    .refine((value) => value === value.trim(), "Slide headlines must be trimmed.")
    .refine((value) => !/[\r\n]/.test(value), "Slide headlines must be one line.")
    .refine(
      (value) => !hasRendererActiveMarkup(value),
      "Renderer-active links, images, and HTML are not allowed.",
    ),
  bulletPoints: z.array(
    z.string().min(1).max(1_000)
      .refine((value) => value === value.trim(), "Slide bullets must be trimmed.")
      .refine((value) => !/[\r\n]/.test(value), "Slide bullets must be one line.")
      .refine(
        (value) => !hasRendererActiveMarkup(value),
        "Renderer-active links, images, and HTML are not allowed.",
      ),
  ).max(10),
}).strict();

export interface PresentonSlideContent {
  headline: string;
  bulletPoints: string[];
}

/** Map only evidence-gated visible claims; notes and model prompts never enter the renderer. */
export function buildPresentonSlidesMarkdown(
  slides: readonly PresentonSlideContent[],
): string[] {
  return z.array(presentonSlideContentSchema).min(1).max(30).parse(slides).map(
    (slide) => [
      `# ${slide.headline}`,
      ...slide.bulletPoints.map((bullet) => `- ${bullet}`),
    ].join("\n"),
  );
}

export type PresentonProviderErrorCode =
  | "authentication"
  | "client_request"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "indeterminate_render_outcome"
  | "contract"
  | "configuration";

export class PresentonProviderError extends Error {
  public readonly providerId = "presenton.render-only";
  public readonly operation = "render" as const;

  public constructor(
    public readonly code: PresentonProviderErrorCode,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(`Presenton rendering failed (${code}).`);
    this.name = "PresentonProviderError";
  }
}

export const presentonProviderMetadata = {
  providerId: "presenton.render-only",
  modelId: null,
  contractVersion: 4,
  capabilities: [
    "exact-slide-model-ui",
    "caller-generated-slide-ids",
    "no-model-rendering",
    "pptx",
    "rich-static-vector-attestation",
  ],
} as const;

export interface PresentonProviderOptions {
  baseUrl: string;
  apiKey?: string;
  basicAuthUsername?: string;
  basicAuthPassword?: string;
  defaultTemplate?: string;
  allowPrivateNetwork?: boolean;
}

function isHostedPresenton(baseUrl: string) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase().replace(/\.$/u, "");
    return hostname === "presenton.ai" || hostname.endsWith(".presenton.ai");
  } catch {
    return false;
  }
}

function toAbsoluteUrl(baseUrl: string, candidate?: string) {
  if (!candidate) {
    return undefined;
  }

  const base = new URL(baseUrl);
  const absolute = new URL(candidate, base);
  if (!["http:", "https:"].includes(absolute.protocol) || absolute.username || absolute.password) {
    throw new PresentonProviderError("contract", false);
  }

  if (absolute.origin !== base.origin) {
    throw new PresentonProviderError("contract", false);
  }

  return absolute.toString();
}

/**
 * Renderer URLs are persisted for resume and owner-scoped downloads. Accept
 * only stable presentation identifiers in their query string; signed provider
 * capabilities (for example X-Amz-* URLs) must be copied into operator-owned
 * storage by a future managed service instead of being written to the OSS DB.
 */
function toPersistableUrl(baseUrl: string, candidate?: string) {
  const resolved = toAbsoluteUrl(baseUrl, candidate);
  if (!resolved) return undefined;

  const url = new URL(resolved);
  if (url.hash || url.searchParams.size > 2) {
    throw new PresentonProviderError("contract", false);
  }

  const allowedKeys = new Set(["id", "presentation_id"]);
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (
      !allowedKeys.has(key)
      || seen.has(key)
      || !/^[A-Za-z0-9._~-]{1,512}$/u.test(value)
    ) {
      throw new PresentonProviderError("contract", false);
    }
    seen.add(key);
  }

  return url.toString();
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const MUTATION_TIMEOUT_MS = 120_000;
const ARTIFACT_TIMEOUT_MS = 60_000;
const PRESENTATION_CONTENT = "";
const PRESENTATION_LANGUAGE = "English";
const PRESENTATION_TITLE = "Bestdecks";

function assertPptxExport(url: string, body: Buffer, contentType?: string): void {
  const pathname = new URL(url).pathname.toLowerCase();
  const normalizedContentType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !pathname.endsWith(".pptx")
    || (normalizedContentType
      && !new Set([
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/octet-stream",
      ]).has(normalizedContentType))
    || !body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    throw new PresentonProviderError("contract", false);
  }
}

async function requestPresentonMutation<T>(
  url: string,
  options: NonNullable<Parameters<typeof requestJson>[1]>,
  allowPrivateNetwork: boolean,
  hasPriorSideEffect: boolean,
): Promise<T> {
  let lastError: PresentonProviderError | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let target: Awaited<ReturnType<typeof resolveSafeOutboundTarget>>;
    try {
      target = await resolveSafeOutboundTarget(url, { allowPrivateNetwork });
    } catch (error) {
      throw normalizePresentonError(error, hasPriorSideEffect);
    }

    try {
      return await requestJson<T>(url, {
        ...options,
        pinnedAddress: target.address,
        pinnedFamily: target.family,
        timeoutMs: MUTATION_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = normalizePresentonError(error, true);
      if (lastError.code !== "rate_limited") throw lastError;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        console.warn("[presenton] rejected mutation retry scheduled", {
          operation: "render",
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES + 1,
          delayMs: delay,
          code: lastError.code,
          status: lastError.status,
        });
        await sleep(delay, options.signal);
      } else if (hasPriorSideEffect) {
        throw new PresentonProviderError(
          "indeterminate_render_outcome",
          false,
          lastError.status,
        );
      }
    }
  }
  throw lastError ?? new PresentonProviderError("indeterminate_render_outcome", false);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function assertCreateEcho(
  response: z.infer<typeof presentonCreateResponseSchema>,
  slideCount: number,
) {
  if (
    response.content !== PRESENTATION_CONTENT
    || response.n_slides !== slideCount
    || response.language !== PRESENTATION_LANGUAGE
    || response.include_table_of_contents
    || response.include_title_slide
    || response.web_search
  ) {
    throw new PresentonProviderError("contract", false);
  }
}

function assertUpdateEcho(
  response: z.infer<typeof presentonUpdateResponseSchema>,
  presentationId: string,
  slides: PresentonRichStaticSlide[],
) {
  if (
    response.id !== presentationId
    || response.n_slides !== slides.length
    || response.title !== PRESENTATION_TITLE
    || canonicalJson(response.slides) !== canonicalJson(slides)
  ) {
    throw new PresentonProviderError("contract", false);
  }
}

function normalizePresentonError(
  error: unknown,
  ambiguousRenderDispatch = false,
): PresentonProviderError {
  if (error instanceof PresentonProviderError) return error;
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return new PresentonProviderError("authentication", false, error.status);
    }
    if (error.status === 429) {
      return new PresentonProviderError("rate_limited", true, error.status);
    }
    if (error.status === 408) {
      return new PresentonProviderError(
        ambiguousRenderDispatch ? "indeterminate_render_outcome" : "network",
        !ambiguousRenderDispatch,
        error.status,
      );
    }
    if (error.status >= 500) {
      return new PresentonProviderError(
        ambiguousRenderDispatch ? "indeterminate_render_outcome" : "provider_unavailable",
        !ambiguousRenderDispatch,
        error.status,
      );
    }
    return new PresentonProviderError("client_request", false, error.status);
  }
  if (
    error instanceof SyntaxError
    || error instanceof z.ZodError
    || error instanceof PptxContentVerificationError
  ) {
    return new PresentonProviderError("contract", false);
  }
  if (error instanceof ResponseSizeLimitError || error instanceof ResponseLengthMismatchError) {
    return new PresentonProviderError("contract", false);
  }
  return new PresentonProviderError(
    ambiguousRenderDispatch ? "indeterminate_render_outcome" : "network",
    !ambiguousRenderDispatch,
  );
}

/**
 * Deterministic adapter for the pinned, self-hosted Presenton OSS renderer.
 * It writes complete SlideModel.ui payloads and exports them without invoking
 * Presenton's content, layout, image, or web-search model paths.
 */
export class PresentonDeckProvider implements PresentonProvider {
  public readonly name = "presenton" as const;
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly allowPrivateNetwork: boolean;

  public constructor(options: PresentonProviderOptions) {
    const parsedBaseUrl = parseOutboundHttpUrl(options.baseUrl);
    parsedBaseUrl.search = "";
    parsedBaseUrl.hash = "";
    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, "");
    if (isHostedPresenton(this.baseUrl) || options.apiKey !== undefined) {
      throw new PresentonProviderError("configuration", false);
    }
    const rawUsername = options.basicAuthUsername;
    const username = rawUsername?.trim();
    const password = options.basicAuthPassword;
    const hasUsername = Boolean(username);
    const hasPassword = Boolean(password);
    if (
      hasUsername !== hasPassword
      || rawUsername !== username
      || username?.includes(":")
      || (password !== undefined && password.length < 6)
    ) {
      throw new PresentonProviderError("configuration", false);
    }
    if (!username || !password) {
      throw new PresentonProviderError("configuration", false);
    }
    this.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
    this.allowPrivateNetwork = options.allowPrivateNetwork ?? false;
    const normalizedTemplate = options.defaultTemplate?.trim()
      || RICH_STATIC_VISUAL_PROFILE.templateId;
    if (normalizedTemplate !== RICH_STATIC_VISUAL_PROFILE.templateId) {
      throw new PresentonProviderError("configuration", false);
    }
  }

  public async createDeck(
    input: DeckGenerationInput,
    imageUrls: string[] = [],
    options: DeckCreateOptions = {},
  ): Promise<PresentonResult> {
    if (imageUrls.length !== 0 || !isRichStaticQuestionnaire(input)) {
      throw new PresentonProviderError("contract", false);
    }
    const exactSlides = z.array(presentonRichStaticSlideContentSchema)
      .min(1)
      .max(60)
      .safeParse(options.exactSlides);
    if (!exactSlides.success || exactSlides.data.length !== input.cardCount) {
      throw new PresentonProviderError("contract", false);
    }
    const layoutIds = z.array(richStaticLayoutIdSchema)
      .length(input.cardCount)
      .safeParse(options.layoutIds);
    const expectedLayoutIds = selectRichStaticLayoutIds(input.cardCount);
    if (
      !layoutIds.success
      || layoutIds.data.some((layoutId, index) => layoutId !== expectedLayoutIds[index])
    ) {
      throw new PresentonProviderError("contract", false);
    }

    if (input.outputFormat !== "pptx") {
      throw new PresentonProviderError("client_request", false);
    }

    const headers = { Authorization: this.authorization };
    const createResponse = await requestPresentonMutation<unknown>(
      `${this.baseUrl}/api/v1/ppt/presentation/create`,
      {
        method: "POST",
        headers,
        signal: options.signal,
        body: {
          content: PRESENTATION_CONTENT,
          n_slides: exactSlides.data.length,
          language: PRESENTATION_LANGUAGE,
          include_table_of_contents: false,
          include_title_slide: false,
          web_search: false,
        },
      },
      this.allowPrivateNetwork,
      false,
    );
    const parsedCreate = presentonCreateResponseSchema.safeParse(createResponse);
    if (!parsedCreate.success) {
      throw new PresentonProviderError("contract", false);
    }
    assertCreateEcho(parsedCreate.data, exactSlides.data.length);
    const presentationId = parsedCreate.data.id;

    const slideIds = exactSlides.data.map(() => randomUUID());
    const slides = buildPresentonRichStaticSlides({
      presentationId,
      slideIds,
      slides: exactSlides.data,
      layoutIds: layoutIds.data,
    });
    const updateResponse = await requestPresentonMutation<unknown>(
      `${this.baseUrl}/api/v1/ppt/presentation/update`,
      {
        method: "PATCH",
        headers,
        signal: options.signal,
        body: {
          id: presentationId,
          n_slides: slides.length,
          title: PRESENTATION_TITLE,
          slides,
        },
      },
      this.allowPrivateNetwork,
      true,
    );
    const parsedUpdate = presentonUpdateResponseSchema.safeParse(updateResponse);
    if (!parsedUpdate.success) {
      throw new PresentonProviderError("contract", false);
    }
    assertUpdateEcho(parsedUpdate.data, presentationId, slides);

    const exportResponse = await requestPresentonMutation<unknown>(
      `${this.baseUrl}/api/v1/ppt/presentation/edit`,
      {
        method: "POST",
        headers,
        signal: options.signal,
        body: {
          presentation_id: presentationId,
          slides: [],
          export_as: "pptx",
        },
      },
      this.allowPrivateNetwork,
      true,
    );
    const parsedExport = presentonExportResponseSchema.safeParse(exportResponse);
    if (
      !parsedExport.success
      || parsedExport.data.presentation_id !== presentationId
    ) {
      throw new PresentonProviderError("contract", false);
    }
    const exportUrl = toPersistableUrl(this.baseUrl, parsedExport.data.path);
    if (!exportUrl || !new URL(exportUrl).pathname.toLowerCase().endsWith(".pptx")) {
      throw new PresentonProviderError("contract", false);
    }

    return {
      presentationId,
      exportUrl,
    } satisfies PresentonResult;
  }

  public async verifyArtifact(
    result: PresentonResult,
    options: ArtifactVerificationOptions,
  ): Promise<ArtifactVerification> {
    const candidateUrl = result.exportUrl;
    if (!candidateUrl) throw new PresentonProviderError("contract", false);
    // Re-apply the provider-result allowlist at the side-effect boundary. A
    // checkpoint or caller must not be able to turn verification into an
    // arbitrary authenticated (or unauthenticated) fetch.
    const url = toAbsoluteUrl(this.baseUrl, candidateUrl);
    if (!url) throw new PresentonProviderError("contract", false);
    if (!new URL(url).pathname.toLowerCase().endsWith(".pptx")) {
      throw new PresentonProviderError("contract", false);
    }

    try {
      const target = await resolveSafeOutboundTarget(url, {
        allowPrivateNetwork: this.allowPrivateNetwork,
      });
      const response = await requestBytes(url, {
        pinnedAddress: target.address,
        pinnedFamily: target.family,
        headers: new URL(url).origin === new URL(this.baseUrl).origin
          ? { Authorization: this.authorization }
          : undefined,
        signal: options.signal,
        timeoutMs: ARTIFACT_TIMEOUT_MS,
        maxResponseBytes: MAX_DELIVERY_ARTIFACT_BYTES,
      });
      if (response.status < 200 || response.status >= 300 || response.body.byteLength === 0) {
        throw new HttpError("Presenton artifact was not readable.", response.status, "");
      }
      assertPptxExport(url, response.body, response.contentType);
      const contentVerification = verifyPptxVisibleText(
        response.body,
        options.expectedSlides,
        options.layoutIds,
      );
      return {
        url,
        sha256: createHash("sha256").update(response.body).digest("hex"),
        byteLength: response.body.byteLength,
        ...(response.contentType ? { contentType: response.contentType } : {}),
        verifiedAt: new Date().toISOString(),
        contentVerification: contentVerification.contentVerification,
        visualProfile: contentVerification.visualProfile,
      };
    } catch (error) {
      throw normalizePresentonError(error);
    }
  }
}
