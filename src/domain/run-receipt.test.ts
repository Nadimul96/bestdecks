import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "./artifact-limits";
import {
  EVIDENCE_LEDGER_SCHEMA_VERSION,
  EVIDENCE_RUBRIC_VERSION,
} from "./evidence";
import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  selectRichStaticLayoutIds,
} from "./visual-profile";
import {
  parseRunReceipt,
  sanitizeArtifactReceiptUrl,
  sanitizeReceiptUrl,
} from "./run-receipt";

const runId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";

function richStaticVisualProfileFixture(slideCount: number) {
  const layoutIds = selectRichStaticLayoutIds(slideCount);
  return {
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds,
    measuredRichness: {
      slideCount,
      vectorShapeCount: slideCount * 2,
      styledTextRunCount: slideCount,
      slidesWithBackground: slideCount,
      slidesWithVectorAccents: slideCount,
      distinctLayoutSignatures: new Set(layoutIds).size,
      distinctPaletteColors: 3,
    },
  };
}

function validReceipt() {
  return {
    schemaVersion: 1 as const,
    runId,
    createdAt: "2026-07-13T20:00:03.000Z",
    commitSha: "abcdef1234567",
    evidenceContract: {
      ledgerSchemaVersion: EVIDENCE_LEDGER_SCHEMA_VERSION,
      rubricVersion: EVIDENCE_RUBRIC_VERSION,
    },
    configurationNames: ["gemini.api_key", "cloudflare.api_token"],
    providers: [
      { stage: "crawling", providerId: "cloudflare.crawl", modelId: null, contractVersion: 1 },
      { stage: "enriching", providerId: "perplexity.enrich", modelId: "sonar-pro", contractVersion: 1 },
      { stage: "enriching", providerId: "gemini.brief", modelId: "gemini-2.5-flash", contractVersion: 1 },
      { stage: "planning", providerId: "gemini.plan", modelId: "gemini-2.5-flash", contractVersion: 1 },
      { stage: "rendering", providerId: "presenton.render", modelId: "presenton-managed", contractVersion: 1 },
    ],
    sourceUrls: ["https://example.com/"],
    attempts: [{
      attemptId,
      attemptNumber: 1,
      status: "running",
      startedAt: "2026-07-13T20:00:00.000Z",
    }],
    stageTimings: [{
      stage: "crawling",
      startedAt: "2026-07-13T20:00:00.000Z",
      completedAt: "2026-07-13T20:00:01.000Z",
      durationMs: 1000,
    }],
    terminalState: "delivered",
    targets: [{
      targetId,
      outcome: "delivered",
      evidenceCoverage: { supportedFactualClaims: 1, factualClaims: 1, ratio: 1 },
      claimLedger: {
        sources: [{
          id: "source-1",
          url: "https://example.com/_redacted/source",
          title: "Example source",
          retrievedAt: "2026-07-13T19:59:00.000Z",
          provider: "cloudflare",
        }],
        claims: [{
          id: "claim-1",
          text: "Example publishes a workflow product.",
          claimClass: "external_fact" as const,
          supportStatus: "source_backed" as const,
          citedSourceIds: ["source-1"],
        }],
      },
      unsupportedFactualClaimIds: [],
      readiness: {
        requiredSlideFieldsPresent: true,
        ctaPresent: true,
        evidenceGatePassed: true,
        artifactReadable: true,
        providerProvenancePresent: true,
        visualProfileVerified: true,
      },
      artifact: {
        providerId: "presenton.render",
        presentationId: "presentation-1",
        urls: ["https://presenton.example/artifact.pptx"],
        sha256: "a".repeat(64),
        byteLength: 42,
        verifiedAt: "2026-07-13T20:00:02.000Z",
        contentVerification: {
          method: "pptx_ooxml_rich_static_v2",
          sha256: "b".repeat(64),
          slideCount: 1,
        },
        visualProfile: richStaticVisualProfileFixture(1),
      },
    }],
  };
}

test("run receipt retains exact, auditable delivery evidence", () => {
  const receipt = parseRunReceipt(validReceipt());
  assert.deepEqual(receipt.configurationNames, [
    "cloudflare.api_token",
    "gemini.api_key",
  ]);
  assert.equal(receipt.targets[0]?.artifact?.sha256, "a".repeat(64));
  assert.equal(receipt.evidenceContract.rubricVersion, EVIDENCE_RUBRIC_VERSION);
  assert.equal(receipt.targets[0]?.claimLedger?.claims[0]?.id, "claim-1");
});

