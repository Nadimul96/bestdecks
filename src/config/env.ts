import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

import {
  CanonicalOriginError,
  parseCanonicalOrigin,
} from "@/src/config/canonical-origin";
import { CRAWL_PROVIDERS, RESEARCH_PROVIDERS } from "@/src/config/provider-selection";

function optionalEnvironmentValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => value === "" ? undefined : value,
    schema.optional(),
  );
}

const optionalSecretEncryptionKey = optionalEnvironmentValue(
  z.string().min(32).max(8_192),
);

const optionalCanonicalOrigin = optionalEnvironmentValue(z.string().min(1));

const canonicalOriginFields = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "RENDER_EXTERNAL_URL",
] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BESTDECKS_COMMIT_SHA: optionalEnvironmentValue(
    z.string().regex(/^[a-fA-F0-9]{7,64}$/),
  ),
  CRAWL_PROVIDER: optionalEnvironmentValue(z.enum(CRAWL_PROVIDERS)),
  RESEARCH_PROVIDER: optionalEnvironmentValue(z.enum(RESEARCH_PROVIDERS)),
  CLOUDFLARE_ACCOUNT_ID: optionalEnvironmentValue(z.string().min(1)),
  CLOUDFLARE_API_TOKEN: optionalEnvironmentValue(z.string().min(1)),
  DEEPCRAWL_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  PERPLEXITY_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  GEMINI_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  OPENAI_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  PRESENTON_BASE_URL: optionalEnvironmentValue(z.string().url()),
  PRESENTON_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  PRESENTON_AUTH_USERNAME: optionalEnvironmentValue(z.string().trim().min(1).max(256).refine(
    (value) => !value.includes(":"),
    "Presenton Basic auth usernames cannot contain a colon.",
  )),
  PRESENTON_AUTH_PASSWORD: optionalEnvironmentValue(z.string().min(6).max(8_192)),
  PRESENTON_TEMPLATE: optionalEnvironmentValue(z.string().min(1)),
  ALLOW_PRIVATE_PROVIDER_URLS: optionalEnvironmentValue(z.enum(["0", "1"])),
  ALLOW_USER_PROVIDER_ENDPOINTS: optionalEnvironmentValue(z.enum(["0", "1"])),
  ALLOW_SHARED_PROVIDER_CREDENTIALS: optionalEnvironmentValue(z.enum(["0", "1"])),
  PLUSAI_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  ALAI_API_KEY: optionalEnvironmentValue(z.string().min(1)),
  BETTER_AUTH_URL: optionalCanonicalOrigin,
  NEXT_PUBLIC_BETTER_AUTH_URL: optionalCanonicalOrigin,
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  APP_DOMAIN: optionalEnvironmentValue(z.string().trim().min(1).max(253).regex(
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))+$/u,
    "APP_DOMAIN must be a public DNS hostname without a scheme or port.",
  )),
  RENDER_EXTERNAL_URL: optionalCanonicalOrigin,
  ADMIN_NAME: optionalEnvironmentValue(z.string().min(1)),
  ADMIN_EMAIL: optionalEnvironmentValue(z.string().email()),
  ADMIN_PASSWORD: optionalEnvironmentValue(z.string().min(12)),
  SEED_ADMIN_ON_STARTUP: optionalEnvironmentValue(z.enum(["0", "1"])),
  APP_SECRETS_KEY: optionalSecretEncryptionKey,
  APP_SECRETS_KEY_PREVIOUS: optionalSecretEncryptionKey,
  LOCAL_DB_PATH: optionalEnvironmentValue(z.string().min(1)),
  TURSO_DATABASE_URL: optionalEnvironmentValue(z.string().min(1)),
  TURSO_AUTH_TOKEN: optionalEnvironmentValue(z.string().min(1)),
}).superRefine((value, context) => {
  for (const field of canonicalOriginFields) {
    const origin = value[field];
    if (!origin) continue;

    try {
      parseCanonicalOrigin(origin, value.NODE_ENV, field);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof CanonicalOriginError
          ? error.message
          : `${field} is invalid.`,
        path: [field],
      });
    }
  }

  if (value.NODE_ENV === "production" && value.BETTER_AUTH_URL) {
    let authOrigin: string;
    try {
      authOrigin = new URL(value.BETTER_AUTH_URL).origin;
    } catch {
      return;
    }
    if (
      value.NEXT_PUBLIC_BETTER_AUTH_URL
      && (() => {
        try {
          return new URL(value.NEXT_PUBLIC_BETTER_AUTH_URL).origin !== authOrigin;
        } catch {
          return false;
        }
      })()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NEXT_PUBLIC_BETTER_AUTH_URL must equal BETTER_AUTH_URL in production.",
        path: ["NEXT_PUBLIC_BETTER_AUTH_URL"],
      });
    }
    if (value.APP_DOMAIN && authOrigin !== `https://${value.APP_DOMAIN.toLowerCase()}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BETTER_AUTH_URL must equal the HTTPS origin served by APP_DOMAIN.",
        path: ["BETTER_AUTH_URL"],
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

let envLoaded = false;

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  if (!envLoaded) {
    loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
    loadDotenv({ quiet: true });
    envLoaded = true;
  }

  return envSchema.parse(source);
}
