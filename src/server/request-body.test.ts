import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJson, RequestBodyTooLargeError } from "./request-body";

test("bounded JSON reader accepts a body within the byte envelope", async () => {
  const parsed = await readBoundedJson(new Request("https://app.example/api", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  }), 64);
  assert.deepEqual(parsed, { ok: true });
});

test("bounded JSON reader rejects declared and streamed overflows", async () => {
  await assert.rejects(
    () => readBoundedJson(new Request("https://app.example/api", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "{}",
    }), 16),
    RequestBodyTooLargeError,
  );
  await assert.rejects(
    () => readBoundedJson(new Request("https://app.example/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(100) }),
    }), 16),
    RequestBodyTooLargeError,
  );
});

test("bounded JSON reader reports malformed UTF-8 as a JSON syntax error", async () => {
  await assert.rejects(
    () => readBoundedJson(new Request("https://app.example/api", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    }), 16),
    SyntaxError,
  );
});
