import test from "node:test";
import assert from "node:assert/strict";

import {
  INTERNAL_ORIGIN_HEADER,
  resolveRequestOrigin,
} from "./request-origin";

test("resolveRequestOrigin prefers the forwarded internal origin", () => {
  const request = new Request("http://internal-host/api/runs/test/step", {
    headers: {
      [INTERNAL_ORIGIN_HEADER]: "https://app.bestdecks.co/",
    },
  });

  assert.equal(resolveRequestOrigin(request), "https://app.bestdecks.co");
});

test("resolveRequestOrigin falls back to request.url origin", () => {
  const request = new Request("http://localhost:3000/api/runs/test/step");

  assert.equal(resolveRequestOrigin(request), "http://localhost:3000");
});
