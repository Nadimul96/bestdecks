import { z } from "zod";

import {
  isPersistableSourceUrl,
  normalizePersistableSourceUrl,
} from "@/src/domain/source-url";

import { HttpError, requestJsonWithMetadata, sleep } from "./http";
import type {
  CrawlPage,
  CrawlRequest,
  CrawlResult,
  ProviderCallOptions,
  ResumableCrawlProvider,
} from "./providers";
import { reportProviderObservability } from "./providers";

export const CLOUDFLARE_CRAWLER_METADATA = {
  providerId: "cloudflare.browser-rendering.crawl",
  apiVersion: "v4",
  modelId: null,
  contractVersion: 1,
  capabilities: {
    asynchronousJobs: true,
    renderedPages: true,
    pagination: true,
    outputFormats: ["html", "markdown", "json"],
  },
} as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_POLL_DELAY_MS = 3_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;
const DEFAULT_MAX_RECORD_PAGES = 1_000;
// Cloudflare paginates near 10 MiB; allow bounded envelope overhead above that page size.
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RECORDS_PER_RESPONSE = 1_000;
const MAX_RETAINED_RECORDS = 100;
// Gemini consumes at most 15k characters from the final crawl checkpoint. Keep
// enough source context for selection while bounding duplicated DB artifacts.
const MAX_RETAINED_TEXT_BYTES_PER_FIELD = 64 * 1024;
const MAX_RETAINED_CRAWL_TEXT_BYTES = 256 * 1024;

function truncateUtf8(value: string, maxBytes: number) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return value;

  // If the first excluded byte is a UTF-8 continuation byte, exclude the
  // incomplete code point as well. This keeps both the byte cap and text valid.
  let end = maxBytes;
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end -= 1;
  return encoded.subarray(0, end).toString("utf8");
}

const WebUrlSchema = z.string().max(2_048).url()
  .refine(isPersistableSourceUrl, "Expected a safe HTTP(S) source URL.")
  .transform(normalizePersistableSourceUrl);

const CloudflareErrorItemSchema = z.object({
  code: z.number().int(),
  message: z.string(),
}).passthrough();

const CloudflareCrawlRecordSchema = z.object({
  url: WebUrlSchema,
  status: z.string().trim().min(1).max(100),
  html: z.string().max(2 * 1024 * 1024).optional(),
  markdown: z.string().max(2 * 1024 * 1024).optional(),
  json: z.unknown().optional(),
  metadata: z.object({
    status: z.union([
      z.literal(0),
      z.number().int().min(100).max(599),
    ]).optional(),
    title: z.string().max(1_000).optional(),
    url: WebUrlSchema.optional(),
  }).passthrough().optional(),
}).passthrough();

const CloudflareCrawlJobResultSchema = z.object({
  id: z.string().trim().min(1).max(256).optional(),
  status: z.string().trim().min(1).max(100),
  total: z.number().int().nonnegative().optional(),
  finished: z.number().int().nonnegative().optional(),
  cursor: z.union([z.number().int().nonnegative(), z.string().max(2_048)]).optional(),
  records: z.array(CloudflareCrawlRecordSchema).max(MAX_RECORDS_PER_RESPONSE).optional(),
  results: z.array(CloudflareCrawlRecordSchema).max(MAX_RECORDS_PER_RESPONSE).optional(),
}).passthrough();

const CrawlStartResultSchema = z.union([
  z.string().trim().min(1).max(256),
  z.object({
    id: z.string().trim().min(1).max(256).optional(),
    jobId: z.string().trim().min(1).max(256).optional(),
  }).passthrough().refine((value) => Boolean(value.id || value.jobId)),
]);

const CloudflareCrawlerConfigSchema = z.object({
  accountId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  apiToken: z.string().trim().min(1).max(8_192),
  pollDelayMs: z.number().int().min(0).max(60_000),
  maxPollAttempts: z.number().int().min(1).max(600),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
  retryBaseDelayMs: z.number().int().min(0).max(30_000),
  maxRecordPages: z.number().int().min(1).max(10_000),
}).strict();

export type CloudflareProviderErrorCode =
  | "authentication"
  | "client_request"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "contract"
  | "job_failed"
  | "poll_timeout";

export class CloudflareProviderError extends Error {
  public readonly providerId = CLOUDFLARE_CRAWLER_METADATA.providerId;

  public constructor(
    public readonly operation: "start" | "poll" | "records",
    public readonly code: CloudflareProviderErrorCode,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(`Cloudflare crawl ${operation} failed (${code}).`);
    this.name = "CloudflareProviderError";
  }
}

