import assert from "node:assert/strict";
import test from "node:test";

import type { ProviderCallObservability } from "@/src/domain/provider-observability";

import { BuiltinCrawler } from "./builtin-crawler";
import { ProviderAdapterError } from "./provider-contract";
import type { CrawlRequest } from "./providers";
import { fixtureResolver, fixtureTransport, type FixtureRoute } from "./web-fixture.test-helper";

const SITE = "https://northwind.example.com";

function northwindRoutes(): Record<string, FixtureRoute> {
  return {
    [`${SITE}/robots.txt`]: { file: "northwind-robots.txt", contentType: "text/plain" },
    [`${SITE}/`]: { file: "northwind-home.html" },
    [`${SITE}/about`]: { file: "northwind-about.html" },
    [`${SITE}/customers`]: { file: "northwind-customers.html" },
    [`${SITE}/about/history`]: { file: "northwind-noindex.html" },
    [`${SITE}/sitemap.xml`]: { file: "northwind-sitemap.xml", contentType: "application/xml" },
    [`${SITE}/news/2026/new-omaha-facility`]: { file: "northwind-news-omaha.html" },
  };
}

function crawlRequest(overrides: Partial<CrawlRequest> = {}): CrawlRequest {
  return {
    websiteUrl: `${SITE}/`,
    maxPages: 10,
    maxDepth: 2,
    source: "all",
    requestedFormats: ["markdown"],
    ...overrides,
  };
}

