import assert from "node:assert/strict";
import test from "node:test";

import { publicHttpUrlSchema } from "./schemas";
import {
  isPersistableSourceUrl,
  normalizePersistableSourceUrl,
} from "./source-url";

test("persistable source URLs remove query capabilities and fragments", () => {
  assert.equal(
    normalizePersistableSourceUrl(
      "https://Example.COM:443/research?token=provider-capability&utm_source=test#section",
    ),
    "https://example.com/research",
  );
  assert.equal(
    publicHttpUrlSchema.parse("https://example.com/path?id=private#section"),
    "https://example.com/path",
  );
});

test("persistable source URLs reject credentials and non-HTTP protocols", () => {
  for (const value of [
    "https://user:password@example.com/private",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(isPersistableSourceUrl(value), false);
    assert.throws(() => normalizePersistableSourceUrl(value), TypeError);
  }
});
