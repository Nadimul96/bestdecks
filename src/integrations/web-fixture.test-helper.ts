import { readFileSync } from "node:fs";

import type { WebTransport } from "./web-fetcher";

export interface FixtureRoute {
  status?: number;
  contentType?: string;
  /** File under src/integrations/fixtures/web/. */
  file?: string;
  body?: string;
  location?: string;
}

export function readWebFixture(name: string) {
  return readFileSync(new URL(`./fixtures/web/${name}`, import.meta.url), "utf8");
}

/**
 * An offline transport that serves recorded fixtures by exact URL. Unknown
 * URLs return 404, like a real origin. Every request is logged so tests can
 * assert on robots.txt checks, pinning, and redirect re-validation.
 */
export function fixtureTransport(routes: Record<string, FixtureRoute>) {
  const requests: Array<{ url: string; address: string; userAgent?: string }> = [];
  const transport: WebTransport = async (url, target, init) => {
    requests.push({ url, address: target.address, userAgent: init.headers["User-Agent"] });
    const route = routes[url];
    if (!route) {
      return { status: 404, body: Buffer.from("Not found"), contentType: "text/html" };
    }
    const body = route.file ? readWebFixture(route.file) : route.body ?? "";
    return {
      status: route.status ?? 200,
      body: Buffer.from(body, "utf8"),
      contentType: route.contentType ?? "text/html; charset=utf-8",
      ...(route.location ? { location: route.location } : {}),
    };
  };
  return { transport, requests };
}

/** Resolves every hostname to one public address unless overridden. */
export function fixtureResolver(overrides: Record<string, string[]> = {}) {
  return async (hostname: string) => overrides[hostname] ?? ["93.184.215.14"];
}
