import { BuiltinCrawler } from "../integrations/builtin-crawler";

/**
 * Live, key-free smoke for the built-in crawler. Usage:
 *   pnpm smoke:crawl https://www.example.com/
 */
async function main() {
  const websiteUrl = process.argv[2] ?? "https://www.apache.org/";
  const result = await new BuiltinCrawler().crawlSite({
    websiteUrl,
    maxPages: 5,
    maxDepth: 1,
    source: "all",
    requestedFormats: ["markdown"],
  });

  console.log(JSON.stringify({
    provider: result.provider,
    pages: result.pages.map((page) => ({
      url: page.url,
      title: page.title ?? null,
      retainedCharacters: page.markdown?.length ?? 0,
    })),
    blockedByRobots: result.blockedUrls.length,
    discoveredUrls: result.discoveredUrls.length,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Built-in crawl smoke failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
