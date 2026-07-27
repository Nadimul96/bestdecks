import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { selectRichStaticLayoutIds } from "@/src/domain/visual-profile";
import { CloudflareCrawler } from "@/src/integrations/cloudflare";
import { PerplexityEnrichmentProvider } from "@/src/integrations/perplexity";
import { PresentonDeckProvider } from "@/src/integrations/presenton";
import type { DeckGenerationInput } from "@/src/integrations/providers";
import { AiBriefBuilder } from "@/src/server/ai-brief-builder";
import { SlidePlanner } from "@/src/server/slide-planner";

const crawlRequest = {
  websiteUrl: "https://target.example.com",
  requestedFormats: ["markdown" as const],
};

const sellerBrief = {
  positioningSummary: "Evidence-backed proposals",
  offerSummary: "Research-backed decks",
  proofPoints: ["Seller supplied proof"],
  preferredAngles: ["Evidence first"],
};

const companyBrief = {
  websiteUrl: "https://target.example.com",
  companyName: "Target",
  industry: "Software",
  offer: "Workflow software",
  painPoints: [],
  proofPoints: [],
  pitchAngles: [],
  sourceUrls: ["https://target.example.com"],
};

const deckInput: DeckGenerationInput = {
  companyBrief,
  sellerPositioningSummary: sellerBrief.positioningSummary,
  archetype: "cold_outreach",
  objective: "Book a call",
  audience: "Founder",
  cardCount: 1,
  callToAction: "Book a call",
  tone: "consultative",
  visualStyle: "premium_modern",
  mustInclude: [],
  mustAvoid: [],
  outputFormat: "pptx",
  imagePolicy: "never",
  visualContentTypes: [],
  visualDensity: "rich",
};

async function assertFetchOperationAborts(
  operation: (signal: AbortSignal) => Promise<unknown>,
) {
  const originalFetch = globalThis.fetch;
  let capturedSignal: AbortSignal | undefined;
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      capturedSignal = init?.signal ?? undefined;
      notifyStarted();
      if (!capturedSignal) {
        reject(new Error("Provider request omitted its abort signal."));
        return;
      }
      capturedSignal.addEventListener("abort", () => {
        reject(capturedSignal?.reason ?? new Error("aborted"));
      }, { once: true });
    })) as typeof fetch;

  try {
    const controller = new AbortController();
    const pending = operation(controller.signal);
    await started;
    controller.abort(new Error("test cancellation"));
    await assert.rejects(pending);
    assert.equal(capturedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Cloudflare start and resume HTTP calls observe the worker abort signal", async () => {
  const crawler = new CloudflareCrawler({
    accountId: "account_1",
    apiToken: "fixture-value",
    maxRetries: 0,
    pollDelayMs: 0,
  });
  await assertFetchOperationAborts((signal) => crawler.startCrawl(crawlRequest, { signal }));
  await assertFetchOperationAborts((signal) =>
    crawler.resumeCrawl("existing-job", crawlRequest, { signal })
  );
});

test("Perplexity and both Gemini generation paths observe the worker abort signal", async () => {
  const perplexity = new PerplexityEnrichmentProvider("fixture-value", undefined, {
    maxRetries: 0,
  });
  await assertFetchOperationAborts((signal) => perplexity.enrichCompany({
    websiteUrl: companyBrief.websiteUrl,
    companyName: companyBrief.companyName,
    sellerPositioningSummary: sellerBrief.positioningSummary,
    requestedSignals: ["recent activity"],
  }, { signal }));

  const briefBuilder = new AiBriefBuilder("fixture-value", undefined, { maxRetries: 0 });
  await assertFetchOperationAborts((signal) => briefBuilder.buildCompanyBrief({
    target: { websiteUrl: companyBrief.websiteUrl, companyName: companyBrief.companyName },
    sellerBrief,
    crawlMarkdown: "# Target",
    sourceUrls: companyBrief.sourceUrls,
    enrichmentSummary: "No retained external claims.",
  }, { signal }));

  const planner = new SlidePlanner("fixture-value", undefined, { maxRetries: 0 });
  await assertFetchOperationAborts((signal) => planner.planSlides({
    companyBrief,
    sellerBrief,
    deckInput,
  }, { signal }));
});

async function assertPresentonOperationAborts(
  operation: (
    provider: PresentonDeckProvider,
    signal: AbortSignal,
    baseUrl: string,
  ) => Promise<unknown>,
) {
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const server = createServer((request) => {
    request.resume();
    notifyStarted();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const provider = new PresentonDeckProvider({
    baseUrl,
    basicAuthUsername: "fixture-user",
    basicAuthPassword: "fixture-value",
    allowPrivateNetwork: true,
  });

  try {
    const controller = new AbortController();
    const pending = operation(provider, controller.signal, baseUrl);
    await started;
    controller.abort(new Error("test cancellation"));
    await assert.rejects(pending);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("Presenton generation and artifact HTTP calls observe the worker abort signal", async () => {
  await assertPresentonOperationAborts((provider, signal) => provider.createDeck(
    deckInput,
    [],
    {
      exactSlides: [{ headline: "Book a call", bulletPoints: [] }],
      layoutIds: selectRichStaticLayoutIds(deckInput.cardCount),
      signal,
    },
  ));
  await assertPresentonOperationAborts((provider, signal, baseUrl) => provider.verifyArtifact({
    presentationId: "presentation-1",
    exportUrl: `${baseUrl}/artifact.pptx`,
  }, {
    expectedSlides: [{ headline: "Book a call", bulletPoints: [] }],
    layoutIds: selectRichStaticLayoutIds(1),
    signal,
  }));
});
