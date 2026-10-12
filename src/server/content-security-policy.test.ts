import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";

import { SONNER_INLINE_STYLE_HASHES } from "../config/inline-style-hashes";
import { buildContentSecurityPolicy, proxy } from "../../proxy";

const nonce = Buffer.alloc(16, 7).toString("base64");

test("production CSP uses a strict request nonce without executable inline escape hatches", () => {
  const policy = buildContentSecurityPolicy(nonce);

  assert.match(policy, new RegExp(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`, "u"));
  assert.match(policy, /script-src-attr 'none'/u);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/u);
  assert.doesNotMatch(policy, /'unsafe-eval'/u);
  assert.match(policy, /style-src-attr 'unsafe-inline'/u);
  assert.match(policy, /frame-ancestors 'none'/u);
  assert.match(policy, /upgrade-insecure-requests/u);
});

test("Sonner's runtime stylesheet is allowed by the hash of its exact contents", () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve("sonner"), "utf8");
  const css = bundle.match(/__insertCSS\(("(?:[^"\\]|\\.)*")\)/u)?.[1];
  assert.ok(css, "Sonner no longer injects its CSS through __insertCSS; revisit the CSP hashes");
  const hashOf = (text: string) => `sha256-${createHash("sha256").update(text).digest("base64")}`;
  assert.deepEqual([...SONNER_INLINE_STYLE_HASHES], [hashOf(""), hashOf(JSON.parse(css) as string)]);

  const styleElements = buildContentSecurityPolicy(nonce)
    .split("; ")
    .find((directive) => directive.startsWith("style-src-elem "));
  assert.equal(
    styleElements,
    `style-src-elem 'self' 'nonce-${nonce}' ${SONNER_INLINE_STYLE_HASHES.map((hash) => `'${hash}'`).join(" ")}`,
  );
  assert.doesNotMatch(styleElements ?? "", /'unsafe-inline'/u);
});

test("development CSP adds only the debugging and websocket allowances", () => {
  const policy = buildContentSecurityPolicy(nonce, true);

  assert.match(policy, /script-src[^;]*'unsafe-eval'/u);
  assert.match(policy, /connect-src[^;]* ws: wss:/u);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/u);
});

test("CSP builder rejects predictable or malformed nonce shapes", () => {
  assert.throws(() => buildContentSecurityPolicy("short"), TypeError);
  assert.throws(() => buildContentSecurityPolicy("<script nonce injection>"), TypeError);
});

test("proxy attaches a fresh strict CSP to document responses", () => {
  const first = proxy(new NextRequest("https://bestdecks.example/"));
  const second = proxy(new NextRequest("https://bestdecks.example/"));
  const firstPolicy = first.headers.get("Content-Security-Policy");
  const secondPolicy = second.headers.get("Content-Security-Policy");

  assert.ok(firstPolicy);
  assert.ok(secondPolicy);
  assert.notEqual(firstPolicy, secondPolicy);
  assert.doesNotMatch(firstPolicy, /script-src[^;]*'unsafe-inline'/u);
  assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(first.headers.get("X-Frame-Options"), "DENY");
  assert.equal(first.headers.get("X-DNS-Prefetch-Control"), "off");
  assert.equal(first.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
});

test("origin rejection retains the strict response policy", async () => {
  const response = proxy(new NextRequest("https://bestdecks.example/api/runs", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));

  assert.equal(response.status, 403);
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /script-src[^;]*'nonce-/u);
  assert.deepEqual(await response.json(), {
    error: "Cross-origin mutation rejected.",
    code: "origin_rejected",
  });
});
