import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  derivePublicAuthCapabilities,
  resolveAuthSurfacePolicy,
} from "./auth-capabilities";

function readRepositoryFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("production auth capabilities disable every self-service signup surface", () => {
  const capabilities = derivePublicAuthCapabilities({
    environment: "production",
    googleClientId: "google-client-id",
    googleClientSecret: ["fixture", "value"].join("-"),
  });

  assert.equal(capabilities.emailPasswordSignIn, true);
  assert.equal(capabilities.selfServiceSignup, false);
  assert.equal(capabilities.googleSignIn, true);
  assert.deepEqual(capabilities.password, {
    minLength: AUTH_PASSWORD_MIN_LENGTH,
    maxLength: AUTH_PASSWORD_MAX_LENGTH,
  });

  const login = resolveAuthSurfacePolicy(capabilities, "login");
  assert.equal(login.canSubmit, true);
  assert.equal(login.showGoogle, true);
  assert.equal(login.showSignupLink, false);

  const signup = resolveAuthSurfacePolicy(capabilities, "signup");
  assert.equal(signup.canSubmit, false);
  assert.equal(signup.showEmailPassword, false);
  assert.equal(signup.showGoogle, false);
});

test("development signup and Google controls reflect configured server capabilities", () => {
  const withoutGoogle = derivePublicAuthCapabilities({ environment: "development" });
  assert.equal(withoutGoogle.selfServiceSignup, true);
  assert.equal(withoutGoogle.googleSignIn, false);
  assert.equal(resolveAuthSurfacePolicy(withoutGoogle, "login").showGoogle, false);

  for (const incompleteGoogle of [
    { googleClientId: "client", googleClientSecret: "" },
    { googleClientId: "", googleClientSecret: "secret" },
  ]) {
    assert.equal(
      derivePublicAuthCapabilities({
        environment: "development",
        ...incompleteGoogle,
      }).googleSignIn,
      false,
    );
  }

  const withGoogle = derivePublicAuthCapabilities({
    environment: "test",
    googleClientId: "client",
    googleClientSecret: "secret",
  });
  const signup = resolveAuthSurfacePolicy(withGoogle, "signup");
  assert.equal(signup.canSubmit, true);
  assert.equal(signup.showEmailPassword, true);
  assert.equal(signup.showGoogle, true);
  assert.equal(signup.passwordMinLength, 12);
  assert.equal(signup.passwordMaxLength, 128);
});

test("auth pages stay free of unavailable controls and placeholder claims", () => {
  const form = readRepositoryFile("components/auth-form.tsx");
  const login = readRepositoryFile("app/login/page.tsx");
  const signup = readRepositoryFile("app/signup/page.tsx");
  const server = readRepositoryFile("src/server/auth.ts");
  const authSurface = [form, login, signup].join("\n");

  assert.match(form, /policy\.showGoogle/u);
  assert.match(form, /policy\.showSignupLink/u);
  assert.match(signup, /!authCapabilities\.selfServiceSignup/u);
  assert.match(server, /minPasswordLength: authCapabilities\.password\.minLength/u);
  assert.match(server, /maxPasswordLength: authCapabilities\.password\.maxLength/u);

  assert.doesNotMatch(authSurface, /Minimum 8 characters/u);
  assert.doesNotMatch(authSurface, /Sign up free/u);
  assert.doesNotMatch(authSurface, /href="#"/u);
  assert.doesNotMatch(authSurface, /research-driven AI personalization/u);
  assert.doesNotMatch(authSurface, /Privacy Policy/u);
});

test("email-password authentication fields retain programmatic labels", () => {
  const form = readRepositoryFile("components/auth-form.tsx");

  for (const [fieldId, label] of [
    ["nameFieldId", "Full name"],
    ["emailFieldId", "Email"],
    ["passwordFieldId", "Password"],
  ]) {
    assert.match(
      form,
      new RegExp(`<label htmlFor=\\{${fieldId}\\}[^>]*>\\s*${label}`, "u"),
    );
    assert.match(form, new RegExp(`id=\\{${fieldId}\\}`, "u"));
  }
});
