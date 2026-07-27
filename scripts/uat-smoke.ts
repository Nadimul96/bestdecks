import assert from "node:assert/strict";
import { chmodSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.UAT_BASE_URL ?? "http://localhost:3001";
const outputDir = resolve(process.cwd(), "output/playwright");

function requireUatCredential(name: "UAT_EMAIL" | "UAT_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Use an isolated UAT account; never a personal account.`);
  }
  return value;
}

async function setHash(page: import("playwright").Page, hash: string) {
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await page.waitForFunction(
    (expectedHash) => window.location.hash === expectedHash,
    hash,
  );
}

async function capturePrivateScreenshot(
  page: import("playwright").Page,
  filename: string,
) {
  const path = resolve(outputDir, filename);
  await page.screenshot({ path, fullPage: true });
  chmodSync(path, 0o600);
}

async function run() {
  const email = requireUatCredential("UAT_EMAIL");
  const password = requireUatCredential("UAT_PASSWORD");

  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${baseUrl}/console`, { timeout: 20000 });
    await capturePrivateScreenshot(page, "uat-overview.png");

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
    await page.getByLabel("Output format").selectOption("pptx");
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
      .getByRole("link", { name: /Download/i })
      .first()
      .waitFor({ timeout: 180000 });

    const downloadHref = await page
      .getByRole("link", { name: /Download/i })
      .first()
      .getAttribute("href");
    assert.match(downloadHref ?? "", /^\/api\/delivery\/[^/]+\/download$/u);

    await capturePrivateScreenshot(page, "uat-delivery.png");
  } finally {
    await context.close();
    await browser.close();
  }
}

void run().catch(() => {
  console.error("UAT smoke test failed. Review the generated screenshots.");
  process.exitCode = 1;
});
