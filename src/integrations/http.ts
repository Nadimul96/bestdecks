import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Defaults to 120_000 (2 min). Set to 0 to disable. */
  timeoutMs?: number;
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
const execFileAsync = promisify(execFile);

interface TextResponse {
  status: number;
  text: string;
}

function isCurlFallbackEnabled() {
  return process.env.NODE_ENV !== "test" && process.env.DISABLE_CURL_HTTP_FALLBACK !== "1";
}

async function requestTextWithCurl(
  url: string,
  options: JsonRequestOptions,
  timeoutMs: number,
): Promise<TextResponse> {
  const method = options.method ?? "GET";
  const args = [
    "-sS",
    "-L",
    "-X",
    method,
    "-H",
    "Accept: application/json",
  ];

  const headers = {
    ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {}),
  };

  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }

  if (options.body !== undefined) {
    args.push("--data-binary", JSON.stringify(options.body));
  }

  if (timeoutMs > 0) {
    args.push("--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000))));
  }

  const statusMarker = "__CODE__:";
  args.push("-w", `\n${statusMarker}%{http_code}`, url);

  try {
    const { stdout } = await execFileAsync("curl", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const markerIndex = stdout.lastIndexOf(`\n${statusMarker}`);
    if (markerIndex === -1) {
      throw new Error("curl output did not include an HTTP status code.");
    }

    const text = stdout.slice(0, markerIndex);
    const status = Number(stdout.slice(markerIndex + statusMarker.length + 1).trim());

    if (!Number.isFinite(status)) {
      throw new Error("curl returned an invalid HTTP status code.");
    }

    return { status, text };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`curl fallback failed for ${method} ${url}: ${cause}`);
  }
}

export async function requestText(
  url: string,
  options: JsonRequestOptions = {},
): Promise<TextResponse> {
  // Apply timeout if no external signal is provided
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let signal = options.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (!signal && timeoutMs > 0) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });

    if (timeoutId) clearTimeout(timeoutId);
    return {
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const cause = error instanceof Error ? error.message : String(error);
    if (cause.includes("abort")) {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s calling ${options.method ?? "GET"} ${url}`);
    }

    if (!isCurlFallbackEnabled()) {
      throw new Error(`Network error calling ${options.method ?? "GET"} ${url}: ${cause}`);
    }

    console.warn(`[http] fetch failed for ${options.method ?? "GET"} ${url}. Retrying with curl fallback. Cause: ${cause}`);
    return requestTextWithCurl(url, options, timeoutMs);
  }
}

export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const { status, text } = await requestText(url, options);

  if (status < 200 || status >= 300) {
    throw new HttpError(
      `HTTP ${status} from ${options.method ?? "GET"} ${url}: ${text.slice(0, 500)}`,
      status,
      text,
    );
  }

  return JSON.parse(text) as T;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
