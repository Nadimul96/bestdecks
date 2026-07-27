import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { createIntegrationSecretCodec } from "./crypto";

const OLD_KEY = "rotation-test-old-key-material-0001";
const NEW_KEY = "rotation-test-new-key-material-0002";
const SECRET = "provider-secret-fixture";
const CONTEXT = { userId: "tenant-a", provider: "gemini" as const };
const INVALID_PAYLOAD_MESSAGE =
  "Stored integration secret payload is invalid or cannot be decrypted.";

function encryptLegacy(value: string, source: string): string {
  const key = createHash("sha256").update(source).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

function changeLastCharacter(value: string): string {
  const replacement = value.endsWith("A") ? "B" : "A";
  return `${value.slice(0, -1)}${replacement}`;
}

test("v1 envelopes authenticate tenant and provider ownership", () => {
  const codec = createIntegrationSecretCodec({ current: NEW_KEY });
  const ciphertext = codec.encrypt(SECRET, CONTEXT);
  const parts = ciphertext.split(".");

  assert.equal(parts.length, 5);
  assert.equal(parts[0], "v1");
  assert.equal(parts[1], codec.currentKeyId);
  assert.equal(ciphertext.includes(SECRET), false);
  assert.equal(codec.isCurrentEnvelope(ciphertext), true);
  assert.equal(codec.decrypt(ciphertext, CONTEXT), SECRET);

  assert.throws(
    () => codec.decrypt(ciphertext, { ...CONTEXT, userId: "tenant-b" }),
    { message: INVALID_PAYLOAD_MESSAGE },
  );
  assert.throws(
    () => codec.decrypt(ciphertext, { ...CONTEXT, provider: "perplexity" }),
    { message: INVALID_PAYLOAD_MESSAGE },
  );
});

test("a previous key decrypts old v1 and legacy payloads without becoming current", () => {
  const oldCodec = createIntegrationSecretCodec({ current: OLD_KEY });
  const rotatedCodec = createIntegrationSecretCodec({
    current: NEW_KEY,
    previous: OLD_KEY,
  });
  const previousEnvelope = oldCodec.encrypt(SECRET, CONTEXT);
  const legacyEnvelope = encryptLegacy(SECRET, OLD_KEY);

  assert.equal(rotatedCodec.hasPreviousKey, true);
  assert.equal(rotatedCodec.decrypt(previousEnvelope, CONTEXT), SECRET);
  assert.equal(rotatedCodec.isCurrentEnvelope(previousEnvelope), false);
  assert.equal(rotatedCodec.decrypt(legacyEnvelope, CONTEXT), SECRET);
  assert.equal(rotatedCodec.isCurrentEnvelope(legacyEnvelope), false);

  const currentEnvelope = rotatedCodec.encrypt(SECRET, CONTEXT);
  assert.equal(rotatedCodec.decrypt(currentEnvelope, CONTEXT), SECRET);
  assert.equal(rotatedCodec.isCurrentEnvelope(currentEnvelope), true);
});

test("legacy payloads can still be decrypted with the current key", () => {
  const codec = createIntegrationSecretCodec({ current: OLD_KEY });
  const legacyEnvelope = encryptLegacy(SECRET, OLD_KEY);
  assert.equal(codec.decrypt(legacyEnvelope, CONTEXT), SECRET);
});

test("strict envelope parsing and GCM authentication fail closed", () => {
  const codec = createIntegrationSecretCodec({ current: NEW_KEY });
  const ciphertext = codec.encrypt(SECRET, CONTEXT);
  const [version, keyId, iv, authTag, encrypted] = ciphertext.split(".");
  const malformed = [
    "",
    `${ciphertext}.extra`,
    `v2.${keyId}.${iv}.${authTag}.${encrypted}`,
    `${version}.not+base64url.${iv}.${authTag}.${encrypted}`,
    `${version}.${keyId}.AA.${authTag}.${encrypted}`,
    `${version}.${keyId}.${iv}.AA.${encrypted}`,
    `${version}.${Buffer.alloc(12, 1).toString("base64url")}.${iv}.${authTag}.${encrypted}`,
    `${version}.${keyId}.${iv}.${authTag}.${changeLastCharacter(encrypted)}`,
    "AA==.AA==.AA==",
    "A".repeat(50_000),
  ];

  for (const value of malformed) {
    assert.throws(
      () => codec.decrypt(value, CONTEXT),
      { message: INVALID_PAYLOAD_MESSAGE },
    );
  }
});

test("key identifiers are deterministic fingerprints and duplicate rotation keys are rejected", () => {
  const first = createIntegrationSecretCodec({ current: NEW_KEY });
  const second = createIntegrationSecretCodec({ current: NEW_KEY });

  assert.equal(first.currentKeyId, second.currentKeyId);
  assert.match(first.currentKeyId, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(NEW_KEY.includes(first.currentKeyId), false);
  assert.throws(
    () => createIntegrationSecretCodec({ current: NEW_KEY, previous: NEW_KEY }),
    { message: "Current and previous integration secret keys must be different." },
  );
});
