import { loadEnv } from "../config/env";
import { CloudflareCrawler } from "../integrations/cloudflare";

async function main() {
  const env = loadEnv();
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }

  const crawler = new CloudflareCrawler({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    pollDelayMs: 3000,
    maxPollAttempts: 60,
  });

  const result = await crawler.crawlSite({
    websiteUrl: "https://example.com",
    maxPages: 3,
    maxDepth: 1,
    requestedFormats: ["markdown"],
  });

  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        status: result.status,
        pages: result.pages.length,
        blockedUrls: result.blockedUrls.length,
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
