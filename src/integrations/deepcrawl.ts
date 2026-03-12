import { requestJson } from "./http";
import type {
  CrawlPage,
  CrawlProvider,
  CrawlRequest,
  CrawlResult,
} from "./providers";

interface DeepcrawlReadResponse {
  url?: string;
  title?: string;
  markdown?: string;
  html?: string;
  content?: string;
}

interface DeepcrawlLinksResponse {
  links?: Array<string | { url?: string }>;
}

export interface DeepcrawlCrawlerOptions {
  apiKey: string;
  baseUrl?: string;
}

function normalizeLinks(payload: DeepcrawlLinksResponse | string[] | undefined) {
  if (!payload) {
    return [];
  }

  const links = Array.isArray(payload) ? payload : payload.links ?? [];

  return links
    .map((item) => (typeof item === "string" ? item : item.url))
    .filter((value): value is string => Boolean(value));
}

export class DeepcrawlCrawler implements CrawlProvider {
  public readonly name = "deepcrawl" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  public constructor(options: DeepcrawlCrawlerOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.deepcrawl.dev").replace(/\/$/, "");
  }

  public async crawlSite(request: CrawlRequest): Promise<CrawlResult> {
    const discoveredUrls = await this.extractLinks(request);
    const targetUrls = [request.websiteUrl, ...discoveredUrls]
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, request.maxPages ?? 20);

    const pages: CrawlPage[] = [];

    for (const url of targetUrls) {
      try {
        const page = await this.readPage(url, request.requestedFormats);
        pages.push(page);
      } catch {
        // Keep processing other pages. Deepcrawl is a fallback layer and partial results are better than none.
      }
    }

    if (pages.length === 0) {
      throw new Error("Deepcrawl fallback returned no readable pages.");
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
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async extractLinks(request: CrawlRequest) {
    const response = await requestJson<DeepcrawlLinksResponse | string[]>(
      `${this.baseUrl}/links?url=${encodeURIComponent(request.websiteUrl)}`,
      {
        headers: this.headers,
      },
    );

    return normalizeLinks(response).slice(0, Math.max((request.maxPages ?? 20) - 1, 0));
  }

  private async readPage(
    url: string,
    requestedFormats: CrawlRequest["requestedFormats"],
  ): Promise<CrawlPage> {
    const response = await requestJson<DeepcrawlReadResponse>(
      `${this.baseUrl}/read?url=${encodeURIComponent(url)}`,
      {
        headers: this.headers,
      },
    );

    return {
      url: response.url ?? url,
      title: response.title,
      markdown: requestedFormats.includes("markdown")
        ? response.markdown ?? response.content
        : undefined,
      html: requestedFormats.includes("html") ? response.html : undefined,
    };
  }
}
