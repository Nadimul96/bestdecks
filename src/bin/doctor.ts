import { loadEnv } from "../config/env";
import { buildAllProviderStatuses } from "../server/reference-provider-health";

async function main() {
  const env = loadEnv();

  console.log(
    JSON.stringify(
      {
        providers: buildAllProviderStatuses({
          cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
          cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
          perplexityApiKey: env.PERPLEXITY_API_KEY,
          geminiApiKey: env.GEMINI_API_KEY,
          deepcrawlApiKey: env.DEEPCRAWL_API_KEY,
          alaiApiKey: env.ALAI_API_KEY,
          plusAiApiKey: env.PLUSAI_API_KEY,
          presentonBaseUrl: env.PRESENTON_BASE_URL,
          presentonApiKey: env.PRESENTON_API_KEY,
          presentonAuthUsername: env.PRESENTON_AUTH_USERNAME,
          presentonAuthPassword: env.PRESENTON_AUTH_PASSWORD,
          presentonTemplate: env.PRESENTON_TEMPLATE,
          allowPrivateProviderUrls:
            env.NODE_ENV !== "production" || env.ALLOW_PRIVATE_PROVIDER_URLS === "1",
        }),
      },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error("Environment diagnostics failed.");
  process.exitCode = 1;
});
