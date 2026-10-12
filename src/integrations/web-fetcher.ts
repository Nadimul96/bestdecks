import { requestBytes, ResponseSizeLimitError } from "./http";
import {
  ALLOW_ALL_ROBOTS,
  DISALLOW_ALL_ROBOTS,
  parseRobotsTxt,
  type RobotsPolicy,
} from "./robots-txt";
import {
  resolveSafeOutboundTarget,
  type OutboundUrlPolicy,
  type ResolvedOutboundTarget,
} from "./url-policy";

/**
 * Polite, SSRF-safe HTTPS fetching for the built-in crawler and first-party
 * research. Every hop (including redirects and robots.txt) is re-validated by
 * the repository's outbound URL policy and the connection is pinned to the
 * validated address, so DNS rebinding cannot redirect a request inward.
 */

export const BESTDECKS_ROBOTS_AGENT = "BestdecksBot";
export const BESTDECKS_USER_AGENT =
  `Mozilla/5.0 (compatible; ${BESTDECKS_ROBOTS_AGENT}/0.1; +https://github.com/Nadimul96/bestdecks)`;

export const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;
export const XML_CONTENT_TYPES = [
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
] as const;

export interface WebTransportResponse {
  status: number;
  body: Buffer;
  contentType?: string;
  location?: string;
}

export type WebTransport = (
  url: string,
  target: ResolvedOutboundTarget,
  init: {
    headers: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs: number;
    maxResponseBytes: number;
  },
) => Promise<WebTransportResponse>;

export type WebFetchFailure =
  | "policy"
  | "robots"
  | "http_status"
  | "unsupported_type"
  | "too_large"
  | "redirect_limit"
  | "network";

export type WebFetchOutcome =
  | {
      kind: "document";
      requestedUrl: string;
      url: string;
      status: number;
      contentType: string;
      body: string;
    }
  | {
      kind: "failed";
      requestedUrl: string;
      url: string;
      reason: WebFetchFailure;
      status?: number;
    };

export interface SafeWebFetcherOptions {
  transport?: WebTransport;
  resolver?: OutboundUrlPolicy["resolver"];
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const ROBOTS_MAX_BYTES = 512 * 1024;

const defaultTransport: WebTransport = (url, target, init) =>
  requestBytes(url, {
    method: "GET",
    headers: init.headers,
    signal: init.signal,
    timeoutMs: init.timeoutMs,
    maxResponseBytes: init.maxResponseBytes,
    pinnedAddress: target.address,
    pinnedFamily: target.family,
  });

function mimeType(contentType: string | undefined) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function decodeBody(body: Buffer, contentType: string | undefined) {
  const charset = contentType?.match(/charset\s*=\s*"?([\w-]+)"?/iu)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export class SafeWebFetcher {
  private readonly transport: WebTransport;
  private readonly resolver: OutboundUrlPolicy["resolver"];
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxRedirects: number;
  private readonly robotsByOrigin = new Map<string, Promise<RobotsPolicy>>();
  private requests = 0;
  private bytes = 0;

  public constructor(options: SafeWebFetcherOptions = {}) {
    this.transport = options.transport ?? defaultTransport;
    this.resolver = options.resolver;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  }

  /** Requests and response bytes since construction, for receipts. */
  public usage() {
    return { requests: this.requests, bytes: this.bytes };
  }

  public async robotsFor(url: string, signal?: AbortSignal): Promise<RobotsPolicy> {
    const origin = new URL(url).origin;
    let policy = this.robotsByOrigin.get(origin);
    if (!policy) {
      policy = this.loadRobots(origin, signal);
      this.robotsByOrigin.set(origin, policy);
    }
    return policy;
  }

  /**
   * Fetch one document. Robots.txt is consulted for the first URL and every
   * redirect target; only the listed content types are accepted.
   */
  public async fetchDocument(
    url: string,
    acceptedTypes: readonly string[],
    signal?: AbortSignal,
  ): Promise<WebFetchOutcome> {
    return this.fetchFollowingRedirects(url, acceptedTypes, signal, true);
  }

  private async loadRobots(origin: string, signal?: AbortSignal): Promise<RobotsPolicy> {
    const outcome = await this.fetchFollowingRedirects(
      `${origin}/robots.txt`,
      ["text/plain", ""],
      signal,
      false,
      ROBOTS_MAX_BYTES,
    );
    if (outcome.kind === "document") {
      return parseRobotsTxt(outcome.body, BESTDECKS_ROBOTS_AGENT);
    }
    if (outcome.reason === "http_status" && outcome.status !== undefined) {
      if (outcome.status >= 400 && outcome.status < 500) return ALLOW_ALL_ROBOTS;
    }
    if (outcome.reason === "unsupported_type") return ALLOW_ALL_ROBOTS;
    return DISALLOW_ALL_ROBOTS;
  }

  private async fetchFollowingRedirects(
    requestedUrl: string,
    acceptedTypes: readonly string[],
    signal: AbortSignal | undefined,
    respectRobots: boolean,
    maxResponseBytes = this.maxResponseBytes,
  ): Promise<WebFetchOutcome> {
    let current = requestedUrl;
    const failed = (reason: WebFetchFailure, status?: number): WebFetchOutcome => ({
      kind: "failed",
      requestedUrl,
      url: current,
      reason,
      ...(status === undefined ? {} : { status }),
    });

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      let target: ResolvedOutboundTarget;
      try {
        target = await resolveSafeOutboundTarget(current, {
          allowPrivateNetwork: false,
          allowPublicHttp: false,
          resolver: this.resolver,
        });
      } catch {
        return failed("policy");
      }

      if (respectRobots && !(await this.robotsFor(current, signal)).isAllowed(current)) {
        return failed("robots");
      }

      let response: WebTransportResponse;
      try {
        this.requests += 1;
        response = await this.transport(current, target, {
          headers: {
            Accept: acceptedTypes.filter(Boolean).join(", ") || "*/*",
            "Accept-Language": "en;q=1.0, *;q=0.5",
            "User-Agent": BESTDECKS_USER_AGENT,
          },
          signal,
          timeoutMs: this.requestTimeoutMs,
          maxResponseBytes,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        return failed(error instanceof ResponseSizeLimitError ? "too_large" : "network");
      }
      this.bytes += response.body.byteLength;

      if (response.status >= 300 && response.status < 400 && response.location) {
        try {
          const next = new URL(response.location, current);
          next.hash = "";
          current = next.toString();
        } catch {
          return failed("policy");
        }
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        return failed("http_status", response.status);
      }

      const type = mimeType(response.contentType);
      if (!acceptedTypes.includes(type)) return failed("unsupported_type", response.status);

      return {
        kind: "document",
        requestedUrl,
        url: current,
        status: response.status,
        contentType: type,
        body: decodeBody(response.body, response.contentType),
      };
    }
    return failed("redirect_limit");
  }
}
