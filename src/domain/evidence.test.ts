import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceClaimSchema,
  evidenceLedgerSchema,
  evaluateEvidence,
  parseEvidenceLedger,
} from "./evidence";

const source = {
  id: "source:company-site",
  url: "https://example.com/about",
  title: "About Example",
  retrievedAt: "2026-07-13T18:30:00-04:00",
  provider: "Cloudflare",
};

test("normalizes and de-duplicates cited source IDs deterministically", () => {
  const ledger = parseEvidenceLedger({
    sources: [
      source,
      {
        ...source,
        id: "SOURCE:NEWS",
        url: "https://news.example.com/example",
        title: "Example expands",
        provider: "Perplexity",
      },
    ],
    claims: [
      {
        id: "CLAIM:GROWTH",
        text: "Example expanded into Canada.",
        claimClass: "external_fact",
        supportStatus: "source_backed",
        citedSourceIds: [
          " source:news ",
          "SOURCE:COMPANY-SITE",
          "source:news",
        ],
      },
    ],
  });

  assert.equal(ledger.sources[1]?.id, "source:news");
  assert.equal(ledger.sources[1]?.provider, "perplexity");
  assert.equal(ledger.sources[0]?.retrievedAt, "2026-07-13T22:30:00.000Z");
  assert.equal(ledger.claims[0]?.id, "claim:growth");
  assert.deepEqual(ledger.claims[0]?.citedSourceIds, [
    "source:company-site",
    "source:news",
  ]);
});

test("rejects a citation to a missing source instead of counting phantom support", () => {
  assert.throws(
    () =>
      parseEvidenceLedger({
        sources: [source],
        claims: [
          {
            id: "claim:missing-source",
            text: "Example doubled revenue.",
            claimClass: "external_fact",
            supportStatus: "source_backed",
            citedSourceIds: ["source:not-retained"],
          },
        ],
      }),
    /cites missing source source:not-retained/i,
  );
});

test("rejects a source-backed factual claim with no citation", () => {
  assert.equal(
    evidenceClaimSchema.safeParse({
      id: "claim:uncited",
      text: "Example has 500 employees.",
      claimClass: "external_fact",
      supportStatus: "source_backed",
      citedSourceIds: [],
    }).success,
    false,
  );
});

test("zero factual claims is not represented as synthetic 100 percent coverage", () => {
  const result = evaluateEvidence({
    sources: [],
    claims: [],
  });

  assert.deepEqual(result.coverage, {
    supportedFactualClaims: 0,
    factualClaims: 0,
    ratio: null,
    percent: null,
  });
  assert.equal(result.deliveryGate.canDeliver, true);
  assert.deepEqual(result.deliveryGate.blockingClaimIds, []);
});

test("seller claims and model inferences are labeled but do not block delivery", () => {
  const result = evaluateEvidence({
    sources: [source],
    claims: [
      {
        id: "claim:seller-proof",
        text: "Our average implementation takes two weeks.",
        claimClass: "seller_claim",
        supportStatus: "seller_supplied",
        citedSourceIds: [],
      },
      {
        id: "claim:inference",
        text: "The operations leader is likely the economic buyer.",
        claimClass: "model_inference",
        supportStatus: "model_inference",
        citedSourceIds: ["source:company-site"],
      },
    ],
  });

  assert.equal(result.deliveryGate.canDeliver, true);
  assert.deepEqual(result.sellerClaimIds, ["claim:seller-proof"]);
  assert.deepEqual(result.modelInferenceClaimIds, ["claim:inference"]);
  assert.deepEqual(result.claimLabels, [
    {
      claimId: "claim:inference",
      claimClass: "model_inference",
      label: "model-inference",
    },
    {
      claimId: "claim:seller-proof",
      claimClass: "seller_claim",
      label: "seller-supplied",
    },
  ]);
});

test("only unsupported factual claims block delivery", () => {
  const result = evaluateEvidence({
    sources: [source],
    claims: [
      {
        id: "claim:supported",
        text: "Example publishes an API.",
        claimClass: "external_fact",
        supportStatus: "source_backed",
        citedSourceIds: ["source:company-site"],
      },
      {
        id: "claim:unsupported-z",
        text: "Example is the market leader.",
        claimClass: "external_fact",
        supportStatus: "unsupported",
        citedSourceIds: [],
      },
      {
        id: "claim:unsupported-a",
        text: "Example will double revenue next year.",
        claimClass: "external_fact",
        supportStatus: "unsupported",
        citedSourceIds: ["source:company-site"],
      },
    ],
  });

  assert.deepEqual(result.coverage, {
    supportedFactualClaims: 1,
    factualClaims: 3,
    ratio: 1 / 3,
    percent: 33.3,
  });
  assert.equal(result.deliveryGate.canDeliver, false);
  assert.deepEqual(result.unsupportedFactualClaimIds, [
    "claim:unsupported-a",
    "claim:unsupported-z",
  ]);
  assert.deepEqual(
    result.deliveryGate.blockingClaimIds,
    result.unsupportedFactualClaimIds,
  );
});

test("rounding cannot satisfy the exact 100 percent delivery threshold", () => {
  const supportedClaims = Array.from({ length: 2_499 }, (_, index) => ({
    id: `claim:supported-${String(index).padStart(4, "0")}`,
    text: `Retained factual claim ${index}.`,
    claimClass: "external_fact" as const,
    supportStatus: "source_backed" as const,
    citedSourceIds: ["source:company-site"],
  }));

  const result = evaluateEvidence({
    sources: [source],
    claims: [
      ...supportedClaims,
      {
        id: "claim:unsupported",
        text: "One remaining unsupported factual claim.",
        claimClass: "external_fact",
        supportStatus: "unsupported",
        citedSourceIds: [],
      },
    ],
  });

  assert.equal(result.coverage.ratio, 2_499 / 2_500);
  assert.equal(result.coverage.percent, 99.9);
  assert.equal(result.deliveryGate.requiredCoverageRatio, 1);
  assert.equal(result.deliveryGate.canDeliver, false);
  assert.deepEqual(result.deliveryGate.blockingClaimIds, ["claim:unsupported"]);
});

test("normalized ID collisions are rejected for both sources and claims", () => {
  const result = evidenceLedgerSchema.safeParse({
    sources: [source, { ...source, id: "SOURCE:COMPANY-SITE" }],
    claims: [
      {
        id: "CLAIM:ONE",
        text: "First claim.",
        claimClass: "seller_claim",
        supportStatus: "seller_supplied",
        citedSourceIds: [],
      },
      {
        id: "claim:one",
        text: "Second claim.",
        claimClass: "seller_claim",
        supportStatus: "seller_supplied",
        citedSourceIds: [],
      },
    ],
  });

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  const messages = result.error.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => /duplicate source id/i.test(message)));
  assert.ok(messages.some((message) => /duplicate claim id/i.test(message)));
});
