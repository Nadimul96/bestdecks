export type RuntimeEnvironment = "development" | "test" | "production";

export class CanonicalOriginError extends Error {
  public constructor(label = "Application origin") {
    super(
      `${label} must be an absolute HTTPS origin with no credentials, query, fragment, or non-root path. `
      + "Plain HTTP is allowed only for localhost or loopback addresses, and in production only "
      + "with ALLOW_LOOPBACK_HTTP_ORIGIN=1.",
    );
    this.name = "CanonicalOriginError";
  }
}

export function isLoopbackOrLocalhost(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized === "::1") return true;

  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255);
}

/**
 * Parse a browser-visible application origin. Returning `URL#origin` gives
 * every caller one normalized representation and avoids path-join surprises.
 */
export interface CanonicalOriginOptions {
  /**
   * Accept http://localhost (or a loopback IP) in production. Only for a
   * single-machine install whose port is published on loopback, such as the
   * root docker-compose.yml; a public deployment must terminate TLS.
   */
  allowLoopbackHttp?: boolean;
}

export function parseCanonicalOrigin(
  value: string,
  environment: RuntimeEnvironment,
  label = "Application origin",
  options: CanonicalOriginOptions = {},
): string {
  const fail = (): never => {
    throw new CanonicalOriginError(label);
  };

  if (!value || value !== value.trim()) fail();
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) fail();

  const authorityAndSuffix = value.slice(value.indexOf("://") + 3);
  const suffixOffset = authorityAndSuffix.search(/[/?#]/u);
  const authority = suffixOffset === -1
    ? authorityAndSuffix
    : authorityAndSuffix.slice(0, suffixOffset);
  const suffix = suffixOffset === -1 ? "" : authorityAndSuffix.slice(suffixOffset);
  if (!authority || authority.includes("@") || (suffix !== "" && suffix !== "/")) {
    fail();
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail();
  }

  if (
    url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || url.hostname.endsWith(".")
  ) {
    fail();
  }

  if (url.protocol === "https:") return url.origin;
  if (
    url.protocol === "http:"
    && (environment !== "production" || options.allowLoopbackHttp === true)
    && isLoopbackOrLocalhost(url.hostname)
  ) {
    return url.origin;
  }

  return fail();
}
