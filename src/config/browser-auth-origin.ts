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
