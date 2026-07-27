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

export const authClient = createAuthClient({
  baseURL: authOrigin ? `${authOrigin}/api/auth` : "/api/auth",
});
