import assert from "node:assert/strict";
import test from "node:test";

import { isGeminiApiKeyRejection } from "./gemini-key-rejection";
import { extractErrorInfoReasons } from "./http";

// Shape of Gemini's response to an invalid key (message shortened).
const INVALID_KEY_BODY = JSON.stringify({
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
    details: [{
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "API_KEY_INVALID",
      domain: "googleapis.com",
    }],
  },
});

test("ErrorInfo reasons are extracted as bare codes, never as free text", () => {
  assert.deepEqual(extractErrorInfoReasons(INVALID_KEY_BODY), ["API_KEY_INVALID"]);
  const echoed = JSON.stringify({ error: { details: [{ reason: "key sk-123 is wrong" }] } });
  assert.deepEqual(extractErrorInfoReasons(echoed), []);
  assert.deepEqual(extractErrorInfoReasons("<html>"), []);
  assert.deepEqual(extractErrorInfoReasons("null"), []);
});

test("only an HTTP 400 with an API_KEY_* reason is a Gemini key rejection", () => {
  assert.equal(isGeminiApiKeyRejection({ status: 400, errorReasons: ["API_KEY_INVALID"] }), true);
  assert.equal(isGeminiApiKeyRejection({ status: 400, errorReasons: ["FIELD_VIOLATION"] }), false);
  assert.equal(isGeminiApiKeyRejection({ status: 400, errorReasons: [] }), false);
  assert.equal(isGeminiApiKeyRejection({ status: 500, errorReasons: ["API_KEY_INVALID"] }), false);
});
