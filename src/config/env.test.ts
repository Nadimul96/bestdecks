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
