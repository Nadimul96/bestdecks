import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { loadEnv } from "@/src/config/env";

function getKey() {
  const env = loadEnv();
  if (!env.APP_SECRETS_KEY) {
    throw new Error(
      "APP_SECRETS_KEY is required to store provider secrets. Generate one with `openssl rand -hex 32` and add it to .env.local.",
    );
  }

  return createHash("sha256").update(env.APP_SECRETS_KEY).digest();
}

export function encryptSecret(value: string) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ".",
  );
}

export function decryptSecret(value: string) {
  const [ivText, authTagText, encryptedText] = value.split(".");
  if (!ivText || !authTagText || !encryptedText) {
    throw new Error("Stored secret payload is invalid.");
  }

  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(authTagText, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
