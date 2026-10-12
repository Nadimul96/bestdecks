// HTTPS fixture origin for the Compose end-to-end job.
//
// Serves the recorded Northwind pages the unit tests use, at the same URLs, so
// the worker's real built-in crawler and first-party research run against a
// known site without touching the public Internet. Unknown paths return 404,
// like a real origin. The TLS certificate is issued by a throwaway CA that the
// CI job generates and only the e2e worker trusts (NODE_EXTRA_CA_CERTS).
import { readFileSync } from "node:fs";
import { createServer } from "node:https";

const FIXTURES = process.env.FIXTURE_DIR ?? "/fixtures";
const TLS = process.env.FIXTURE_TLS_DIR ?? "/e2e-tls";

const HTML = "text/html; charset=utf-8";
const ROUTES = {
  "/robots.txt": ["northwind-robots.txt", "text/plain; charset=utf-8"],
  "/sitemap.xml": ["northwind-sitemap.xml", "application/xml"],
  "/": ["northwind-home.html", HTML],
  "/about": ["northwind-about.html", HTML],
  "/about/history": ["northwind-noindex.html", HTML],
  "/customers": ["northwind-customers.html", HTML],
  "/news/2026/new-omaha-facility": ["northwind-news-omaha.html", HTML],
  "/news/feed.xml": ["northwind-news-feed.xml", "application/rss+xml"],
};

const server = createServer(
  {
    cert: readFileSync(`${TLS}/server.pem`),
    key: readFileSync(`${TLS}/server-key.pem`),
  },
  (request, response) => {
    const path = new URL(request.url ?? "/", "https://fixture.invalid").pathname;
    const route = request.method === "GET" ? ROUTES[path] : undefined;
    console.log(`${request.method} ${path} ${route ? 200 : 404}`);
    if (!route) {
      response.writeHead(404, { "Content-Type": HTML }).end("Not found");
      return;
    }
    const [file, contentType] = route;
    response.writeHead(200, { "Content-Type": contentType })
      .end(readFileSync(`${FIXTURES}/${file}`));
  },
);

server.listen(443, () => console.log("Fixture site listening on :443"));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
