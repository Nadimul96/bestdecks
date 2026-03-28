import { loadEnv } from "../config/env";

function status(flag: boolean) {
  return flag ? "configured" : "missing";
}

async function main() {
  const env = loadEnv();

  console.log(
    JSON.stringify(
      {
        cloudflare: {
          accountId: status(Boolean(env.CLOUDFLARE_ACCOUNT_ID)),
          apiToken: status(Boolean(env.CLOUDFLARE_API_TOKEN)),
        },
        deepcrawl: {
          apiKey: status(Boolean(env.DEEPCRAWL_API_KEY)),
        },
        perplexity: {
          apiKey: status(Boolean(env.PERPLEXITY_API_KEY)),
        },
        gemini: {
          apiKey: status(Boolean(env.GEMINI_API_KEY)),
        },
        presenton: {
          baseUrl: status(Boolean(env.PRESENTON_BASE_URL)),
          apiKey: status(Boolean(env.PRESENTON_API_KEY)),
          template: status(Boolean(env.PRESENTON_TEMPLATE)),
        },
        plusai: {
          apiKey: status(Boolean(env.PLUSAI_API_KEY)),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
