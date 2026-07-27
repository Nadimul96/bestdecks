import { z } from "zod";

import {
  isPersistableSourceUrl,
  normalizePersistableSourceUrl,
} from "@/src/domain/source-url";

import { requestText, sleep } from "./http";
import {
  invalidProviderConfiguration,
  normalizeProviderTransportError,
  parseProviderJson,
  ProviderAdapterError,
  providerErrorFromStatus,
  type ProviderAdapterMetadata,
} from "./provider-contract";
import type {
  CrawlPage,
  CrawlProvider,
  CrawlRequest,
  CrawlResult,
  ProviderCallOptions,
} from "./providers";

export const DEEPCRAWL_CRAWLER_METADATA = {
  providerId: "deepcrawl.read-links.crawl",
  apiVersion: "unversioned",
  modelId: null,
  contractVersion: 1,
  capabilities: {
    asynchronousJobs: false,
    linkExtraction: true,
    pageRead: true,
    outputFormats: ["html", "markdown"],
    usageMetadata: false,
  },
  releaseStatus: "experimental",
} as const satisfies ProviderAdapterMetadata;

const DISPLAY_NAME = "Deepcrawl";
const DEFAULT_BASE_URL = "https://api.deepcrawl.dev";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 100;

const SafeSourceUrlSchema = z.string().trim().max(2_048).url()
  .refine(isPersistableSourceUrl, "Expected a safe HTTP(S) source URL.")
  .transform(normalizePersistableSourceUrl);

const DeepcrawlLinkSchema = z.union([
  SafeSourceUrlSchema,
  z.object({ url: SafeSourceUrlSchema.optional() }).strict(),
]);

const DeepcrawlLinksResponseSchema = z.union([
  z.array(DeepcrawlLinkSchema).max(2_000),
  z.object({ links: z.array(DeepcrawlLinkSchema).max(2_000).optional() }).strict(),
]);

const DeepcrawlReadResponseSchema = z.object({
  url: SafeSourceUrlSchema.optional(),
  title: z.string().trim().min(1).max(1_000).optional(),
  markdown: z.string().max(2 * 1024 * 1024).optional(),
  html: z.string().max(2 * 1024 * 1024).optional(),
  content: z.string().max(2 * 1024 * 1024).optional(),
}).strict().refine(
  (value) => Boolean(value.markdown || value.html || value.content),
  "Deepcrawl read responses require readable content.",
);

const DeepcrawlConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(8_192),
  baseUrl: z.literal(DEFAULT_BASE_URL),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
  retryBaseDelayMs: z.number().int().min(0).max(30_000),
}).strict();

const DeepcrawlRequestSchema = z.object({
  websiteUrl: SafeSourceUrlSchema,
  maxPages: z.number().int().min(1).max(MAX_PAGES),
  requestedFormats: z.array(z.enum(["html", "markdown", "json"])).min(1).max(3),
}).strict().refine(
  (value) => value.requestedFormats.includes("html") || value.requestedFormats.includes("markdown"),
  "Deepcrawl requires HTML or Markdown output.",
);

export interface DeepcrawlCrawlerOptions {
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

type DeepcrawlOperation = "configuration" | "links" | "read" | "crawl";

export class DeepcrawlCrawler implements CrawlProvider {
  public readonly name = "deepcrawl" as const;
  public readonly providerId = DEEPCRAWL_CRAWLER_METADATA.providerId;
  public readonly modelId = DEEPCRAWL_CRAWLER_METADATA.modelId;
  public readonly capabilities = DEEPCRAWL_CRAWLER_METADATA.capabilities;
  public readonly contractVersion = DEEPCRAWL_CRAWLER_METADATA.contractVersion;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  public constructor(options: DeepcrawlCrawlerOptions) {
    const parsed = DeepcrawlConfigSchema.safeParse({
      apiKey: options.apiKey,
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, ""),
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    });
    if (!parsed.success) {
      throw invalidProviderConfiguration(this.providerId, DISPLAY_NAME);
    }

    this.apiKey = parsed.data.apiKey;
    this.baseUrl = parsed.data.baseUrl;
    this.requestTimeoutMs = parsed.data.requestTimeoutMs;
    this.maxRetries = parsed.data.maxRetries;
    this.retryBaseDelayMs = parsed.data.retryBaseDelayMs;
  }

