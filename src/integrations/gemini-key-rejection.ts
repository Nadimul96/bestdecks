import type { HttpError } from "./http";

/**
 * Gemini rejects a malformed or revoked API key with HTTP 400 INVALID_ARGUMENT,
 * not 401, and names the cause in a google.rpc.ErrorInfo reason such as
 * `API_KEY_INVALID`. Treating that as a generic client error hides the one
 * thing the operator has to fix, so callers map it to `authentication`.
 */
export function isGeminiApiKeyRejection(error: Pick<HttpError, "status" | "errorReasons">) {
  return error.status === 400
    && error.errorReasons.some((reason) => reason.startsWith("API_KEY_"));
}
