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

export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  // Apply timeout if no external signal is provided
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let signal = options.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (!signal && timeoutMs > 0) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const cause = error instanceof Error ? error.message : String(error);
    if (cause.includes("abort")) {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s calling ${options.method ?? "GET"} ${url}`);
    }
    throw new Error(`Network error calling ${options.method ?? "GET"} ${url}: ${cause}`);
  }

  if (timeoutId) clearTimeout(timeoutId);

  const text = await response.text();

  if (!response.ok) {
    throw new HttpError(
      `HTTP ${response.status} from ${options.method ?? "GET"} ${url}: ${text.slice(0, 500)}`,
      response.status,
      text,
    );
  }

  return JSON.parse(text) as T;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
