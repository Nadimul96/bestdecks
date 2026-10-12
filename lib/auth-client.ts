"use client";

import { createAuthClient } from "better-auth/react";

import { resolveBrowserAuthOrigin } from "@/src/config/browser-auth-origin";

const environment = process.env.NODE_ENV === "development"
  || process.env.NODE_ENV === "test"
  ? process.env.NODE_ENV
  : "production";
const authOrigin = resolveBrowserAuthOrigin({
  environment,
  configuredOrigin: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  currentOrigin: typeof window === "undefined" ? undefined : window.location.origin,
});

// With no explicit origin, Better Auth resolves the same origin itself
// (window.location in the browser, BETTER_AUTH_URL during SSR). It rejects a
// relative "/api/auth" base URL, which made production SSR fail.
export const authClient = createAuthClient(
  authOrigin ? { baseURL: `${authOrigin}/api/auth` } : {},
);
