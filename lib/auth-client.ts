"use client";

import { createAuthClient } from "better-auth/react";

function resolveAuthBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000";
  }

  // In local development, always use the current origin so stale env ports
  // don't break email/password auth requests.
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return window.location.origin;
  }

  // In production, route auth through the main domain so cookies and OAuth
  // flows continue to work across app and console subdomains.
  return (
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    `${window.location.protocol}//${window.location.hostname.replace(/^console\./, "")}${window.location.port ? `:${window.location.port}` : ""}`
  );
}

const baseURL = resolveAuthBaseUrl();

export const authClient = createAuthClient({
  baseURL: `${baseURL}/api/auth`,
});
