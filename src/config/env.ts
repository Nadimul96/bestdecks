import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  DEEPCRAWL_API_KEY: z.string().min(1).optional(),
  PERPLEXITY_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PRESENTON_BASE_URL: z.string().url().optional(),
  PRESENTON_API_KEY: z.string().min(1).optional(),
  PRESENTON_TEMPLATE: z.string().min(1).optional(),
  PLUSAI_API_KEY: z.string().min(1).optional(),
  ALAI_API_KEY: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  APP_SECRETS_KEY: z.string().min(1).optional(),
  LOCAL_DB_PATH: z.string().min(1).optional(),
  TURSO_DATABASE_URL: z.string().min(1).optional(),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),
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
