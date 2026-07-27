import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Defaults to 120_000 (2 min). Set to 0 to disable. */
  timeoutMs?: number;
  /** A previously policy-validated address. Pins the connection to prevent DNS rebinding. */
  pinnedAddress?: string;
  pinnedFamily?: 4 | 6;
  maxResponseBytes?: number;
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly bodyText: string;

  public constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

interface TextResponse {
  status: number;
  text: string;
  metadata: ProviderResponseMetadata;
}

export interface ProviderResponseMetadata {
  /** Cloudflare Browser Run's documented billable browser time signal. */
  browserMilliseconds?: number;
}

export interface JsonResponseWithMetadata<T> {
  data: T;
  metadata: ProviderResponseMetadata;
}

export interface BinaryResponse {
  status: number;
  body: Buffer;
  contentType?: string;
  metadata?: ProviderResponseMetadata;
}

const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const INITIAL_STREAM_BUFFER_BYTES = 64 * 1024;

export class ResponseSizeLimitError extends Error {
  public constructor(maxResponseBytes: number) {
    super(`Provider response exceeded ${maxResponseBytes} bytes.`);
    this.name = "ResponseSizeLimitError";
  }
}

export class ResponseLengthMismatchError extends Error {
  public constructor() {
    super("Provider response did not match its declared Content-Length.");
    this.name = "ResponseLengthMismatchError";
  }
}

function parseBrowserMilliseconds(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function responseMetadata(
  header: (name: string) => string | string[] | undefined,
): ProviderResponseMetadata {
  const browserMilliseconds = parseBrowserMilliseconds(header("x-browser-ms-used"));
  return browserMilliseconds === undefined ? {} : { browserMilliseconds };
}

async function readFetchResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  // Fetch exposes the decoded body for content-encoded responses while the
  // header describes the encoded wire bytes, so only compare like-for-like.
  const contentLengthHeader = response.headers.has("content-encoding")
    ? null
    : response.headers.get("content-length");
  let contentLength: number | undefined;
  if (
    contentLengthHeader !== null
    && /^(?:0|[1-9][0-9]*)$/.test(contentLengthHeader)
  ) {
    const parsedContentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(parsedContentLength) || parsedContentLength > maxResponseBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // The size limit remains authoritative even if the transport cannot cancel.
      }
      throw new ResponseSizeLimitError(maxResponseBytes);
    }
    contentLength = parsedContentLength;
  }

  if (!response.body) {
    if (contentLength !== undefined && contentLength !== 0) {
      throw new ResponseLengthMismatchError();
    }
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      const nextTotalBytes = totalBytes + chunk.value.byteLength;
      if (nextTotalBytes > maxResponseBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size limit remains authoritative even if the transport cannot cancel.
        }
        throw new ResponseSizeLimitError(maxResponseBytes);
      }
      if (contentLength !== undefined && nextTotalBytes > contentLength) {
        try {
          await reader.cancel();
        } catch {
          // The framing mismatch remains authoritative if cancellation fails.
        }
        throw new ResponseLengthMismatchError();
      }

      totalBytes = nextTotalBytes;
      text += decoder.decode(chunk.value, { stream: true });
    }

    if (contentLength !== undefined && totalBytes !== contentLength) {
      throw new ResponseLengthMismatchError();
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function requestBytesAtPinnedAddress(
  url: string,
  options: JsonRequestOptions,
  signal: AbortSignal | undefined,
): Promise<BinaryResponse> {
  if (!options.pinnedAddress || !options.pinnedFamily) {
    throw new Error("Pinned provider request requires an address and IP family.");
  }

  const parsed = new URL(url);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = {
    Accept: "application/json",
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {}),
  };
  const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      callback(null, [{ address: options.pinnedAddress!, family: options.pinnedFamily! }]);
    } else {
      callback(null, options.pinnedAddress!, options.pinnedFamily!);
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let declaredResponseEnded = false;
    const resolveOnce = (value: BinaryResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const requestOptions = {
      method: options.method ?? "GET",
      headers,
      signal,
      lookup: pinnedLookup,
    };
    const handleResponse = (response: import("node:http").IncomingMessage) => {
      let totalBytes = 0;
      const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024) {
        response.destroy();
        rejectOnce(new RangeError("Provider response byte limit is invalid."));
        return;
      }
      const contentLengthHeader = response.headers["content-length"];
      let contentLength: number | undefined;
      if (
        typeof contentLengthHeader === "string"
        && /^(?:0|[1-9][0-9]*)$/.test(contentLengthHeader)
      ) {
        const parsedContentLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(parsedContentLength) || parsedContentLength > maxBytes) {
          response.destroy();
          rejectOnce(new ResponseSizeLimitError(maxBytes));
          return;
        }
        contentLength = parsedContentLength;
      }

      // Honor an exact, bounded Content-Length. For streaming/chunked responses,
      // start small and grow geometrically so the configured upper bound is not
      // eagerly allocated for every request.
      let storage = Buffer.allocUnsafe(
        contentLength ?? Math.min(INITIAL_STREAM_BUFFER_BYTES, maxBytes),
      );

      const ensureCapacity = (requiredBytes: number) => {
        if (requiredBytes > maxBytes) return false;
        if (requiredBytes <= storage.length) return true;
        let nextCapacity = Math.max(1, storage.length);
        while (nextCapacity < requiredBytes) {
          nextCapacity = Math.min(maxBytes, nextCapacity * 2);
          if (nextCapacity === maxBytes) break;
        }
        if (nextCapacity < requiredBytes) return false;
        const grown = Buffer.allocUnsafe(nextCapacity);
        storage.copy(grown, 0, 0, totalBytes);
        storage = grown;
        return true;
      };

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (contentLength !== undefined && totalBytes + buffer.length > contentLength) {
          rejectOnce(new ResponseLengthMismatchError());
          response.destroy();
          return;
        }
        if (!ensureCapacity(totalBytes + buffer.length)) {
          rejectOnce(new ResponseSizeLimitError(maxBytes));
          response.destroy();
          return;
        }
        buffer.copy(storage, totalBytes);
        totalBytes += buffer.length;
      });
      response.on("end", () => {
        if (contentLength !== undefined && totalBytes !== contentLength) {
          rejectOnce(new ResponseLengthMismatchError());
          return;
        }
        const result = {
          status: response.statusCode ?? 0,
          body: storage.subarray(0, totalBytes),
          contentType: Array.isArray(response.headers["content-type"])
            ? response.headers["content-type"][0]
            : response.headers["content-type"],
          metadata: responseMetadata((name) => response.headers[name]),
        };
        if (contentLength === undefined) {
          resolveOnce(result);
          return;
        }

        // Give Node's parser one turn to report bytes beyond Content-Length as
        // invalid framing before accepting the declared-length response.
        declaredResponseEnded = true;
        setImmediate(() => resolveOnce(result));
      });
      response.on("aborted", () => {
        rejectOnce(
          contentLength !== undefined && totalBytes !== contentLength
            ? new ResponseLengthMismatchError()
            : new Error("Provider response was aborted."),
        );
      });
      response.on("error", (error) => {
        rejectOnce(
          contentLength !== undefined && totalBytes !== contentLength
            ? new ResponseLengthMismatchError()
            : error,
        );
      });
    };

    const request = parsed.protocol === "https:"
      ? httpsRequest(parsed, requestOptions, handleResponse)
      : httpRequest(parsed, requestOptions, handleResponse);
    request.on("error", (error) => {
      rejectOnce(declaredResponseEnded ? new ResponseLengthMismatchError() : error);
    });
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function safeUrlForError(url: string) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "configured provider endpoint";
  }
}

