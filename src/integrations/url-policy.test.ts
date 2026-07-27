import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSafeOutboundUrl,
  isPrivateOrReservedAddress,
  parseOutboundHttpUrl,
  requireSameOrigin,
} from "./url-policy";

test("outbound policy rejects private IPv4 and IPv6 ranges", () => {
  assert.equal(isPrivateOrReservedAddress("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedAddress("169.254.169.254"), true);
  assert.equal(isPrivateOrReservedAddress("10.1.2.3"), true);
  assert.equal(isPrivateOrReservedAddress("240.0.0.1"), true);
  assert.equal(isPrivateOrReservedAddress("255.255.255.255"), true);
  assert.equal(isPrivateOrReservedAddress("::1"), true);
  assert.equal(isPrivateOrReservedAddress("fec0::1"), true);
  assert.equal(isPrivateOrReservedAddress("ff02::1"), true);
  assert.equal(isPrivateOrReservedAddress("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedAddress("2606:4700:4700::1111"), false);
});

test("outbound policy blocks non-global and IPv4-embedding IPv6 ranges", () => {
  for (const address of [
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::a9fe:a9fe",
    "100::1",
    "100:0:0:1::1",
    "2001::1",
    "2001:2::1",
    "2001:10::1",
    "2002:7f00:1::",
    "3fff::1",
    "5f00::1",
  ]) {
    assert.equal(isPrivateOrReservedAddress(address), true, address);
  }
});

test("outbound policy preserves globally reachable IPv6 exceptions", () => {
  for (const address of [
    "2001:1::1",
    "2001:1::2",
    "2001:1::3",
    "2001:3::1",
    "2001:4:112::1",
    "2001:20::1",
    "2001:30::1",
    "2620:4f:8000::1",
    "2606:4700:4700::1111",
  ]) {
    assert.equal(isPrivateOrReservedAddress(address), false, address);
  }
});

test("outbound policy rejects HTTP and DNS that resolves privately", async () => {
  await assert.rejects(() => assertSafeOutboundUrl("http://example.com"), /HTTPS/);
  await assert.rejects(
    () => assertSafeOutboundUrl("https://example.com", { resolver: async () => ["10.0.0.8"] }),
    /private or reserved/,
  );
  for (const address of [
    "64:ff9b::7f00:1",
    "64:ff9b:1::a9fe:a9fe",
    "2002:7f00:1::",
  ]) {
    await assert.rejects(
      () => assertSafeOutboundUrl("https://example.com", {
        resolver: async () => [address],
      }),
      /private or reserved/,
      address,
    );
  }
});

test("outbound policy allows a public HTTPS resolution", async () => {
  const url = await assertSafeOutboundUrl("https://provider.example/api", {
    resolver: async () => ["8.8.8.8"],
  });
  assert.equal(url.origin, "https://provider.example");
});

test("endpoint parser rejects embedded credentials and same-origin guard rejects redirects", () => {
  assert.throws(() => parseOutboundHttpUrl("https://user:pass@example.com"), /credentials/);
  assert.throws(
    () => requireSameOrigin("https://attacker.example/deck", "https://provider.example"),
    /outside its configured origin/,
  );
});
