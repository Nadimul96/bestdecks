import {
  isLoopbackOrLocalhost,
  parseCanonicalOrigin,
  type RuntimeEnvironment,
} from "@/src/config/canonical-origin";

interface BrowserAuthOriginInput {
  environment: RuntimeEnvironment;
  configuredOrigin?: string;
  currentOrigin?: string;
}

function isPlainHttpLoopback(origin: string | undefined) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && isLoopbackOrLocalhost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the browser-visible auth origin. An undefined production SSR result
 * deliberately selects Better Auth's same-origin `/api/auth` fallback.
 */
export function resolveBrowserAuthOrigin(
  input: BrowserAuthOriginInput,
): string | undefined {
  const configuredOrigin = input.configuredOrigin
    ? parseCanonicalOrigin(
        input.configuredOrigin,
        input.environment,
        "NEXT_PUBLIC_BETTER_AUTH_URL",
      )
    : undefined;
  if (input.environment === "production" && isPlainHttpLoopback(input.currentOrigin)) {
    // A loopback-only production install (docker compose) talks to its own
    // origin; the relative /api/auth fallback is same-origin by construction.
    return configuredOrigin;
  }
  const currentOrigin = input.currentOrigin
    ? parseCanonicalOrigin(input.currentOrigin, input.environment, "Browser origin")
    : undefined;

  if (currentOrigin) {
    const currentHostname = new URL(currentOrigin).hostname;
    if (
      input.environment !== "production"
      && isLoopbackOrLocalhost(currentHostname)
    ) {
      return currentOrigin;
    }
    return configuredOrigin ?? currentOrigin;
  }

  if (configuredOrigin) return configuredOrigin;
  if (input.environment === "production") return undefined;
  return "http://localhost:3000";
}