class CloudflareContractError extends Error {
  public constructor(public readonly code: "contract" | "job_failed") {
    super(code);
    this.name = "CloudflareContractError";
  }
}

export interface CloudflareCrawlerOptions {
  accountId: string;
  apiToken: string;
  pollDelayMs?: number;
  maxPollAttempts?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRecordPages?: number;
}

type CloudflareOperation = CloudflareProviderError["operation"];

interface BrowserUsageAccumulator {
  browserMilliseconds: number;
  observed: boolean;
}

export class CloudflareCrawler implements ResumableCrawlProvider {
  public readonly name = "cloudflare" as const;
  public readonly providerId = CLOUDFLARE_CRAWLER_METADATA.providerId;
  public readonly modelId = CLOUDFLARE_CRAWLER_METADATA.modelId;
  public readonly capabilities = CLOUDFLARE_CRAWLER_METADATA.capabilities;

  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly pollDelayMs: number;
  private readonly maxPollAttempts: number;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRecordPages: number;

  public constructor(options: CloudflareCrawlerOptions) {
    const parsed = CloudflareCrawlerConfigSchema.safeParse({
      ...options,
      pollDelayMs: options.pollDelayMs ?? DEFAULT_POLL_DELAY_MS,
      maxPollAttempts: options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      maxRecordPages: options.maxRecordPages ?? DEFAULT_MAX_RECORD_PAGES,
    });

    if (!parsed.success) {
      // Configuration errors deliberately omit field values because one is a secret.
      throw new TypeError("Cloudflare crawler configuration is invalid.");
    }

    this.accountId = parsed.data.accountId;
    this.apiToken = parsed.data.apiToken;
    this.pollDelayMs = parsed.data.pollDelayMs;
    this.maxPollAttempts = parsed.data.maxPollAttempts;
    this.requestTimeoutMs = parsed.data.requestTimeoutMs;
    this.maxRetries = parsed.data.maxRetries;
    this.retryBaseDelayMs = parsed.data.retryBaseDelayMs;
    this.maxRecordPages = parsed.data.maxRecordPages;
  }

  public async crawlSite(
    request: CrawlRequest,
    options: ProviderCallOptions = {},
  ): Promise<CrawlResult> {
    const jobId = await this.startCrawl(request, options);
    return this.resumeCrawl(jobId, request, options);
  }

  public async resumeCrawl(
    jobId: string,
    request: CrawlRequest,
    options: ProviderCallOptions = {},
  ): Promise<CrawlResult> {
    const parsedJobId = z.string().trim().min(1).max(256).safeParse(jobId);
    if (!parsedJobId.success) {
      throw new CloudflareProviderError("poll", "contract", false);
    }
    const usage: BrowserUsageAccumulator = {
      browserMilliseconds: 0,
      observed: false,
    };
    const job = await this.waitForCompletion(parsedJobId.data, usage, options.signal);
    const requestedRecordLimit = Math.min(
      Math.max(request.maxPages ?? 10, 1),
      MAX_RETAINED_RECORDS,
    );
    const records = await this.fetchAllRecords(
      parsedJobId.data,
      requestedRecordLimit,
      usage,
      options.signal,
    );
    let retainedTextBytes = 0;
    const retainText = (value: string | undefined) => {
      if (!value || retainedTextBytes >= MAX_RETAINED_CRAWL_TEXT_BYTES) return undefined;
      const available = Math.min(
        MAX_RETAINED_TEXT_BYTES_PER_FIELD,
        MAX_RETAINED_CRAWL_TEXT_BYTES - retainedTextBytes,
      );
      const retained = truncateUtf8(value, available);
      retainedTextBytes += Buffer.byteLength(retained, "utf8");
      return retained || undefined;
    };

    const pages: CrawlPage[] = records
      .filter((record) => record.status === "completed")
      .map((record) => ({
        url: record.url,
        title: record.metadata?.title,
        html: request.requestedFormats.includes("html") ? retainText(record.html) : undefined,
        markdown: request.requestedFormats.includes("markdown")
          ? retainText(record.markdown)
          : undefined,
        statusCode: record.metadata?.status,
      }));

    const result: CrawlResult = {
      provider: this.name,
      rawJobId: parsedJobId.data,
      status: job.status,
      pages,
      blockedUrls: records
        .filter((record) => record.status === "disallowed")
        .map((record) => record.url),
      discoveredUrls: [...new Set(records.map((record) => record.url))],
    };
    reportProviderObservability(options, cloudflareObservability(usage));
    return result;
  }

