import { loadEnv } from "@/src/config/env";
import { resolveRequestOrigin } from "@/src/server/request-origin";

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolvePublicShareOrigin(request: Request) {
  const env = loadEnv();

  if (env.NODE_ENV !== "development") {
    const configuredOrigin =
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
      env.BETTER_AUTH_URL ??
      env.RENDER_EXTERNAL_URL;

    if (configuredOrigin) {
      return stripTrailingSlash(configuredOrigin);
    }
  }

  const requestOrigin = resolveRequestOrigin(request);

  try {
    const url = new URL(requestOrigin);
    if (!isLocalHost(url.hostname)) {
      url.hostname = url.hostname.replace(/^console\./, "");
    }

    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(requestOrigin);
  }
}

export function buildPublicShareUrl(request: Request, slug: string) {
  return `${resolvePublicShareOrigin(request)}/share/${slug}`;
}
