import assert from "node:assert/strict";
import test from "node:test";

import { randomUUID } from "@/lib/utils-crypto";

test("browser UUID helper returns secure RFC 4122 version-4 identifiers", () => {
  const values = Array.from({ length: 32 }, () => randomUUID());

  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    assert.match(
      value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
});