  private buildHeaders() {
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  private buildBaseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/crawl`;
  }

  public async startCrawl(
    request: CrawlRequest,
    options: ProviderCallOptions = {},
  ): Promise<string> {
    let websiteUrl: string;
    try {
      websiteUrl = normalizePersistableSourceUrl(request.websiteUrl);
    } catch {
      throw new CloudflareProviderError("start", "client_request", false);
    }
    const usage: BrowserUsageAccumulator = {
      browserMilliseconds: 0,
      observed: false,
    };
    const payload = {
      url: websiteUrl,
      ...(request.maxPages === undefined ? {} : { limit: request.maxPages }),
      ...(request.maxDepth === undefined ? {} : { depth: request.maxDepth }),
      ...(request.source === undefined ? {} : { source: request.source }),
      ...(request.render === undefined ? {} : { render: request.render }),
      ...(request.maxAgeSeconds === undefined ? {} : { maxAge: request.maxAgeSeconds }),
      ...(request.modifiedSinceUnixSeconds === undefined
        ? {}
        : { modifiedSince: request.modifiedSinceUnixSeconds }),
      ...(request.requestedFormats.length === 0
        ? {}
        : { formats: request.requestedFormats }),
      options: {
        ...(request.includeExternalLinks === undefined
          ? {}
          : { includeExternalLinks: request.includeExternalLinks }),
        ...(request.includeSubdomains === undefined
          ? {}
          : { includeSubdomains: request.includeSubdomains }),
        ...(request.includePatterns === undefined
          ? {}
          : { includePatterns: request.includePatterns }),
        ...(request.excludePatterns === undefined
          ? {}
          : { excludePatterns: request.excludePatterns }),
      },
      ...(request.rejectResourceTypes === undefined
        ? {}
        : { rejectResourceTypes: request.rejectResourceTypes }),
    };

    const result = await this.requestWithRetry("start", async () => {
      const response = await requestJsonWithMetadata<unknown>(this.buildBaseUrl(), {
        method: "POST",
        headers: this.buildHeaders(),
        body: payload,
        signal: options.signal,
        timeoutMs: this.requestTimeoutMs,
        maxResponseBytes: MAX_RESPONSE_BYTES,
      });
      retainBrowserUsage(usage, response.metadata.browserMilliseconds);
      return parseCloudflareEnvelope(response.data, CrawlStartResultSchema);
    }, options.signal);

    const jobId = typeof result === "string" ? result : result.id ?? result.jobId;
    if (!jobId) {
      throw new CloudflareProviderError("start", "contract", false);
    }
    reportProviderObservability(options, cloudflareObservability(usage));
    return jobId;
  }

  private async waitForCompletion(
    jobId: string,
    usage: BrowserUsageAccumulator,
    signal?: AbortSignal,
  ) {
    const encodedJobId = encodeURIComponent(jobId);

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const job = await this.requestWithRetry("poll", async () => {
        const response = await requestJsonWithMetadata<unknown>(
          `${this.buildBaseUrl()}/${encodedJobId}?limit=1`,
          {
            headers: this.buildHeaders(),
            signal,
            timeoutMs: this.requestTimeoutMs,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          },
        );
        retainBrowserUsage(usage, response.metadata.browserMilliseconds);
        return parseCloudflareEnvelope(response.data, CloudflareCrawlJobResultSchema);
      }, signal);

      if (job.status === "completed") {
        return job;
      }
      if ([
        "errored",
        "cancelled_due_to_timeout",
        "cancelled_due_to_limits",
        "cancelled_by_user",
        "failed",
        "cancelled",
        "canceled",
        "error",
      ].includes(job.status)) {
        throw new CloudflareProviderError("poll", "job_failed", false);
      }
      if (!["queued", "pending", "running", "processing"].includes(job.status)) {
        throw new CloudflareProviderError("poll", "contract", false);
      }

      if (attempt + 1 < this.maxPollAttempts) {
        await sleep(this.pollDelayMs, signal);
      }
    }

    throw new CloudflareProviderError("poll", "poll_timeout", true);
  }

  private async fetchAllRecords(
    jobId: string,
    recordLimit: number,
    usage: BrowserUsageAccumulator,
    signal?: AbortSignal,
  ) {
    const records: z.infer<typeof CloudflareCrawlRecordSchema>[] = [];
    const seenCursors = new Set<string>();
    const encodedJobId = encodeURIComponent(jobId);
    let cursor: string | number | undefined;

    for (let page = 0; page < this.maxRecordPages; page += 1) {
      const query = cursor === undefined
        ? ""
        : `?${new URLSearchParams({ cursor: String(cursor) }).toString()}`;
      const result = await this.requestWithRetry("records", async () => {
        const response = await requestJsonWithMetadata<unknown>(
          `${this.buildBaseUrl()}/${encodedJobId}${query}`,
          {
            headers: this.buildHeaders(),
            signal,
            timeoutMs: this.requestTimeoutMs,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          },
        );
        retainBrowserUsage(usage, response.metadata.browserMilliseconds);
        return parseCloudflareEnvelope(response.data, CloudflareCrawlJobResultSchema);
      }, signal);

      const remaining = recordLimit - records.length;
      records.push(...(result.records ?? result.results ?? []).slice(0, remaining));
      if (records.length >= recordLimit) return records;
      cursor = result.cursor;
      if (cursor === undefined || cursor === null || cursor === "") {
        return records;
      }

      const cursorKey = String(cursor);
      if (seenCursors.has(cursorKey)) {
        throw new CloudflareProviderError("records", "contract", false);
      }
      seenCursors.add(cursorKey);
    }

    throw new CloudflareProviderError("records", "contract", false);
  }

  private async requestWithRetry<T>(
    operation: CloudflareOperation,
    request: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        const normalized = normalizeCloudflareError(error, operation);
        // Starting a crawl is a paid, state-creating POST. A timeout, network
        // failure, or 5xx can arrive after Cloudflare accepted it, so replaying
        // would risk an orphan duplicate job. Only 429 proves a safe retry
        // condition for this operation; polling and record reads remain retryable.
        const safeToRetry = operation !== "start" || normalized.status === 429;
        if (!normalized.retryable || !safeToRetry || attempt === this.maxRetries) {
          throw normalized;
        }

        const delayMs = Math.min(
          this.retryBaseDelayMs * 2 ** attempt,
          30_000,
        );
        console.warn("[cloudflare] retrying provider request", {
          providerId: this.providerId,
          operation,
          attempt: attempt + 1,
          maxAttempts: this.maxRetries + 1,
          code: normalized.code,
          status: normalized.status,
        });
        await sleep(delayMs, signal);
      }
    }

    throw new CloudflareProviderError(operation, "network", true);
  }
}

function retainBrowserUsage(
  usage: BrowserUsageAccumulator,
  browserMilliseconds: number | undefined,
) {
  if (browserMilliseconds === undefined) return;
  const total = usage.browserMilliseconds + browserMilliseconds;
  if (!Number.isSafeInteger(total)) {
    throw new CloudflareContractError("contract");
  }
  usage.browserMilliseconds = total;
  usage.observed = true;
}

function cloudflareObservability(usage: BrowserUsageAccumulator) {
  return usage.observed
    ? {
        usage: [{
          metric: "browser_time",
          unit: "milliseconds",
          amount: usage.browserMilliseconds,
        }],
      }
    : undefined;
}

function parseCloudflareEnvelope<T extends z.ZodTypeAny>(
  value: unknown,
  resultSchema: T,
): z.infer<T> {
  const envelopeSchema = z.object({
    success: z.boolean(),
    errors: z.array(CloudflareErrorItemSchema).optional(),
    messages: z.array(CloudflareErrorItemSchema).optional(),
    result: resultSchema.optional(),
  }).passthrough();
  const parsed = envelopeSchema.safeParse(value);

  if (!parsed.success || !parsed.data.success || parsed.data.result === undefined) {
    throw new CloudflareContractError("contract");
  }
  return parsed.data.result;
}

function normalizeCloudflareError(
  error: unknown,
  operation: CloudflareOperation,
): CloudflareProviderError {
  if (error instanceof CloudflareProviderError) {
    return error;
  }
  if (error instanceof CloudflareContractError) {
    return new CloudflareProviderError(operation, error.code, false);
  }
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return new CloudflareProviderError(operation, "authentication", false, error.status);
    }
    if (error.status === 408 || error.status === 429 || error.status >= 500) {
      return new CloudflareProviderError(
        operation,
        error.status === 429 ? "rate_limited" : "provider_unavailable",
        true,
        error.status,
      );
    }
    return new CloudflareProviderError(operation, "client_request", false, error.status);
  }
  if (
    error instanceof Error
    && error.message.startsWith("Provider returned malformed JSON")
  ) {
    return new CloudflareProviderError(operation, "contract", false);
  }
  return new CloudflareProviderError(operation, "network", true);
}
