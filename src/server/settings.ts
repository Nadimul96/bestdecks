import { isIP } from "node:net";

import { loadEnv } from "@/src/config/env";
import {
  cloudflareIntegrationConfigSchema,
  presentonIntegrationConfigSchema,
  type IntegrationProviderKey,
} from "@/src/domain/onboarding";
import { isPrivateOrReservedAddress } from "@/src/integrations/url-policy";
import { decryptSecret } from "@/src/server/crypto";
import { getDb } from "@/src/server/db";

export type { IntegrationProviderKey } from "@/src/domain/onboarding";

export interface IntegrationRecord {
  provider: IntegrationProviderKey;
  displayName?: string;
  config?: Record<string, unknown>;
  secret?: string;
}

export class IntegrationSettingsValidationError extends Error {
  public readonly code = "invalid_integration_settings";

  public constructor(
    public readonly provider: IntegrationProviderKey,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationSettingsValidationError";
  }
}

export function validateCloudflareIntegrationRecord(
  record: Pick<IntegrationRecord, "config" | "secret">,
) {
  const hasOverride = record.config !== undefined || record.secret !== undefined;
  if (!hasOverride) {
    return { config: undefined, secret: undefined };
  }

  const parsedConfig = cloudflareIntegrationConfigSchema.safeParse(record.config);
  if (!parsedConfig.success || !record.secret?.trim()) {
    throw new IntegrationSettingsValidationError(
      "cloudflare",
      "A tenant Cloudflare override requires both an account ID and API token.",
    );
  }

  return {
    config: parsedConfig.data,
    secret: record.secret,
  };
}

interface PresentonIntegrationPolicy {
  nodeEnv: "development" | "test" | "production";
  allowUserProviderEndpoints: boolean;
}

function isLocalProviderHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
    || normalized.endsWith(".home.arpa")
    || normalized === "metadata.google.internal";
}

function assertPublicHttpsPresentonEndpoint(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (
    url.protocol !== "https:"
    || isLocalProviderHostname(hostname)
    || (isIP(hostname) !== 0 && isPrivateOrReservedAddress(hostname))
  ) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "Tenant Presenton endpoints must use public HTTPS; configure private services at the operator boundary.",
    );
  }
}

export function validatePresentonIntegrationRecord(
  record: Pick<IntegrationRecord, "config" | "secret">,
  policy: PresentonIntegrationPolicy,
) {
  const parsedConfig = presentonIntegrationConfigSchema.safeParse(record.config ?? {});
  if (!parsedConfig.success) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "Presenton configuration is invalid.",
    );
  }

  const config = parsedConfig.data;
  const secret = record.secret;
  const authMode = config.authMode ?? (secret ? "bearer" : undefined);

  // A stored tenant override is all-or-nothing. Without its own endpoint it
  // would suppress the operator endpoint while leaving unusable credentials.
  if ((record.config !== undefined || secret !== undefined) && !config.baseUrl) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "A tenant Presenton override requires its own base URL.",
    );
  }

  if (config.baseUrl) assertPublicHttpsPresentonEndpoint(config.baseUrl);

  if (
    config.baseUrl
    && policy.nodeEnv === "production"
    && !policy.allowUserProviderEndpoints
  ) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "User-configured Presenton endpoints are disabled in production.",
    );
  }

  if (config.username?.includes(":")) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "Presenton Basic authentication usernames cannot contain a colon.",
    );
  }
  if (authMode === "basic") {
    if (!config.username || !secret || secret.length < 6) {
      throw new IntegrationSettingsValidationError(
        "presenton",
        "Presenton Basic authentication requires a username and password.",
      );
    }
  } else if (authMode === "bearer") {
    if (config.username || !secret) {
      throw new IntegrationSettingsValidationError(
        "presenton",
        "Presenton bearer authentication requires one API key and no username.",
      );
    }
  } else if (config.username) {
    throw new IntegrationSettingsValidationError(
      "presenton",
      "Presenton username is only valid with Basic authentication.",
    );
  }

  if (config.baseUrl) {
    const isHosted = new URL(config.baseUrl).hostname.toLowerCase() === "api.presenton.ai";
    if (isHosted ? authMode !== "bearer" : authMode !== "basic") {
      throw new IntegrationSettingsValidationError(
        "presenton",
        isHosted
          ? "Hosted Presenton requires bearer authentication."
          : "Self-hosted Presenton requires Basic authentication.",
      );
    }
  }

  return {
    config,
    secret,
    authMode,
  };
}