export async function requestText(
  url: string,
  options: JsonRequestOptions = {},
): Promise<TextResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signals = [options.signal, timeoutSignal].filter(
    (value): value is AbortSignal => Boolean(value),
  );
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const safeUrl = safeUrlForError(url);

  try {
    if (options.pinnedAddress || options.pinnedFamily) {
      const response = await requestBytesAtPinnedAddress(url, options, signal);
      return {
        status: response.status,
        text: response.body.toString("utf8"),
        metadata: response.metadata ?? {},
      };
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
      redirect: "manual",
    });

    return {
      status: response.status,
      text: await readFetchResponseText(
        response,
        options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      ),
      metadata: responseMetadata((name) => response.headers.get(name) ?? undefined),
    };
  } catch (error) {
    if (error instanceof ResponseSizeLimitError || error instanceof ResponseLengthMismatchError) {
      throw error;
    }
    if (timeoutSignal?.aborted) {
      throw new Error(
        `Request timed out after ${timeoutMs / 1000}s calling ${options.method ?? "GET"} ${safeUrl}`,
      );
    }
    if (options.signal?.aborted) {
      throw new Error(`Request aborted calling ${options.method ?? "GET"} ${safeUrl}`);
    }
    throw new Error(`Network error calling ${options.method ?? "GET"} ${safeUrl}.`);
  }
}

/**
 * Download a bounded binary artifact through a previously policy-validated,
 * DNS-pinned destination. Requiring the pin keeps artifact verification from
 * becoming a second, weaker SSRF path.
 */
export async function requestBytes(
  url: string,
  options: JsonRequestOptions,
): Promise<BinaryResponse> {
  if (!options.pinnedAddress || !options.pinnedFamily) {
    throw new Error("Pinned artifact request requires an address and IP family.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signals = [options.signal, timeoutSignal].filter(
    (value): value is AbortSignal => Boolean(value),
  );
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const safeUrl = safeUrlForError(url);

  try {
    return await requestBytesAtPinnedAddress(url, { ...options, method: "GET" }, signal);
  } catch (error) {
    if (error instanceof ResponseSizeLimitError || error instanceof ResponseLengthMismatchError) {
      throw error;
    }
    if (timeoutSignal?.aborted) {
      throw new Error(`Artifact request timed out after ${timeoutMs / 1000}s for ${safeUrl}`);
    }
    if (options.signal?.aborted) {
      throw new Error(`Artifact request was aborted for ${safeUrl}`);
    }
    throw new Error(`Artifact network error for ${safeUrl}.`);
  }
}

export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  return (await requestJsonWithMetadata<T>(url, options)).data;
}

/**
 * Parse JSON while retaining only explicitly normalized, non-secret response
 * metadata. Arbitrary provider headers are never exposed to callers.
 */
export async function requestJsonWithMetadata<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<JsonResponseWithMetadata<T>> {
  const { status, text, metadata } = await requestText(url, options);

  if (status < 200 || status >= 300) {
    throw new HttpError(
      `HTTP ${status} from ${options.method ?? "GET"} ${safeUrlForError(url)}`,
      status,
      "",
    );
  }

  try {
    return { data: JSON.parse(text) as T, metadata };
  } catch {
    throw new Error(
      `Provider returned malformed JSON from ${options.method ?? "GET"} ${safeUrlForError(url)}`,
    );
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new Error("Operation was aborted."),
    );
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Operation was aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