  public async crawlSite(
    request: CrawlRequest,
    options: ProviderCallOptions = {},
  ): Promise<CrawlResult> {
    const parsedRequest = DeepcrawlRequestSchema.safeParse({
      websiteUrl: request.websiteUrl,
      maxPages: request.maxPages ?? 20,
      requestedFormats: request.requestedFormats,
    });
    if (!parsedRequest.success) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "crawl",
        "client_request",
        false,
      );
    }

    const normalizedRequest = parsedRequest.data;
    const discoveredUrls = await this.extractLinks(normalizedRequest, options);
    const targetUrls = [normalizedRequest.websiteUrl, ...discoveredUrls]
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, normalizedRequest.maxPages);

    const settled = await Promise.allSettled(
      targetUrls.map((url) => this.readPage(
        url,
        normalizedRequest.requestedFormats,
        options,
      )),
    );
    if (options.signal?.aborted) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "crawl",
        "aborted",
        false,
      );
    }

    const pages = settled
      .filter((result): result is PromiseFulfilledResult<CrawlPage> =>
        result.status === "fulfilled"
      )
      .map((result) => result.value);
    const failures = settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => normalizeProviderTransportError({
        error: result.reason,
        providerId: this.providerId,
        displayName: DISPLAY_NAME,
        operation: "read",
        signal: options.signal,
      }));
    const fatal = failures.find((error) =>
      !["network", "timeout", "rate_limited", "provider_unavailable"].includes(error.code)
    );
    if (fatal) throw fatal;
    if (pages.length === 0) {
      throw failures[0] ?? new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "crawl",
        "empty_response",
        false,
      );
    }

    return {
      provider: this.name,
      pages,
      blockedUrls: [],
      discoveredUrls: targetUrls,
      status: "completed",
    };
  }

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async extractLinks(
    request: z.infer<typeof DeepcrawlRequestSchema>,
    options: ProviderCallOptions,
  ) {
    const endpoint = new URL("/links", this.baseUrl);
    endpoint.searchParams.set("url", request.websiteUrl);
    const response = await this.get(endpoint.toString(), "links", options);
    const payload = parseProviderJson({
      text: response,
      schema: DeepcrawlLinksResponseSchema,
      providerId: this.providerId,
      displayName: DISPLAY_NAME,
      operation: "links",
    });
    const links = Array.isArray(payload) ? payload : payload.links ?? [];

    return links
      .map((item) => typeof item === "string" ? item : item.url)
      .filter((value): value is string => Boolean(value))
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, Math.max(request.maxPages - 1, 0));
  }

  private async readPage(
    url: string,
    requestedFormats: CrawlRequest["requestedFormats"],
    options: ProviderCallOptions,
  ): Promise<CrawlPage> {
    const endpoint = new URL("/read", this.baseUrl);
    endpoint.searchParams.set("url", url);
    const responseText = await this.get(endpoint.toString(), "read", options);
    const response = parseProviderJson({
      text: responseText,
      schema: DeepcrawlReadResponseSchema,
      providerId: this.providerId,
      displayName: DISPLAY_NAME,
      operation: "read",
    });
    const page: CrawlPage = {
      url: response.url ?? url,
      title: response.title,
      markdown: requestedFormats.includes("markdown")
        ? response.markdown ?? response.content
        : undefined,
      html: requestedFormats.includes("html") ? response.html : undefined,
    };
    if (!page.markdown && !page.html) {
      throw new ProviderAdapterError(
        this.providerId,
        DISPLAY_NAME,
        "read",
        "empty_response",
        false,
      );
    }
    return page;
  }

  private async get(
    url: string,
    operation: Extract<DeepcrawlOperation, "links" | "read">,
    options: ProviderCallOptions,
  ): Promise<string> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await requestText(url, {
          headers: this.headers,
          signal: options.signal,
          timeoutMs: this.requestTimeoutMs,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        if (response.status >= 200 && response.status < 300) return response.text;

        const normalized = providerErrorFromStatus(
          this.providerId,
          DISPLAY_NAME,
          operation,
          response.status,
        );
        if (!normalized.retryable || attempt === this.maxRetries) throw normalized;
      } catch (error) {
        const normalized = normalizeProviderTransportError({
          error,
          providerId: this.providerId,
          displayName: DISPLAY_NAME,
          operation,
          signal: options.signal,
        });
        if (!normalized.retryable || attempt === this.maxRetries) throw normalized;
      }

      await sleep(
        Math.min(this.retryBaseDelayMs * 2 ** attempt, 30_000),
        options.signal,
      );
    }

    throw new ProviderAdapterError(
      this.providerId,
      DISPLAY_NAME,
      operation,
      "network",
      true,
    );
  }
}
