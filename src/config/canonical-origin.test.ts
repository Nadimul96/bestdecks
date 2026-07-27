import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalOriginError,
  parseCanonicalOrigin,
} from "./canonical-origin";

test("canonical origins normalize absolute HTTPS origins", () => {
  assert.equal(
    parseCanonicalOrigin("HTTPS://APP.Example.COM:443/", "production"),
    "https://app.example.com",
  );
  assert.equal(
    parseCanonicalOrigin("https://app.example.com:8443", "production"),
    "https://app.example.com:8443",
  );
});

test("canonical origins reject ambiguous or unsafe production values", () => {
  const invalid = [
    "app.example.com",
    "http://app.example.com",
    "http://localhost:3000",
    "https://user:password@app.example.com",
    "https://app.example.com/path",
    "https://app.example.com/a/..",
    "https://app.example.com?next=attacker",
    "https://app.example.com#fragment",
    "https://app.example.com//",
    "https://app.example.com.",
    " https://app.example.com",
    "ftp://app.example.com",
  ];

  for (const value of invalid) {
    assert.throws(
      () => parseCanonicalOrigin(value, "production"),
      CanonicalOriginError,
      value,
    );
  }
});

test("plain HTTP is limited to local loopback origins outside production", () => {
  for (const value of [
    "http://localhost:3000",
    "http://dev.localhost:3001",
    "http://127.0.0.42:3000",
    "http://[::1]:3000",
  ]) {
    assert.equal(parseCanonicalOrigin(value, "development"), value);
  }

  assert.throws(
    () => parseCanonicalOrigin("http://app.example.com", "development"),
    CanonicalOriginError,
  );
  assert.throws(
    () => parseCanonicalOrigin("http://localhost:3000", "production"),
    CanonicalOriginError,
  );
});