test("run receipt retains normalized provider health and usage additively", () => {
  const receipt = validReceipt();
  Reflect.set(receipt.providers[1]!, "health", {
    configured: true,
    reachable: true,
    liveSmokePassed: null,
  });
  Reflect.set(receipt.providers[1]!, "usage", [
    { metric: "input_tokens", unit: "tokens", amount: 120 },
    { metric: "output_tokens", unit: "tokens", amount: 30 },
  ]);

  const parsed = parseRunReceipt(receipt);
  assert.deepEqual(parsed.providers[1]?.health, {
    configured: true,
    reachable: true,
    liveSmokePassed: null,
  });
  assert.deepEqual(parsed.providers[1]?.usage, [
    { metric: "input_tokens", unit: "tokens", amount: 120 },
    { metric: "output_tokens", unit: "tokens", amount: 30 },
  ]);

  const invalid = validReceipt();
  Reflect.set(invalid.providers[0]!, "health", {
    configured: false,
    reachable: false,
    liveSmokePassed: null,
  });
  assert.throws(() => parseRunReceipt(invalid), /unconfigured provider/i);
});

test("run receipt rejects delivery without source-build provenance", () => {
  const receipt = validReceipt();
  Reflect.set(receipt, "commitSha", null);
  assert.throws(() => parseRunReceipt(receipt), /source commit SHA/i);
});

test("run receipt rejects delivery without its versioned claim ledger", () => {
  const receipt = validReceipt();
  Reflect.deleteProperty(receipt.targets[0]!, "claimLedger");
  assert.throws(() => parseRunReceipt(receipt), /claim ledger/i);
});

test("run receipt derives coverage and unsupported IDs from its claim ledger", () => {
  const receipt = validReceipt();
  receipt.targets[0]!.evidenceCoverage = {
    supportedFactualClaims: 0,
    factualClaims: 1,
    ratio: 0,
  };
  assert.throws(() => parseRunReceipt(receipt), /derived from its retained claim ledger/i);

  const unsupportedMismatch = validReceipt();
  Reflect.set(unsupportedMismatch.targets[0]!, "unsupportedFactualClaimIds", ["claim-1"]);
  assert.throws(() => parseRunReceipt(unsupportedMismatch), /Unsupported claim IDs/i);
});

test("run receipt strips secret-bearing query parameters from evidence source URLs", () => {
  const receipt = validReceipt();
  receipt.targets[0]!.claimLedger!.sources[0]!.url = "https://example.com/source?token=secret";
  const parsed = parseRunReceipt(receipt);
  assert.equal(parsed.targets[0]!.claimLedger!.sources[0]!.url, "https://example.com/source");
  assert.doesNotMatch(JSON.stringify(parsed), /token=secret/u);
});

test("run receipt enforces the shared delivery artifact ceiling", () => {
  const maximum = validReceipt();
  maximum.targets[0]!.artifact!.byteLength = MAX_DELIVERY_ARTIFACT_BYTES;
  assert.doesNotThrow(() => parseRunReceipt(maximum));

  const oversized = validReceipt();
  oversized.targets[0]!.artifact!.byteLength = MAX_DELIVERY_ARTIFACT_BYTES + 1;
  assert.throws(() => parseRunReceipt(oversized));
});

test("artifact URL sanitization removes path, query, credentials, and fragment", () => {
  assert.equal(
    sanitizeArtifactReceiptUrl(
      "https://user:pass@presenton.example/customer/acme/secret-token.pdf?id=deck-1&X-Amz-Signature=secret#private",
    ),
    "https://presenton.example/_redacted/artifact",
  );
});

test("run receipt rejects delivery without a readable artifact", () => {
  const receipt = validReceipt();
  receipt.targets[0]!.readiness.artifactReadable = false;
  assert.throws(() => parseRunReceipt(receipt), /fully ready/i);
});

test("run receipt rejects delivery without a verified rich-static profile", () => {
  const unverified = validReceipt();
  unverified.targets[0]!.readiness.visualProfileVerified = false;
  assert.throws(() => parseRunReceipt(unverified), /fully ready/i);

  const mismatched = validReceipt();
  mismatched.targets[0]!.artifact!.contentVerification.slideCount = 2;
  assert.throws(() => parseRunReceipt(mismatched), /same slides/i);
});

test("run receipt rejects rounded or invented evidence coverage", () => {
  const receipt = validReceipt();
  receipt.targets[0]!.evidenceCoverage = {
    supportedFactualClaims: 2,
    factualClaims: 3,
    ratio: 0.67,
  };
  assert.throws(() => parseRunReceipt(receipt), /exact supported\/total fraction/i);
});

test("receipt URL sanitization removes credentials and transient URL data", () => {
  assert.equal(
    sanitizeReceiptUrl("https://user:pass@example.com/customer/acme/token?token=secret#private"),
    "https://example.com/_redacted/source",
  );
});
