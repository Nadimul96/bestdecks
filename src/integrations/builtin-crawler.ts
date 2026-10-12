import { createHash } from "node:crypto";

import { normalizePersistableSourceUrl } from "@/src/domain/source-url";

import {
  extractReadableDocument,
  extractSitemapLocations,
  truncateUtf8,
} from "./html-text";
import { ProviderAdapterError } from "./provider-contract";
import type {
  CrawlPage,
  CrawlRequest,
  CrawlResult,
  ProviderCallOptions,
  ResumableCrawlProvider,
} from "./providers";
import { reportProviderObservability } from "./providers";
import {
  HTML_CONTENT_TYPES,
  SafeWebFetcher,
  XML_CONTENT_TYPES,
  type SafeWebFetcherOptions,
} from "./web-fetcher";

export const BUILTIN_CRAWLER_METADATA = {
  providerId: "bestdecks.builtin.crawl",
  apiVersion: "1",
  modelId: null,
  contractVersion: 1,
  capabilities: {
    robotsTxt: true,
    renderedPages: false,
    sitemaps: true,
    outputFormats: ["markdown"],
  },
} as const;

const DISPLAY_NAME = "Built-in crawler";
const MAX_PAGES = 25;
const MAX_DEPTH = 3;
const MAX_SITEMAP_URLS = 200;
// Same retention budget as the Cloudflare adapter, so planning sees
// comparable evidence regardless of the crawl provider.
const MAX_RETAINED_TEXT_BYTES_PER_PAGE = 64 * 1024;
const MAX_RETAINED_CRAWL_TEXT_BYTES = 256 * 1024;
const NON_PAGE_EXTENSION =
  /\.(?:pdf|zip|gz|tar|rar|7z|png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|rss|txt|mp3|mp4|mov|webm|woff2?|ttf|eot|dmg|exe|csv|xlsx?|docx?|pptx?)$/iu;

export interface BuiltinCrawlerOptions extends SafeWebFetcherOptions {
  /** Inject a shared fetcher (tests, or reuse of a robots cache). */
  fetcher?: SafeWebFetcher;
}

function siteKey(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./u, "");
}

function crawlableUrl(value: string, scopeHosts: ReadonlySet<string>) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (!scopeHosts.has(siteKey(url.hostname))) return undefined;
  // Query strings rarely identify distinct marketing pages and are dropped
  // from persisted provenance anyway, so they are not crawled.
  if (url.search) return undefined;
  if (NON_PAGE_EXTENSION.test(url.pathname)) return undefined;
  return normalizePersistableSourceUrl(url.toString());
}

/**
 * A zero-cost crawl provider: plain HTTPS GETs, robots.txt respected, no
 * JavaScript rendering. It implements the resumable contract with a
 * deterministic local job ID, so the durable worker treats it exactly like
 * the Cloudflare adapter. Starting a "job" has no external side effect.
 */
export class BuiltinCrawler implements ResumableCrawlProvider {
  public readonly name = "builtin" as const;
  public readonly providerId = BUILTIN_CRAWLER_METADATA.providerId;
  public readonly modelId = BUILTIN_CRAWLER_METADATA.modelId;
  public readonly capabilities = BUILTIN_CRAWLER_METADATA.capabilities;

  private readonly fetcherOptions: SafeWebFetcherOptions;
  private readonly sharedFetcher?: SafeWebFetcher;

  public constructor(options: BuiltinCrawlerOptions = {}) {
    const { fetcher, ...fetcherOptions } = options;
    this.sharedFetcher = fetcher;
    this.fetcherOptions = fetcherOptions;
  }

  public async crawlSite(request: CrawlRequest, options: ProviderCallOptions = {}) {
    const jobId = await this.startCrawl(request);
    return this.resumeCrawl(jobId, request, options);
  }

  public async startCrawl(request: CrawlRequest): Promise<string> {
    const websiteUrl = this.normalizeStartUrl(request.websiteUrl);
    return `builtin:${createHash("sha256").update(websiteUrl).digest("hex").slice(0, 32)}`;
  }

  public async resumeCrawl(
    jobId: string,
    request: CrawlRequest,
    options: ProviderCallOptions = {},
  ): Promise<CrawlResult> {
    const startUrl = this.normalizeStartUrl(request.websiteUrl);
    if (jobId !== (await this.startCrawl(request))) {
      throw new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "client_request", false);
    }

    const fetcher = this.sharedFetcher ?? new SafeWebFetcher(this.fetcherOptions);
    const maxPages = Math.min(Math.max(request.maxPages ?? 10, 1), MAX_PAGES);
    const maxDepth = Math.min(Math.max(request.maxDepth ?? 1, 0), MAX_DEPTH);
    const scopeHosts = new Set([siteKey(new URL(startUrl).hostname)]);

    const pages: CrawlPage[] = [];
    const blockedUrls: string[] = [];
    const discovered = new Set<string>([startUrl]);
    const queued = new Set<string>([startUrl]);
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
    let sitemapsLoaded = request.source === "links";
    let retainedBytes = 0;
    let startFailure: ProviderAdapterError | undefined;

