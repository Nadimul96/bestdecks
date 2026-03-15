"use client";

import { createAuthClient } from "better-auth/react";

// Always use the main domain for auth API calls, even from console.bestdecks.co
// This ensures OAuth callbacks and session cookies work across subdomains
const baseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname.replace(/^console\./, "")}${window.location.port ? `:${window.location.port}` : ""}`
    : "http://localhost:3000");

export const authClient = createAuthClient({
  baseURL: `${baseURL}/api/auth`,
});
