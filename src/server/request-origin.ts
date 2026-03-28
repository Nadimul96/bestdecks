export const INTERNAL_ORIGIN_HEADER = "x-bestdecks-origin";

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function resolveRequestOrigin(request: Request) {
  const forwardedOrigin =
    request.headers.get(INTERNAL_ORIGIN_HEADER) ?? request.headers.get("origin");

  if (forwardedOrigin) {
    return stripTrailingSlash(forwardedOrigin);
  }

  try {
    return stripTrailingSlash(new URL(request.url).origin);
  } catch {
    const protocol = request.headers.get("x-forwarded-proto");
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");

    if (protocol && host) {
      return `${protocol}://${host}`;
    }

    if (host) {
      const localHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host);
      return `${localHost ? "http" : "https"}://${host}`;
    }

    return "http://localhost:3000";
  }
}
