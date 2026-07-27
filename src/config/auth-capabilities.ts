import type { RuntimeEnvironment } from "@/src/config/canonical-origin";

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export interface PublicAuthCapabilities {
  emailPasswordSignIn: true;
  selfServiceSignup: boolean;
  googleSignIn: boolean;
  password: {
    minLength: typeof AUTH_PASSWORD_MIN_LENGTH;
    maxLength: typeof AUTH_PASSWORD_MAX_LENGTH;
  };
}

interface AuthCapabilityInput {
  environment: RuntimeEnvironment;
  googleClientId?: string;
  googleClientSecret?: string;
}

export type AuthSurfaceMode = "login" | "signup";

/**
 * Derive the browser-safe authentication inventory from server configuration.
 * Credentials never enter the returned object.
 */
export function derivePublicAuthCapabilities(
  input: AuthCapabilityInput,
): PublicAuthCapabilities {
  const googleSignIn = Boolean(
    input.googleClientId?.trim() && input.googleClientSecret?.trim(),
  );

  return {
    emailPasswordSignIn: true,
    selfServiceSignup: input.environment !== "production",
    googleSignIn,
    password: {
      minLength: AUTH_PASSWORD_MIN_LENGTH,
      maxLength: AUTH_PASSWORD_MAX_LENGTH,
    },
  };
}

/** Keep rendering decisions aligned with the server-derived capability object. */
export function resolveAuthSurfacePolicy(
  capabilities: PublicAuthCapabilities,
  mode: AuthSurfaceMode,
) {
  const canSubmit = mode === "login" || capabilities.selfServiceSignup;

  return {
    canSubmit,
    showEmailPassword: canSubmit && capabilities.emailPasswordSignIn,
    showGoogle: canSubmit && capabilities.googleSignIn,
    showSignupLink: mode === "login" && capabilities.selfServiceSignup,
    passwordMinLength:
      mode === "signup" ? capabilities.password.minLength : undefined,
    passwordMaxLength: capabilities.password.maxLength,
  };
}
