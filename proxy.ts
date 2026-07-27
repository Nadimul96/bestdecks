import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthBaseUrl } from "@/src/server/auth-origin";
import {
  isTrustedMutationRequest,
  resolveRequestOrigin,
} from "@/src/server/request-origin";

function resolveTrustedMutationOrigin(request: NextRequest): string | null {
  if (process.env.NODE_ENV !== "production") {
    return resolveRequestOrigin(request);
  }

  try {
    // Reverse proxies terminate TLS before forwarding to the standalone app,
    // so Next's internal request URL is not a trustworthy representation of
    // the browser-visible origin. Use the same operator-owned canonical origin
    // as Better Auth, and never derive this decision from forwarding headers.
    return resolveAuthBaseUrl({
      environment: "production",
      betterAuthUrl: process.env.BETTER_AUTH_URL,
      renderExternalUrl: process.env.RENDER_EXTERNAL_URL,
      vercelUrl: process.env.VERCEL_URL,
      port: process.env.PORT,
    });
  } catch {
    // A missing or malformed production origin must disable application
    // mutations rather than silently trusting the reverse-proxy hop.
    return null;
  }
}

export function buildContentSecurityPolicy(nonce: string, isDevelopment = false) {
  if (!/^[A-Za-z0-9+/]{22}==$/u.test(nonce)) {
    throw new TypeError("CSP nonce must be a 128-bit base64 value.");
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    // React style objects are data-only declarations, not executable script.
    // Keep this narrower CSP3 exception separate from style elements.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src 'self' https:${isDevelopment ? " ws: wss:" : ""}`,
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applyBrowserSecurityHeaders(response: NextResponse, contentSecurityPolicy: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );

  // Better Auth owns its own origin/CSRF contract. All other application API
  // mutations are guarded here before route code can read cookies or bodies.
  if (
    request.nextUrl.pathname.startsWith("/api/")
    && !request.nextUrl.pathname.startsWith("/api/auth/")
    && (() => {
      const trustedOrigin = resolveTrustedMutationOrigin(request);
      return trustedOrigin === null
        || !isTrustedMutationRequest(request, trustedOrigin);
    })()
  ) {
    return applyBrowserSecurityHeaders(
      NextResponse.json(
        { error: "Cross-origin mutation rejected.", code: "origin_rejected" },
        { status: 403 },
      ),
      contentSecurityPolicy,
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applyBrowserSecurityHeaders(response, contentSecurityPolicy);
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source:
        "/((?!api|_next/static|_next/image|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
