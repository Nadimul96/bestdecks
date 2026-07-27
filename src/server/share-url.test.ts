import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicShareUrl,
  resolvePublicShareOrigin,
} from "./share-url";

const originEnvFields = [
  "NODE_ENV",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "RENDER_EXTERNAL_URL",
] as const;

function withOriginEnv(
  values: Partial<Record<(typeof originEnvFields)[number], string>>,
  run: () => void,
) {
  const env = process.env as Record<string, string | undefined>;
  const previous = new Map(originEnvFields.map((field) => [field, env[field]]));
  for (const field of originEnvFields) delete env[field];
  Object.assign(env, values);

  try {
    run();
  } finally {
    for (const field of originEnvFields) {
      const oldValue = previous.get(field);
      if (oldValue === undefined) delete env[field];
      else env[field] = oldValue;
    }
  }
}

test("resolvePublicShareOrigin uses configured canonical production origin", () => {
  withOriginEnv({
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://bestdecks.co",
  }, () => {
    const request = new Request("https://attacker.example/api/delivery/target/share");

    assert.equal(resolvePublicShareOrigin(request), "https://bestdecks.co");
    assert.equal(buildPublicShareUrl(request, "abc12345"), "https://bestdecks.co/share/abc12345");
  });
});

test("resolvePublicShareOrigin collapses console subdomains outside production", () => {
  withOriginEnv({ NODE_ENV: "development" }, () => {
    const request = new Request("https://console.bestdecks.co/api/delivery/target/share");
    assert.equal(resolvePublicShareOrigin(request), "https://bestdecks.co");
  });
});

test("resolvePublicShareOrigin keeps localhost origins during local development", () => {
  withOriginEnv({ NODE_ENV: "development" }, () => {
    const request = new Request("http://localhost:3000/api/delivery/target/share");
    assert.equal(resolvePublicShareOrigin(request), "http://localhost:3000");
  });
});

test("resolvePublicShareOrigin rejects unsafe configuration and public HTTP", () => {
  withOriginEnv({
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://bestdecks.co/path?next=evil",
  }, () => {
    assert.throws(
      () => resolvePublicShareOrigin(new Request("https://bestdecks.co/share")),
      /BETTER_AUTH_URL/u,
    );
  });

  withOriginEnv({ NODE_ENV: "development" }, () => {
    assert.throws(
      () => resolvePublicShareOrigin(new Request("http://app.example.com/share")),
      /Public share origin/u,
    );
  });
});

test("resolvePublicShareOrigin requires production canonical configuration", () => {
  withOriginEnv({ NODE_ENV: "production" }, () => {
    assert.throws(
      () => resolvePublicShareOrigin(new Request("https://bestdecks.co/share")),
      /required in production/u,
    );
  });
});
