import assert from "node:assert/strict";
import test from "node:test";

import { envSchema } from "./env";

test("environment parsing validates every browser-visible origin", () => {
  for (const field of [
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_BETTER_AUTH_URL",
    "RENDER_EXTERNAL_URL",
  ] as const) {
    const parsed = envSchema.parse({
      NODE_ENV: "production",
      [field]: "https://app.example.com",
    });
    assert.equal(parsed[field], "https://app.example.com");

    assert.throws(
      () => envSchema.parse({
        NODE_ENV: "production",
        [field]: "https://app.example.com/auth/callback?next=evil#fragment",
      }),
      new RegExp(field),
    );
  }
});

test("environment parsing allows local HTTP only outside production", () => {
  assert.equal(
    envSchema.parse({
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
    }).BETTER_AUTH_URL,
    "http://localhost:3000",
  );

  assert.throws(
    () => envSchema.parse({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://localhost:3000",
    }),
    /BETTER_AUTH_URL/u,
  );
  assert.throws(
    () => envSchema.parse({
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://app.example.com",
    }),
    /BETTER_AUTH_URL/u,
  );
});

test("empty optional origin variables remain unset", () => {
  const parsed = envSchema.parse({
    NODE_ENV: "production",
    RENDER_EXTERNAL_URL: "",
    NEXT_PUBLIC_BETTER_AUTH_URL: "",
  });
  assert.equal(parsed.RENDER_EXTERNAL_URL, undefined);
  assert.equal(parsed.NEXT_PUBLIC_BETTER_AUTH_URL, undefined);
});

test("empty optional template values remain unset", () => {
  const parsed = envSchema.parse({
    NODE_ENV: "development",
    BESTDECKS_COMMIT_SHA: "",
    CLOUDFLARE_ACCOUNT_ID: "",
    CLOUDFLARE_API_TOKEN: "",
    DEEPCRAWL_API_KEY: "",
    PERPLEXITY_API_KEY: "",
    GEMINI_API_KEY: "",
    OPENAI_API_KEY: "",
    PRESENTON_BASE_URL: "",
    PRESENTON_API_KEY: "",
    PRESENTON_AUTH_USERNAME: "",
    PRESENTON_AUTH_PASSWORD: "",
    PRESENTON_TEMPLATE: "",
    ALLOW_PRIVATE_PROVIDER_URLS: "",
    ALLOW_USER_PROVIDER_ENDPOINTS: "",
    ALLOW_SHARED_PROVIDER_CREDENTIALS: "",
    PLUSAI_API_KEY: "",
    ALAI_API_KEY: "",
    APP_DOMAIN: "",
    ADMIN_NAME: "",
    ADMIN_EMAIL: "",
    ADMIN_PASSWORD: "",
    SEED_ADMIN_ON_STARTUP: "",
    APP_SECRETS_KEY: "",
    APP_SECRETS_KEY_PREVIOUS: "",
    LOCAL_DB_PATH: "",
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
  });

  assert.equal(parsed.CLOUDFLARE_ACCOUNT_ID, undefined);
  assert.equal(parsed.GEMINI_API_KEY, undefined);
  assert.equal(parsed.PRESENTON_BASE_URL, undefined);
  assert.equal(parsed.ADMIN_EMAIL, undefined);
  assert.equal(parsed.TURSO_DATABASE_URL, undefined);
});

test("production Compose origins must agree with the served application host", () => {
  assert.doesNotThrow(() => envSchema.parse({
    NODE_ENV: "production",
    APP_DOMAIN: "app.example.com",
    BETTER_AUTH_URL: "https://app.example.com",
    NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example.com",
  }));

  assert.throws(
    () => envSchema.parse({
      NODE_ENV: "production",
      APP_DOMAIN: "app.example.com",
      BETTER_AUTH_URL: "https://other.example.com",
    }),
    /APP_DOMAIN/u,
  );
  assert.throws(
    () => envSchema.parse({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.com",
      NEXT_PUBLIC_BETTER_AUTH_URL: "https://other.example.com",
    }),
    /NEXT_PUBLIC_BETTER_AUTH_URL/u,
  );
});
