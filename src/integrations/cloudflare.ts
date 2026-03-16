import { HttpError, requestJson, sleep } from "./http";
import type {
  CrawlPage,
  CrawlProvider,
  CrawlRequest,
  CrawlResult,
} from "./providers";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: Array<{ code: number; message: string }>;
  result: T;
}

interface CloudflareCrawlRecord {
  url: string;
  status: string;
  html?: string;
  markdown?: string;
  json?: unknown;
  metadata?: {
    status?: number;
    title?: string;
    url?: string;
  };
}

interface CloudflareCrawlJobResult {
  id?: string;
  status: string;
  total?: number;
  finished?: number;
  cursor?: number | string;
  records?: CloudflareCrawlRecord[];
  results?: CloudflareCrawlRecord[];
}

export interface CloudflareCrawlerOptions {
  accountId: string;
  apiToken: string;
  pollDelayMs?: number;
  maxPollAttempts?: number;
}

export class CloudflareCrawler implements CrawlProvider {
  public readonly name = "cloudflare" as const;
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly pollDelayMs: number;
  private readonly maxPollAttempts: number;

  public constructor(options: CloudflareCrawlerOptions) {
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.pollDelayMs = options.pollDelayMs ?? 3000;
    this.maxPollAttempts = options.maxPollAttempts ?? 30;
  }

  public async crawlSite(request: CrawlRequest): Promise<CrawlResult> {
    const jobId = await this.startCrawl(request);
    const job = await this.waitForCompletion(jobId);
    const records = await this.fetchAllRecords(jobId);

    const pages: CrawlPage[] = records
      .filter((record) => record.status === "completed")
      .map((record) => ({
        url: record.url,
        title: record.metadata?.title,
        html: record.html,
        markdown: record.markdown,
        statusCode: record.metadata?.status,
      }));

    return {
      provider: this.name,
      rawJobId: jobId,
      status: job.status,
      pages,
      blockedUrls: records
        .filter((record) => record.status === "disallowed")
        .map((record) => record.url),
      discoveredUrls: records.map((record) => record.url),
    };
  }

  private buildHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
    };
  }

  private buildBaseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/crawl`;
  }

  private async startCrawl(request: CrawlRequest) {
    const payload = {
      url: request.websiteUrl,
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

    const response = await requestJson<
      CloudflareEnvelope<string | { id?: string; jobId?: string }>
    >(this.buildBaseUrl(), {
      method: "POST",
      headers: this.buildHeaders(),
      body: payload,
    });

    if (typeof response.result === "string") {
      return response.result;
    }

    const jobId = response.result.id ?? response.result.jobId;
    if (!jobId) {
      throw new Error("Cloudflare did not return a crawl job ID.");
    }

    return jobId;
  }

  private async waitForCompletion(jobId: string) {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      try {
        const response = await requestJson<CloudflareEnvelope<CloudflareCrawlJobResult>>(
          `${this.buildBaseUrl()}/${jobId}?limit=1`,
          {
            headers: this.buildHeaders(),
          },
        );
        const status = response.result.status;

        if (!["queued", "pending", "running", "processing"].includes(status)) {
          return response.result;
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          await sleep(this.pollDelayMs);
          continue;
        }

        throw error;
      }

      await sleep(this.pollDelayMs);
    }

    throw new Error("Cloudflare crawl job did not complete within the configured timeout.");
  }

  private async fetchAllRecords(jobId: string) {
    const records: CloudflareCrawlRecord[] = [];
    let cursor: string | number | undefined;

    do {
      const query = cursor === undefined ? "" : `?cursor=${cursor}`;
      const response = await requestJson<CloudflareEnvelope<CloudflareCrawlJobResult>>(
        `${this.buildBaseUrl()}/${jobId}${query}`,
        {
          headers: this.buildHeaders(),
        },
      );

      const batch = response.result.records ?? response.result.results ?? [];
      records.push(...batch);
      cursor = response.result.cursor;
    } while (cursor !== undefined && cursor !== null && cursor !== "");

    return records;
  }
}
