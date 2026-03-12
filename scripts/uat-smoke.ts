import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.UAT_BASE_URL ?? "http://localhost:3001";
const outputDir = resolve(process.cwd(), "output/playwright");

async function setHash(page: import("playwright").Page, hash: string) {
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await page.waitForFunction(
    (expectedHash) => window.location.hash === expectedHash,
    hash,
  );
}

async function run() {
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill("nadimul96@gmail.com");
    await page.getByLabel("Password").fill("Nazmul89?");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${baseUrl}/`, { timeout: 20000 });
    await page.screenshot({ path: resolve(outputDir, "uat-overview.png"), fullPage: true });

    await setHash(page, "#onboarding");
    await page.getByLabel("Company").fill("Bestdecks");
    await page.getByLabel("Primary website").fill("https://bestdecks.co");
    await page.getByRole("button", { name: "Save workspace" }).click();
    await page.getByText("Workspace state saved.").waitFor({ timeout: 15000 });

    await setHash(page, "#seller-context");
    await page.getByLabel("Seller website").fill("https://bestdecks.co");
    await page.getByLabel("Company name").fill("Bestdecks");
    await page
      .getByLabel("Desired outcome")
      .fill("Book qualified intro calls with researched outbound decks");
    await page
      .getByLabel("Offer summary")
      .fill(
        "Bestdecks builds evidence-backed outreach decks from company website research and recent external signals.",
      );
    await page
      .getByLabel("Services")
      .fill("Website crawl research\nPer-account briefs\nOutbound presentation generation");
    await page.getByLabel("Ideal customer").fill("Growth leaders at service businesses");
    await page
      .getByLabel("Differentiators")
      .fill("Evidence-first outreach\nOne company per row\nOperator review when needed");
    await page
      .getByLabel("Proof points")
      .fill("Cloudflare crawl\nPerplexity enrichment\nPresenton delivery");
    await page
      .getByLabel("Constraints")
      .fill("Use one output format per run\nKeep the CTA narrow");
    await page.getByRole("button", { name: "Save seller context" }).click();
    await page.getByText("Workspace state saved.").waitFor({ timeout: 15000 });

    await setHash(page, "#run-settings");
    await page.getByLabel("Audience").fill("Founder or Head of Growth");
    await page.getByLabel("Call to action").fill("Book a 20-minute intro call");
    await page
      .getByLabel("Goal")
      .fill(
        "Convince the target company to explore a tailored outbound campaign grounded in its website evidence.",
      );
    await page.getByLabel("Card count").fill("6");
    await page.getByLabel("Image policy").selectOption("never");
    await page.getByLabel("Output format").selectOption("presenton_editor");
    await page
      .getByLabel("Must include")
      .fill("Specific website observations\nClear next step");
    await page.getByRole("button", { name: "Save run settings" }).click();
    await page.getByText("Workspace state saved.").waitFor({ timeout: 15000 });

    await setHash(page, "#target-intake");
    await page.getByLabel("Paste websites").fill("https://example.com");
    await page.getByLabel("Contacts CSV").fill("");
    await page.getByRole("button", { name: "Normalize rows" }).click();
    await page.getByText("Normalized 1 target row.").waitFor({ timeout: 15000 });
    await page.getByText("1 normalized rows").waitFor({ timeout: 15000 });

    await setHash(page, "#delivery");
    await page.getByRole("button", { name: "Launch new batch generation" }).click();
    await page.getByText(/Run .* launched\./).waitFor({ timeout: 20000 });
    await page
      .getByRole("link", { name: /Editor/i })
      .first()
      .waitFor({ timeout: 180000 });

    const editorHref = await page
      .getByRole("link", { name: /Editor/i })
      .first()
      .getAttribute("href");
    assert.ok(editorHref?.includes("localhost:5050/presentation?id="));

    await page.screenshot({ path: resolve(outputDir, "uat-delivery.png"), fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
