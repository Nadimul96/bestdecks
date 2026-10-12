import assert from "node:assert/strict";
import test from "node:test";

import { parseRobotsTxt } from "./robots-txt";

const url = (path: string) => `https://site.example.com${path}`;

test("robots.txt uses the most specific matching rule and lets allow win a tie", () => {
  const policy = parseRobotsTxt([
    "User-agent: *",
    "Disallow: /private",
    "Allow: /private/public",
    "Disallow: /tie",
    "Allow: /tie",
  ].join("\n"), "BestdecksBot");

  assert.equal(policy.isAllowed(url("/")), true);
  assert.equal(policy.isAllowed(url("/private/x")), false);
  assert.equal(policy.isAllowed(url("/private/public/page")), true);
  assert.equal(policy.isAllowed(url("/tie")), true);
});

test("robots.txt supports wildcards, end anchors, and percent-encoding", () => {
  const policy = parseRobotsTxt([
    "User-agent: *",
    "Disallow: /*.pdf$",
    "Disallow: /search*q=",
    "Disallow: /caf%C3%A9",
  ].join("\n"), "BestdecksBot");

  assert.equal(policy.isAllowed(url("/files/report.pdf")), false);
  assert.equal(policy.isAllowed(url("/files/report.pdf.html")), true);
  assert.equal(policy.isAllowed(url("/search?page=1&q=x")), false);
  assert.equal(policy.isAllowed(url("/café/menu")), false);
});

test("robots.txt prefers a named group over the wildcard group and merges grouped agents", () => {
  const text = [
    "User-agent: *",
    "Disallow: /",
    "",
    "User-agent: OtherBot",
    "User-agent: BestdecksBot",
    "Disallow: /admin",
    "Sitemap: https://site.example.com/sitemap.xml",
  ].join("\r\n");

  const ours = parseRobotsTxt(text, "BestdecksBot");
  assert.equal(ours.isAllowed(url("/pricing")), true);
  assert.equal(ours.isAllowed(url("/admin/users")), false);
  assert.deepEqual(ours.sitemaps, ["https://site.example.com/sitemap.xml"]);

  assert.equal(parseRobotsTxt(text, "UnknownBot").isAllowed(url("/pricing")), false);
});

test("robots.txt ignores comments, unknown fields, and empty disallows", () => {
  const policy = parseRobotsTxt([
    "# comment",
    "User-agent: * # everyone",
    "Crawl-delay: 10",
    "Disallow:",
  ].join("\n"), "BestdecksBot");
  assert.equal(policy.isAllowed(url("/anything")), true);
  assert.equal(policy.isAllowed("not a url"), false);
});
