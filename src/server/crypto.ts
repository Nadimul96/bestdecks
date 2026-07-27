import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { loadEnv } from "@/src/config/env";
import {
  integrationProviderSchema,
  type IntegrationProviderKey,
} from "@/src/domain/onboarding";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_ID_BYTES = 12;
const MAX_SECRET_CHARACTERS = 8_192;
const MAX_SECRET_BYTES = MAX_SECRET_CHARACTERS * 4;
const MAX_ENVELOPE_CHARACTERS = Math.ceil(MAX_SECRET_BYTES * 4 / 3) + 256;
const MAX_USER_ID_CHARACTERS = 512;
const INVALID_PAYLOAD_MESSAGE =
  "Stored integration secret payload is invalid or cannot be decrypted.";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface IntegrationSecretContext {
  userId: string;
  provider: IntegrationProviderKey;
}

export interface IntegrationSecretKeyConfig {
  current: string;
  previous?: string;
}

export interface IntegrationSecretCodec {
  readonly currentKeyId: string;
  readonly hasPreviousKey: boolean;
  encrypt(value: string, context: IntegrationSecretContext): string;
  decrypt(value: string, context: IntegrationSecretContext): string;
  isCurrentEnvelope(value: string): boolean;
}

interface KeyMaterial {
  id: string;
  key: Buffer;
}

interface VersionedEnvelope {
  version: "v1";
  keyId: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

interface LegacyEnvelope {
  version: "legacy";
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

type ParsedEnvelope = VersionedEnvelope | LegacyEnvelope;

function invalidPayload(): Error {
  return new Error(INVALID_PAYLOAD_MESSAGE);
}

function deriveKey(source: string): Buffer {
  if (typeof source !== "string" || source.length < 32 || source.length > 8_192) {
    throw new Error("Integration secret encryption key configuration is invalid.");
  }

  return createHash("sha256").update(source, "utf8").digest();
}

function deriveKeyId(key: Buffer): string {
  return createHash("sha256")
    .update("bestdecks.integration-secret.key-id.v1\0", "utf8")
    .update(key)
    .digest()
    .subarray(0, KEY_ID_BYTES)
    .toString("base64url");
}

function createKeyMaterial(source: string): KeyMaterial {
  const key = deriveKey(source);
  return { id: deriveKeyId(key), key };
}

function validateContext(context: IntegrationSecretContext): void {
  if (
    typeof context?.userId !== "string"
    || context.userId.length < 1
    || context.userId.length > MAX_USER_ID_CHARACTERS
    || !integrationProviderSchema.safeParse(context.provider).success
  ) {
    throw new Error("Integration secret context is invalid.");
  }
}

function createAdditionalAuthenticatedData(
  context: IntegrationSecretContext,
  keyId: string,
): Buffer {
  validateContext(context);
  return Buffer.from(
    JSON.stringify([
      "bestdecks.integration-secret",
      1,
      keyId,
      context.userId,
      context.provider,
    ]),
    "utf8",
  );
}

function validatePlaintext(value: string): Buffer {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_SECRET_CHARACTERS) {
    throw new Error("Integration secret value is invalid.");
  }

  const plaintext = Buffer.from(value, "utf8");
  if (plaintext.length > MAX_SECRET_BYTES) {
    throw new Error("Integration secret value is invalid.");
  }
  return plaintext;
}

function decodeBase64Url(value: string, expectedBytes?: number): Buffer {
  if (
    !BASE64URL_PATTERN.test(value)
    || value.length > Math.ceil(MAX_SECRET_BYTES * 4 / 3) + 4
  ) {
    throw invalidPayload();
  }

  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value
    || decoded.length > MAX_SECRET_BYTES
    || (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw invalidPayload();
  }
  return decoded;
}

function decodeBase64(value: string, expectedBytes?: number): Buffer {
  if (
    !BASE64_PATTERN.test(value)
    || value.length > Math.ceil(MAX_SECRET_BYTES * 4 / 3) + 4
  ) {
    throw invalidPayload();
  }

  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value
    || decoded.length > MAX_SECRET_BYTES
    || (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw invalidPayload();
  }
  return decoded;
}

function parseEnvelope(value: string): ParsedEnvelope {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > MAX_ENVELOPE_CHARACTERS
  ) {
    throw invalidPayload();
  }