    while (pages.length < maxPages) {
      if (queue.length === 0) {
        if (sitemapsLoaded || pages.length === 0) break;
        sitemapsLoaded = true;
        for (const url of await this.sitemapUrls(fetcher, startUrl, scopeHosts, options.signal)) {
          discovered.add(url);
          if (!queued.has(url)) {
            queued.add(url);
            queue.push({ url, depth: maxDepth });
          }
        }
        continue;
      }

      const next = queue.shift()!;
      const outcome = await fetcher.fetchDocument(next.url, HTML_CONTENT_TYPES, options.signal);
      if (outcome.kind === "failed") {
        if (outcome.reason === "robots") blockedUrls.push(next.url);
        if (next.url === startUrl) startFailure = this.startFailure(outcome.reason);
        continue;
      }

      const finalUrl = normalizePersistableSourceUrl(outcome.url);
      if (next.url === startUrl) scopeHosts.add(siteKey(new URL(finalUrl).hostname));
      else if (!crawlableUrl(finalUrl, scopeHosts)) continue;
      if (pages.some((page) => page.url === finalUrl)) continue;

      const document = extractReadableDocument(outcome.body, finalUrl);
      if (!document.noindex && document.text && retainedBytes < MAX_RETAINED_CRAWL_TEXT_BYTES) {
        const markdown = truncateUtf8(
          document.text,
          Math.min(MAX_RETAINED_TEXT_BYTES_PER_PAGE, MAX_RETAINED_CRAWL_TEXT_BYTES - retainedBytes),
        );
        retainedBytes += Buffer.byteLength(markdown, "utf8");
        pages.push({
          url: finalUrl,
          ...(document.title ? { title: document.title } : {}),
          markdown,
          statusCode: outcome.status,
        });
      }

      for (const link of document.links) {
        const url = crawlableUrl(link, scopeHosts);
        if (!url) continue;
        discovered.add(url);
        if (next.depth < maxDepth && !queued.has(url)) {
          queued.add(url);
          queue.push({ url, depth: next.depth + 1 });
        }
      }
    }

    if (pages.length === 0) {
      throw startFailure
        ?? new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "empty_response", false);
    }

    const usage = fetcher.usage();
    reportProviderObservability(options, {
      usage: [
        { metric: "http_requests", unit: "requests", amount: usage.requests },
        { metric: "response_bytes", unit: "bytes", amount: usage.bytes },
      ],
    });

    return {
      provider: this.name,
      rawJobId: jobId,
      status: "completed",
      pages,
      blockedUrls: [...new Set(blockedUrls)],
      discoveredUrls: [...discovered],
    };
  }

  private normalizeStartUrl(value: string) {
    let url: URL;
    try {
      url = new URL(normalizePersistableSourceUrl(value));
    } catch {
      throw new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "client_request", false);
    }
    if (url.protocol !== "https:") {
      throw new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "client_request", false);
    }
    return url.toString();
  }

  private startFailure(reason: string) {
    if (reason === "robots") {
      // The site owner has opted out. Retrying would not change that.
      return new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "authorization", false);
    }
    if (reason === "network") {
      return new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "network", true);
    }
    return new ProviderAdapterError(this.providerId, DISPLAY_NAME, "crawl", "client_request", false);
  }

  private async sitemapUrls(
    fetcher: SafeWebFetcher,
    startUrl: string,
    scopeHosts: ReadonlySet<string>,
    signal?: AbortSignal,
  ) {
    const robots = await fetcher.robotsFor(startUrl, signal);
    const sitemapSources = robots.sitemaps.length > 0
      ? robots.sitemaps.slice(0, 3)
      : [new URL("/sitemap.xml", startUrl).toString()];
    const urls: string[] = [];

    for (const source of sitemapSources) {
      const outcome = await fetcher.fetchDocument(source, XML_CONTENT_TYPES, signal);
      if (outcome.kind === "failed") continue;
      let locations = extractSitemapLocations(outcome.body, outcome.url);
      // A sitemap index lists further sitemaps; follow only the first one.
      if (/<sitemapindex\b/iu.test(outcome.body) && locations[0]) {
        const child = await fetcher.fetchDocument(locations[0], XML_CONTENT_TYPES, signal);
        locations = child.kind === "document"
          ? extractSitemapLocations(child.body, child.url)
          : [];
      }
      for (const location of locations) {
        const url = crawlableUrl(location, scopeHosts);
        if (url) urls.push(url);
        if (urls.length >= MAX_SITEMAP_URLS) break;
      }
    }
    // Shallow paths (/about, /customers) carry more company signal than deep
    // archive pages, so they are fetched first.
    const pathDepth = (url: string) => new URL(url).pathname.split("/").filter(Boolean).length;
    return urls.slice(0, MAX_SITEMAP_URLS).sort((a, b) => pathDepth(a) - pathDepth(b));
  }
}
