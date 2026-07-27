import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

import {
  CanonicalOriginError,
  parseCanonicalOrigin,
} from "@/src/config/canonical-origin";

const optionalSecretEncryptionKey = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(32).max(8_192).optional(),
);

const optionalCanonicalOrigin = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const canonicalOriginFields = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "RENDER_EXTERNAL_URL",
] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BESTDECKS_COMMIT_SHA: z.string().regex(/^[a-fA-F0-9]{7,64}$/).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  DEEPCRAWL_API_KEY: z.string().min(1).optional(),
  PERPLEXITY_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PRESENTON_BASE_URL: z.string().url().optional(),
  PRESENTON_API_KEY: z.string().min(1).optional(),
  PRESENTON_AUTH_USERNAME: z.string().trim().min(1).max(256).refine(
    (value) => !value.includes(":"),
    "Presenton Basic auth usernames cannot contain a colon.",
  ).optional(),
  PRESENTON_AUTH_PASSWORD: z.string().min(6).max(8_192).optional(),
  PRESENTON_TEMPLATE: z.string().min(1).optional(),
  ALLOW_PRIVATE_PROVIDER_URLS: z.enum(["0", "1"]).optional(),
  ALLOW_USER_PROVIDER_ENDPOINTS: z.enum(["0", "1"]).optional(),
  ALLOW_SHARED_PROVIDER_CREDENTIALS: z.enum(["0", "1"]).optional(),
  PLUSAI_API_KEY: z.string().min(1).optional(),
  ALAI_API_KEY: z.string().min(1).optional(),
  BETTER_AUTH_URL: optionalCanonicalOrigin,
  NEXT_PUBLIC_BETTER_AUTH_URL: optionalCanonicalOrigin,
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  APP_DOMAIN: z.string().trim().min(1).max(253).regex(
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))+$/u,
    "APP_DOMAIN must be a public DNS hostname without a scheme or port.",
  ).optional(),
  RENDER_EXTERNAL_URL: optionalCanonicalOrigin,
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_ADMIN_ON_STARTUP: z.enum(["0", "1"]).optional(),
  APP_SECRETS_KEY: optionalSecretEncryptionKey,
  APP_SECRETS_KEY_PREVIOUS: optionalSecretEncryptionKey,
  LOCAL_DB_PATH: z.string().min(1).optional(),
  TURSO_DATABASE_URL: z.string().min(1).optional(),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),
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