  const parts = value.split(".");
  if (parts.length === 5) {
    const [version, keyIdText, ivText, authTagText, ciphertextText] = parts;
    if (version !== ENVELOPE_VERSION) {
      throw invalidPayload();
    }

    const keyId = decodeBase64Url(keyIdText, KEY_ID_BYTES).toString("base64url");
    const ciphertext = decodeBase64Url(ciphertextText);
    if (ciphertext.length < 1) {
      throw invalidPayload();
    }
    return {
      version: "v1",
      keyId,
      iv: decodeBase64Url(ivText, IV_BYTES),
      authTag: decodeBase64Url(authTagText, AUTH_TAG_BYTES),
      ciphertext,
    };
  }

  if (parts.length === 3) {
    const [ivText, authTagText, ciphertextText] = parts;
    const ciphertext = decodeBase64(ciphertextText);
    if (ciphertext.length < 1) {
      throw invalidPayload();
    }
    return {
      version: "legacy",
      iv: decodeBase64(ivText, IV_BYTES),
      authTag: decodeBase64(authTagText, AUTH_TAG_BYTES),
      ciphertext,
    };
  }

  throw invalidPayload();
}

function decodePlaintext(value: Buffer): string {
  try {
    const plaintext = new TextDecoder("utf-8", { fatal: true }).decode(value);
    if (plaintext.length < 1 || plaintext.length > MAX_SECRET_CHARACTERS) {
      throw invalidPayload();
    }
    return plaintext;
  } catch {
    throw invalidPayload();
  } finally {
    value.fill(0);
  }
}

function decryptEnvelope(
  envelope: ParsedEnvelope,
  material: KeyMaterial,
  additionalAuthenticatedData?: Buffer,
): string {
  const decipher = createDecipheriv("aes-256-gcm", material.key, envelope.iv);
  if (additionalAuthenticatedData) {
    decipher.setAAD(additionalAuthenticatedData);
  }
  decipher.setAuthTag(envelope.authTag);
  return decodePlaintext(Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]));
}

export function createIntegrationSecretCodec(
  config: IntegrationSecretKeyConfig,
): IntegrationSecretCodec {
  const current = createKeyMaterial(config.current);
  const previous = config.previous === undefined
    ? undefined
    : createKeyMaterial(config.previous);
  if (previous?.id === current.id) {
    throw new Error("Current and previous integration secret keys must be different.");
  }
  const materials = previous ? [current, previous] : [current];

  return {
    currentKeyId: current.id,
    hasPreviousKey: Boolean(previous),

    encrypt(value, context) {
      const plaintext = validatePlaintext(value);
      try {
        const additionalAuthenticatedData = createAdditionalAuthenticatedData(
          context,
          current.id,
        );
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", current.key, iv);
        cipher.setAAD(additionalAuthenticatedData);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return [
          ENVELOPE_VERSION,
          current.id,
          iv.toString("base64url"),
          authTag.toString("base64url"),
          ciphertext.toString("base64url"),
        ].join(".");
      } finally {
        plaintext.fill(0);
      }
    },

    decrypt(value, context) {
      const envelope = parseEnvelope(value);
      validateContext(context);
      const additionalAuthenticatedData = envelope.version === "v1"
        ? createAdditionalAuthenticatedData(context, envelope.keyId)
        : undefined;
      const candidates = envelope.version === "v1"
        ? materials.filter((material) => material.id === envelope.keyId)
        : materials;

      for (const material of candidates) {
        try {
          return decryptEnvelope(
            envelope,
            material,
            additionalAuthenticatedData,
          );
        } catch {
          // Authentication failures are intentionally indistinguishable from malformed payloads.
        }
      }
      throw invalidPayload();
    },

    isCurrentEnvelope(value) {
      const envelope = parseEnvelope(value);
      return envelope.version === "v1" && envelope.keyId === current.id;
    },
  };
}

export function getIntegrationSecretCodec(): IntegrationSecretCodec {
  const env = loadEnv();
  if (!env.APP_SECRETS_KEY) {
    throw new Error(
      "APP_SECRETS_KEY is required to store provider secrets. Generate one with `openssl rand -hex 32` and add it to .env.local.",
    );
  }
  return createIntegrationSecretCodec({
    current: env.APP_SECRETS_KEY,
    previous: env.APP_SECRETS_KEY_PREVIOUS,
  });
}

export function encryptSecret(value: string, context: IntegrationSecretContext): string {
  return getIntegrationSecretCodec().encrypt(value, context);
}

export function decryptSecret(value: string, context: IntegrationSecretContext): string {
  return getIntegrationSecretCodec().decrypt(value, context);
}
