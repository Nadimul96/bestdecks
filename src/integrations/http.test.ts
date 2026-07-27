import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";

import {
  HttpError,
  requestJson,
  requestJsonWithMetadata,
  requestText,
  sleep,
} from "./http";
import { resolveSafeOutboundTarget } from "./url-policy";

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
    assert.equal(capturedInit?.redirect, "manual");
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

test("requestText rejects an oversized declared response before reading it", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });

  globalThis.fetch = (async () => new Response(body, {
    status: 200,
    headers: { "Content-Length": "64" },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => requestText("https://example.com/api", { maxResponseBytes: 16 }),
      /Provider response exceeded 16 bytes/,
    );
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText enforces the byte limit for chunked responses", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("1234"));
      controller.enqueue(encoder.encode("5678"));
    },
    cancel() {
      cancelled = true;
    },
  });

  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;

  try {
    await assert.rejects(
      () => requestText("https://example.com/api", { maxResponseBytes: 6 }),
      /Provider response exceeded 6 bytes/,
    );
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestText measures UTF-8 bytes rather than JavaScript characters", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("éé", { status: 200 })) as typeof fetch;

  try {
    const result = await requestText("https://example.com/api", {
      maxResponseBytes: 4,
    });
    assert.equal(result.text, "éé");

    await assert.rejects(
      () => requestText("https://example.com/api", { maxResponseBytes: 3 }),
      /Provider response exceeded 3 bytes/,
    );
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

test("requestText reports network failures without echoing the transport error", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";

  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED token-that-must-not-be-echoed");
  }) as typeof fetch;

  try {
    await assert.rejects(async () => {
      try {
        await requestText("https://down.example.com/api?credential=hidden", { timeoutMs: 0 });
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Network error calling GET https:\/\/down\.example\.com\/api\./);
        assert.doesNotMatch(error.message, /ECONNREFUSED|token-that-must-not-be-echoed|credential/);
        throw error;
      }
    });
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

test("requestJsonWithMetadata retains only a strict browser-usage header", async () => {
  const originalFetch = globalThis.fetch;
  let headerValue = "1842";
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Browser-Ms-Used": headerValue,
      "Set-Cookie": "provider-secret=must-not-escape",
    },
  })) as typeof fetch;

  try {
    const retained = await requestJsonWithMetadata<{ ok: boolean }>(
      "https://example.com/api",
    );
    assert.deepEqual(retained, {
      data: { ok: true },
      metadata: { browserMilliseconds: 1842 },
    });
    assert.equal("headers" in retained, false);

    for (const invalid of ["12ms", "-1", "1.5", "9007199254740992"]) {
      headerValue = invalid;
      const omitted = await requestJsonWithMetadata<{ ok: boolean }>(
        "https://example.com/api",
      );
      assert.deepEqual(omitted.metadata, {});
    }
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
        assert.equal(error.bodyText, "");
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

test("requestJson never follows a redirect carrying Authorization", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only");
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => requestJson("https://provider.example/create", {
        headers: { Authorization: "Bearer test-only" },
      }),
      (error: unknown) => error instanceof HttpError && error.status === 302,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a validated provider request connects to the pinned address", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ host: request.headers.host }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://provider.example:${address.port}/health`;
    const target = await resolveSafeOutboundTarget(endpoint, {
      allowPrivateNetwork: true,
      resolver: async () => ["127.0.0.1"],
    });

    const result = await requestJson<{ host: string }>(endpoint, {
      pinnedAddress: target.address,
      pinnedFamily: target.family,
    });
    assert.equal(result.host, `provider.example:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("pinned chunked responses grow adaptively and still enforce the configured cap", async () => {
  const chunk = "x".repeat(48 * 1024);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/plain");
    response.write(chunk);
    response.write(chunk);
    response.end(request.url === "/too-large" ? chunk : "done");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const target = {
      pinnedAddress: "127.0.0.1",
      pinnedFamily: 4 as const,
    };
    const accepted = await requestText(
      `http://provider.example:${address.port}/accepted`,
      { ...target, maxResponseBytes: 128 * 1024 },
    );
    assert.equal(Buffer.byteLength(accepted.text), 96 * 1024 + 4);

    await assert.rejects(
      requestText(`http://provider.example:${address.port}/too-large`, {
        ...target,
        maxResponseBytes: 128 * 1024,
      }),
      /Provider response exceeded 131072 bytes/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("requests reject Content-Length overflow and pinned early EOF", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("overflow"));
        controller.close();
      },
    }),
    { headers: { "Content-Length": "4" } },
  )) as typeof fetch;
  try {
    await assert.rejects(
      requestText("https://provider.example/mismatch", { maxResponseBytes: 64 }),
      /did not match its declared Content-Length/,
    );

    // Fetch returns decoded content, but Content-Length still measures encoded
    // wire bytes. Those values are deliberately not compared.
    globalThis.fetch = (async () => new Response("decoded-body", {
      headers: {
        "Content-Encoding": "gzip",
        "Content-Length": "4",
      },
    })) as typeof fetch;
    const decoded = await requestText("https://provider.example/encoded", {
      maxResponseBytes: 64,
    });
    assert.equal(decoded.text, "decoded-body");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const assertLengthMismatch = async (declaredLength: number, body: string) => {
    const server = createNetServer((socket) => {
      socket.once("data", () => {
        socket.end([
          "HTTP/1.1 200 OK",
          `Content-Length: ${declaredLength}`,
          "Content-Type: text/plain",
          "Connection: close",
          "",
          body,
        ].join("\r\n"));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      await assert.rejects(
        requestText(`http://provider.example:${address.port}/mismatch`, {
          pinnedAddress: "127.0.0.1",
          pinnedFamily: 4,
          maxResponseBytes: 64,
        }),
        /did not match its declared Content-Length/,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };

  await assertLengthMismatch(8, "short");
});
