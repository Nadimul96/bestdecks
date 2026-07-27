function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function resolveRequestOrigin(request: Request) {
  try {
    return stripTrailingSlash(new URL(request.url).origin);
  } catch {
    // Never derive security-sensitive destinations from Origin/Host forwarding headers.
    return "http://localhost:3000";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookie-authenticated mutations must originate from the exact application
 * origin. `same-site` is deliberately insufficient because a compromised
 * sibling subdomain can send same-site cookies.
 */
export function isTrustedMutationRequest(
  request: Request,
  trustedOrigin = resolveRequestOrigin(request),
) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  let canonicalTrustedOrigin: string;
  try {
    canonicalTrustedOrigin = new URL(trustedOrigin).origin;
  } catch {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === canonicalTrustedOrigin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}
