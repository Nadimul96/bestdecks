import {
  parseCanonicalOrigin,
  type RuntimeEnvironment,
} from "@/src/config/canonical-origin";

interface AuthOriginInput {
  environment: RuntimeEnvironment;
  betterAuthUrl?: string;
  renderExternalUrl?: string;
  vercelUrl?: string;
  port?: string;
}

function localAuthOrigin(portValue?: string): string {
  const port = portValue?.trim() || "3000";
  const numericPort = Number(port);
  if (!/^\d{1,5}$/u.test(port) || numericPort < 1 || numericPort > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return `http://localhost:${port}`;
}

export function resolveAuthBaseUrl(input: AuthOriginInput): string {
  if (input.environment !== "production") {
    return parseCanonicalOrigin(
      input.betterAuthUrl ?? localAuthOrigin(input.port),
      input.environment,
      "BETTER_AUTH_URL",
    );
  }

  if (input.betterAuthUrl) {
    return parseCanonicalOrigin(
      input.betterAuthUrl,
      input.environment,
      "BETTER_AUTH_URL",
    );
  }
  if (input.renderExternalUrl) {
    return parseCanonicalOrigin(
      input.renderExternalUrl,
      input.environment,
      "RENDER_EXTERNAL_URL",
    );
  }
  if (input.vercelUrl) {
    return parseCanonicalOrigin(
      `https://${input.vercelUrl}`,
      input.environment,
      "VERCEL_URL",
    );
  }

  throw new Error("BETTER_AUTH_URL is required in production.");
}
