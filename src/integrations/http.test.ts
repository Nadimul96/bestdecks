import test from "node:test";
import assert from "node:assert/strict";

import { HttpError, requestJson, requestText, sleep } from "./http";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("requestText returns status and text from a successful fetch", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("hello world", { status: 200 })) as typeof fetch;

  try {
    const result = await requestText("https://example.com/api");
    assert.equal(result.status, 200);
    assert.equal(result.text, "hello world");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText applies default Accept header", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    await requestText("https://example.com/api");
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers?.Accept, "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText sends POST body as JSON", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = "";
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body ?? "");
    capturedHeaders = init?.headers as Record<string, string>;
    return new Response("created", { status: 201 });
  }) as typeof fetch;

  try {
    const result = await requestText("https://example.com/api", {
      method: "POST",
      body: { key: "value" },
    });

    assert.equal(result.status, 201);
    assert.equal(capturedBody, '{"key":"value"}');
    assert.equal(capturedHeaders["Content-Type"], "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText throws timeout error when request takes too long", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response("ok")), 5000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => requestText("https://slow.example.com/api", { timeoutMs: 50 }),
      /timed out/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText propagates network errors in test mode (no curl fallback)", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";

  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => requestText("https://down.example.com/api", { timeoutMs: 0 }),
      /Network error.*ECONNREFUSED/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test("requestJson parses JSON from a successful response", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    createJsonResponse({ greeting: "hello" })) as typeof fetch;

  try {
    const result = await requestJson<{ greeting: string }>("https://example.com/api");
    assert.equal(result.greeting, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestJson throws HttpError for non-2xx responses", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("Not found", { status: 404 })) as typeof fetch;

  try {
    await assert.rejects(
      () => requestJson("https://example.com/missing"),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 404);
        assert.match(error.bodyText, /Not found/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestJson throws HttpError for 500 responses", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("Internal Server Error", { status: 500 })) as typeof fetch;

  try {
    await assert.rejects(
      () => requestJson("https://example.com/error"),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 500);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpError stores status and bodyText", () => {
  const error = new HttpError("test error", 422, '{"detail":"bad"}');

  assert.equal(error.name, "HttpError");
  assert.equal(error.status, 422);
  assert.equal(error.bodyText, '{"detail":"bad"}');
  assert.match(error.message, /test error/);
});

test("sleep resolves after the specified duration", async () => {
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 40, `Expected at least 40ms but got ${elapsed}ms`);
});

test("requestText merges custom headers with defaults", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = init?.headers as Record<string, string>;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    await requestText("https://example.com/api", {
      headers: { Authorization: "Bearer token123" },
    });

    assert.equal(capturedHeaders.Accept, "application/json");
    assert.equal(capturedHeaders.Authorization, "Bearer token123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText uses provided AbortSignal instead of internal timeout", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response("ok")), 5000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);

    await assert.rejects(
      () => requestText("https://example.com/api", {
        signal: controller.signal,
        timeoutMs: 60_000, // large timeout to prove signal takes priority
      }),
      /timed out|abort/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