export async function listIntegrationRecords(userId?: string): Promise<IntegrationRecord[]> {
  const db = await getDb();

  // When no userId is provided, skip DB lookup entirely to avoid leaking
  // another tenant's secrets. Callers without user context will fall back
  // to env-var–only config via resolveIntegrationConfig().
  if (!userId) {
    return [];
  }

  const rows = await db.executeAll(
    "SELECT provider, display_name, config_json, secret_ciphertext FROM integration_settings WHERE user_id = ? ORDER BY provider",
    [userId],
  ) as unknown as Array<{
    provider: IntegrationProviderKey;
    display_name: string | null;
    config_json: string | null;
    secret_ciphertext: string | null;
  }>;

  return rows.map((row) => ({
    provider: row.provider,
    displayName: row.display_name ?? undefined,
    config: row.config_json ? JSON.parse(row.config_json) : undefined,
    secret: row.secret_ciphertext
      ? decryptSecret(row.secret_ciphertext, { userId, provider: row.provider })
      : undefined,
  }));
}

export async function resolveIntegrationConfig(userId?: string) {
  const env = loadEnv();
  const allowOperatorCredentials =
    !userId || env.ALLOW_SHARED_PROVIDER_CREDENTIALS === "1";
  const records = new Map((await listIntegrationRecords(userId)).map((record) => [record.provider, record]));
  const storedCloudflare = records.get("cloudflare");
  // A display-name-only row is metadata, not a tenant override. Partial
  // account/token pairs fail closed instead of mixing tenant and operator data.
  const cloudflare = storedCloudflare
    && (storedCloudflare.config !== undefined || storedCloudflare.secret !== undefined)
    ? validateCloudflareIntegrationRecord(storedCloudflare)
    : undefined;
  const storedPresenton = records.get("presenton");
  // A display-name-only row is metadata, not a tenant override. Treating it as
  // an override would silently suppress an operator-managed renderer.
  const presenton = storedPresenton
    && (storedPresenton.config !== undefined || storedPresenton.secret !== undefined)
    ? validatePresentonIntegrationRecord(storedPresenton, {
        nodeEnv: env.NODE_ENV,
        allowUserProviderEndpoints: env.ALLOW_USER_PROVIDER_ENDPOINTS === "1",
      })
    : undefined;
  const cloudflareAccountId =
    typeof cloudflare?.config?.accountId === "string"
      ? cloudflare.config.accountId
      : undefined;
  const presentonBaseUrl =
    typeof presenton?.config.baseUrl === "string"
      ? presenton.config.baseUrl
      : undefined;
  const presentonTemplate =
    typeof presenton?.config.template === "string"
      ? presenton.config.template
      : undefined;
  const presentonAuthMode = presenton?.authMode;
  const storedPresentonUsername =
    typeof presenton?.config.username === "string"
      ? presenton.config.username
      : undefined;
  const presentonApiKey = presenton
    ? presentonAuthMode === "basic" ? undefined : presenton.secret
    : allowOperatorCredentials ? env.PRESENTON_API_KEY : undefined;
  const presentonAuthUsername = presenton
    ? presentonAuthMode === "basic" ? storedPresentonUsername : undefined
    : allowOperatorCredentials ? env.PRESENTON_AUTH_USERNAME : undefined;
  const presentonAuthPassword = presenton
    ? presentonAuthMode === "basic" ? presenton.secret : undefined
    : allowOperatorCredentials ? env.PRESENTON_AUTH_PASSWORD : undefined;

  return {
    // A stored record is an all-or-nothing override. Never combine a user-controlled
    // endpoint/account with a process-global credential.
    cloudflareAccountId: cloudflare
      ? cloudflareAccountId
      : allowOperatorCredentials ? env.CLOUDFLARE_ACCOUNT_ID : undefined,
    cloudflareApiToken: cloudflare
      ? cloudflare.secret
      : allowOperatorCredentials ? env.CLOUDFLARE_API_TOKEN : undefined,
    deepcrawlApiKey: records.get("deepcrawl")?.secret
      ?? (allowOperatorCredentials ? env.DEEPCRAWL_API_KEY : undefined),
    perplexityApiKey: records.get("perplexity")?.secret
      ?? (allowOperatorCredentials ? env.PERPLEXITY_API_KEY : undefined),
    geminiApiKey: records.get("gemini")?.secret
      ?? (allowOperatorCredentials ? env.GEMINI_API_KEY : undefined),
    openaiApiKey: records.get("openai")?.secret,
    presentonBaseUrl: presenton
      ? presentonBaseUrl
      : allowOperatorCredentials ? env.PRESENTON_BASE_URL : undefined,
    presentonApiKey,
    presentonAuthUsername,
    presentonAuthPassword,
    presentonTemplate: presenton
      ? presentonTemplate
      : allowOperatorCredentials ? env.PRESENTON_TEMPLATE : undefined,
    allowPrivateProviderUrls:
      !presenton
      && (env.NODE_ENV !== "production" || env.ALLOW_PRIVATE_PROVIDER_URLS === "1"),
    plusaiApiKey: records.get("plusai")?.secret
      ?? (allowOperatorCredentials ? env.PLUSAI_API_KEY : undefined),
    alaiApiKey: records.get("alai")?.secret
      ?? (allowOperatorCredentials ? env.ALAI_API_KEY : undefined),
  };
}
