import { loadEnv } from "@/src/config/env";
import { decryptSecret } from "@/src/server/crypto";
import { getDb } from "@/src/server/db";

export type IntegrationProviderKey =
  | "cloudflare"
  | "deepcrawl"
  | "perplexity"
  | "gemini"
  | "presenton";

export interface IntegrationRecord {
  provider: IntegrationProviderKey;
  displayName?: string;
  config?: Record<string, unknown>;
  secret?: string;
}

export function listIntegrationRecords(): IntegrationRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT provider, display_name, config_json, secret_ciphertext FROM integration_settings ORDER BY provider",
    )
    .all() as Array<{
      provider: IntegrationProviderKey;
      display_name: string | null;
      config_json: string | null;
      secret_ciphertext: string | null;
    }>;

  return rows.map((row) => ({
    provider: row.provider,
    displayName: row.display_name ?? undefined,
    config: row.config_json ? JSON.parse(row.config_json) : undefined,
    secret: row.secret_ciphertext ? decryptSecret(row.secret_ciphertext) : undefined,
  }));
}

export function resolveIntegrationConfig() {
  const env = loadEnv();
  const records = new Map(listIntegrationRecords().map((record) => [record.provider, record]));
  const cloudflare = records.get("cloudflare");
  const presenton = records.get("presenton");

  return {
    cloudflareAccountId:
      (cloudflare?.config?.accountId as string | undefined) ?? env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: cloudflare?.secret ?? env.CLOUDFLARE_API_TOKEN,
    deepcrawlApiKey: records.get("deepcrawl")?.secret ?? env.DEEPCRAWL_API_KEY,
    perplexityApiKey: records.get("perplexity")?.secret ?? env.PERPLEXITY_API_KEY,
    geminiApiKey: records.get("gemini")?.secret ?? env.GEMINI_API_KEY,
    presentonBaseUrl:
      (presenton?.config?.baseUrl as string | undefined) ?? env.PRESENTON_BASE_URL,
    presentonApiKey: presenton?.secret ?? env.PRESENTON_API_KEY,
    presentonTemplate:
      (presenton?.config?.template as string | undefined) ?? env.PRESENTON_TEMPLATE,
  };
}
