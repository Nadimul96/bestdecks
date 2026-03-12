"use client";

import { createAuthClient } from "better-auth/react";

const origin =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    : window.location.origin;

export const authClient = createAuthClient({
  baseURL: `${origin}/api/auth`,
});
