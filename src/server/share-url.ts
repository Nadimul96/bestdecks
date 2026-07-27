import {
  isLoopbackOrLocalhost,
  parseCanonicalOrigin,
} from "@/src/config/canonical-origin";
import { loadEnv } from "@/src/config/env";
import { resolveRequestOrigin } from "@/src/server/request-origin";

export function resolvePublicShareOrigin(request: Request) {
  const env = loadEnv();

  if (env.NODE_ENV !== "development") {
    const configuredOrigin =
      env.NEXT_PUBLIC_BETTER_AUTH_URL ??
      env.BETTER_AUTH_URL ??
      env.RENDER_EXTERNAL_URL;

    if (configuredOrigin) {
      return parseCanonicalOrigin(
        configuredOrigin,
        env.NODE_ENV,
        "Public share origin",
      );
    }
  }

  if (env.NODE_ENV === "production") {
    throw new Error("A canonical public share origin is required in production.");
  }

  const requestOrigin = parseCanonicalOrigin(
    resolveRequestOrigin(request),
    env.NODE_ENV,
    "Public share origin",
  );
  const url = new URL(requestOrigin);
  if (!isLoopbackOrLocalhost(url.hostname)) {
    url.hostname = url.hostname.replace(/^console\./u, "");
  }

  return parseCanonicalOrigin(url.origin, env.NODE_ENV, "Public share origin");
}

export function buildPublicShareUrl(request: Request, slug: string) {
  return `${resolvePublicShareOrigin(request)}/share/${slug}`;
}
