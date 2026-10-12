import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHtmlEntities,
  extractFeedEntries,
  extractReadableDocument,
  extractSitemapLocations,
  truncateUtf8,
} from "./html-text";
import { readWebFixture } from "./web-fixture.test-helper";

test("readable text only removes markup, so visible sentences survive verbatim", () => {
  const html = readWebFixture("northwind-home.html");
  const document = extractReadableDocument(html, "https://northwind.example.com/");

  assert.ok(document.text.includes(
    "Grocers use Northwind to move produce, dairy, and frozen goods from regional farms to store shelves in under 36 hours.",
  ));
  assert.deepEqual(document.feedUrls, ["https://northwind.example.com/news/feed.xml"]);
  assert.equal(document.noindex, false);
  assert.ok(document.links.includes("https://northwind.example.com/about"));
  assert.equal(document.links.some((link) => link.startsWith("mailto:")), false);
});

test("readable text honors robots meta directives", () => {
  const document = extractReadableDocument(
    readWebFixture("northwind-noindex.html"),
    "https://northwind.example.com/about/history",
  );
  assert.equal(document.noindex, true);
  assert.equal(document.nofollow, true);
  assert.deepEqual(document.links, []);
});

test("entity decoding handles named, decimal, and hex references and leaves unknowns", () => {
  assert.equal(decodeHtmlEntities("A&amp;B &#8212; &#x2019; &nbsp;x &bogus;"), "A&B — ’  x &bogus;");
  assert.equal(decodeHtmlEntities("&#0; &#x110000;"), "&#0; &#x110000;");
});

test("sitemaps and feeds are parsed without interpreting markup", () => {
  const base = "https://northwind.example.com/";
  assert.deepEqual(
    extractSitemapLocations(readWebFixture("northwind-sitemap.xml"), base).slice(0, 2),
    ["https://northwind.example.com/", "https://northwind.example.com/about"],
  );

  const entries = extractFeedEntries(readWebFixture("northwind-news-feed.xml"), `${base}news/feed.xml`);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    title: "Northwind opens its 48th cross-dock facility in Omaha",
    url: "https://northwind.example.com/news/2026/new-omaha-facility",
    published: "Tue, 15 Sep 2026 14:00:00 GMT",
    summary: "The Omaha site adds 120,000 square feet of temperature-controlled capacity.",
  });

  const atom = extractFeedEntries(
    "<feed><entry><title>Atom post</title><link href=\"/posts/1\"/><updated>2026-09-01</updated></entry></feed>",
    `${base}atom.xml`,
  );
  assert.deepEqual(atom, [{ title: "Atom post", url: `${base}posts/1`, published: "2026-09-01" }]);
});

test("list markers split from their content by nested blocks are rejoined", () => {
  const document = extractReadableDocument(
    "<main><ul><li><div>Unlimited members</div></li><li><p>Two teams</p></li></ul></main>",
    "https://site.example.com/",
  );
  assert.equal(document.text, "- Unlimited members\n\n- Two teams");
});

test("UTF-8 truncation never splits a code point", () => {
  assert.equal(truncateUtf8("café", 4), "caf");
  assert.equal(truncateUtf8("abc", 10), "abc");
});
