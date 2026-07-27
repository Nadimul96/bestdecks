export const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  public constructor() {
    super("Request body exceeds the configured size limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  if (!request.body) throw new SyntaxError("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    // Give every route one stable parse-error class for malformed JSON bytes.
    throw new SyntaxError("Request body is not valid UTF-8 JSON.");
  }
  return JSON.parse(decoded);
}