test("built-in crawler retains in-scope readable text and respects robots.txt", async () => {
  const { transport, requests } = fixtureTransport(northwindRoutes());
  const crawler = new BuiltinCrawler({ transport, resolver: fixtureResolver() });
  const observed: ProviderCallObservability[] = [];

  const result = await crawler.crawlSite(crawlRequest(), {
    onObservability: (value) => observed.push(value),
  });

  assert.equal(result.provider, "builtin");
  assert.equal(result.status, "completed");
  assert.deepEqual(result.pages.map((page) => page.url), [
    `${SITE}/`,
    `${SITE}/about`,
    `${SITE}/customers`,
    `${SITE}/news/2026/new-omaha-facility`,
  ]);

  const home = result.pages[0]!;
  assert.equal(home.title, "Northwind Freight — Cold-chain logistics for regional grocers");
  assert.match(home.markdown!, /^# Cold-chain freight that arrives on spec$/mu);
  assert.ok(home.markdown!.includes(
    "Northwind Freight operates 48 refrigerated cross-dock facilities across the Midwest.",
  ));
  assert.match(home.markdown!, /^- Temperature telemetry on every pallet, every 5 minutes\.$/mu);
  for (const excluded of ["analytics", "color: #123", "Hidden draft", "Enable JavaScript", "All rights reserved", "Book a demo"]) {
    assert.equal(home.markdown!.includes(excluded), false, excluded);
  }
  assert.ok(result.pages[1]!.markdown!.includes("more than 1,200 people & runs a fleet"));

  // BestdecksBot has its own robots group, so the generic Allow does not apply.
  assert.deepEqual(result.blockedUrls, [`${SITE}/internal/roadmap`]);
  assert.equal(requests.some((request) => request.url.includes("/internal/")), false);
  // noindex pages are not retained, and nofollow links are not followed.
  assert.equal(result.pages.some((page) => page.url.endsWith("/about/history")), false);
  assert.equal(requests.some((request) => request.url.includes("secret-from-noindex")), false);
  // Off-site, subdomain, query-string, non-HTML, and mailto links are never fetched.
  for (const outOfScope of ["twitter.example.net", "careers.northwind", "?ref=", "brochure.pdf", "mailto:", "other-site"]) {
    assert.equal(requests.some((request) => request.url.includes(outOfScope)), false, outOfScope);
  }
  assert.ok(requests.every((request) => request.address === "93.184.215.14"));
  assert.ok(requests.every((request) => request.userAgent?.includes("BestdecksBot")));
  assert.equal(requests.filter((request) => request.url.endsWith("/robots.txt")).length, 1);

  assert.deepEqual(observed.at(-1)?.usage?.map((metric) => metric.metric), [
    "http_requests",
    "response_bytes",
  ]);
});

test("built-in crawler keeps identical page text only once", async () => {
  const { transport } = fixtureTransport({
    ...northwindRoutes(),
    [`${SITE}/about`]: { file: "northwind-home.html" },
  });
  const result = await new BuiltinCrawler({ transport, resolver: fixtureResolver() })
    .crawlSite(crawlRequest({ source: "links", maxDepth: 1 }));
  assert.equal(result.pages.some((page) => page.url === `${SITE}/about`), false);
  assert.ok(result.pages.some((page) => page.url === `${SITE}/customers`));
});

test("built-in crawler honors page and depth limits and link-only mode", async () => {
  const { transport, requests } = fixtureTransport(northwindRoutes());
  const crawler = new BuiltinCrawler({ transport, resolver: fixtureResolver() });

  const result = await crawler.crawlSite(crawlRequest({ maxPages: 2, source: "links" }));
  assert.equal(result.pages.length, 2);
  assert.equal(requests.some((request) => request.url.endsWith("sitemap.xml")), false);

  const shallow = await new BuiltinCrawler({
    transport: fixtureTransport(northwindRoutes()).transport,
    resolver: fixtureResolver(),
  }).crawlSite(crawlRequest({ maxDepth: 0, source: "links" }));
  assert.deepEqual(shallow.pages.map((page) => page.url), [`${SITE}/`]);
  assert.ok(shallow.discoveredUrls.includes(`${SITE}/about`));
});

test("built-in crawler re-validates every redirect hop and widens scope to the final host", async () => {
  const routes = northwindRoutes();
  const { transport } = fixtureTransport({
    "https://www.northwind.example.com/robots.txt": { status: 404 },
    "https://www.northwind.example.com/": { status: 301, location: `${SITE}/` },
    ...routes,
  });
  const crawler = new BuiltinCrawler({ transport, resolver: fixtureResolver() });
  const result = await crawler.crawlSite(crawlRequest({
    websiteUrl: "https://www.northwind.example.com/",
    maxPages: 2,
  }));
  assert.equal(result.pages[0]!.url, `${SITE}/`);

  const rebinding = fixtureTransport({
    [`${SITE}/robots.txt`]: { status: 404 },
    [`${SITE}/`]: { status: 302, location: "https://metadata.attacker.example/latest" },
  });
  const blocked = new BuiltinCrawler({
    transport: rebinding.transport,
    resolver: fixtureResolver({ "metadata.attacker.example": ["169.254.169.254"] }),
  });
  await assert.rejects(blocked.crawlSite(crawlRequest()), (error: unknown) =>
    error instanceof ProviderAdapterError && error.code === "client_request" && !error.retryable
  );
  assert.equal(rebinding.requests.some((request) => request.url.includes("attacker")), false);

  const downgrade = fixtureTransport({
    [`${SITE}/robots.txt`]: { status: 404 },
    [`${SITE}/`]: { status: 301, location: "http://northwind.example.com/" },
  });
  await assert.rejects(
    new BuiltinCrawler({ transport: downgrade.transport, resolver: fixtureResolver() })
      .crawlSite(crawlRequest()),
    ProviderAdapterError,
  );
});

test("built-in crawler treats unreachable robots.txt as a full disallow and 4xx as allow-all", async () => {
  const unavailable = fixtureTransport({
    ...northwindRoutes(),
    [`${SITE}/robots.txt`]: { status: 503 },
  });
  await assert.rejects(
    new BuiltinCrawler({ transport: unavailable.transport, resolver: fixtureResolver() })
      .crawlSite(crawlRequest()),
    (error: unknown) =>
      error instanceof ProviderAdapterError && error.code === "authorization" && !error.retryable,
  );
  assert.deepEqual(unavailable.requests.map((request) => request.url), [`${SITE}/robots.txt`]);

  const missing = fixtureTransport({ ...northwindRoutes(), [`${SITE}/robots.txt`]: { status: 404 } });
  const result = await new BuiltinCrawler({ transport: missing.transport, resolver: fixtureResolver() })
    .crawlSite(crawlRequest({ maxPages: 25 }));
  assert.ok(result.pages.some((page) => page.url.endsWith("/news/2026/new-omaha-facility")));
  assert.deepEqual(result.blockedUrls, []);
});

test("built-in crawler rejects plaintext or private targets before any request", async () => {
  const { transport, requests } = fixtureTransport(northwindRoutes());
  const crawler = new BuiltinCrawler({ transport, resolver: fixtureResolver({ "intranet.example.com": ["10.0.0.7"] }) });

  await assert.rejects(crawler.startCrawl(crawlRequest({ websiteUrl: "http://northwind.example.com/" })), ProviderAdapterError);
  await assert.rejects(crawler.crawlSite(crawlRequest({ websiteUrl: "https://intranet.example.com/" })), ProviderAdapterError);
  assert.equal(requests.length, 0);
});

test("built-in crawler job IDs are deterministic and bound to their target", async () => {
  const { transport } = fixtureTransport(northwindRoutes());
  const crawler = new BuiltinCrawler({ transport, resolver: fixtureResolver() });
  const first = await crawler.startCrawl(crawlRequest({ websiteUrl: `${SITE}/?utm_source=x#top` }));
  assert.equal(first, await crawler.startCrawl(crawlRequest()));
  assert.match(first, /^builtin:[a-f0-9]{32}$/u);
  await assert.rejects(crawler.resumeCrawl("builtin:other", crawlRequest()), ProviderAdapterError);
});

test("built-in crawler extracts a recorded real-world page", async () => {
  // apache-org-home.html and apache-org-robots.txt were recorded from
  // https://www.apache.org/ (content licensed under Apache-2.0).
  const { transport, requests } = fixtureTransport({
    "https://www.apache.org/robots.txt": { file: "apache-org-robots.txt", contentType: "text/plain" },
    "https://www.apache.org/": { file: "apache-org-home.html" },
  });
  const result = await new BuiltinCrawler({ transport, resolver: fixtureResolver() })
    .crawlSite(crawlRequest({ websiteUrl: "https://www.apache.org/", maxPages: 1 }));

  const page = result.pages[0]!;
  assert.equal(page.title, "Welcome to The Apache Software Foundation | Apache Software Foundation");
  assert.match(page.markdown!, /^# Software For The Public Good$/mu);
  assert.ok(page.markdown!.includes("provides software for the public good, guided by community over code."));
  assert.equal(page.markdown!.includes("<"), false);
  assert.ok(result.discoveredUrls.length > 10);
  assert.equal(requests.length, 2);
});
