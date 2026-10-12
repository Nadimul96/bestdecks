import assert from "node:assert/strict";
import test from "node:test";

import { projectClaimLedger } from "./claim-ledger-view";

const source = {
  id: "source:about",
  url: "https://northwind.example.com/about?utm_source=x",
  title: "About Northwind Freight",
  retrievedAt: "2026-10-01T12:00:00.000Z",
  provider: "builtin",
};

function ledger(extraClaims: unknown[] = []) {
  return {
    sources: [source],
    claims: [
      {
        id: "claim:fact",
        text: "Northwind operates 48 refrigerated cross-dock facilities.",
        claimClass: "external_fact",
        supportStatus: "source_backed",
        citedSourceIds: ["source:about"],
      },
      {
        id: "claim:seller",
        text: "We cut route planning time in half for regional carriers.",
        claimClass: "seller_claim",
        supportStatus: "seller_supplied",
        citedSourceIds: [],
      },
      {
        id: "claim:inference",
        text: "[Inference] Expansion likely strains dispatch coordination.",
        claimClass: "model_inference",
        supportStatus: "model_inference",
        citedSourceIds: [],
      },
      ...extraClaims,
    ],
  };
}

test("the ledger view mirrors the gate's labels and resolves citations", () => {
  const view = projectClaimLedger(ledger());
  assert.ok(view);
  assert.equal(view.canDeliver, true);
  assert.deepEqual(view.counts, {
    "source-backed": 1,
    "seller-supplied": 1,
    "model-inference": 1,
    unsupported: 0,
  });
  assert.deepEqual(view.coverage, { supported: 1, factual: 1 });
  assert.deepEqual(view.claims[0]?.citations, [{
    title: "About Northwind Freight",
    url: "https://northwind.example.com/about",
  }]);
});

test("an unsupported factual claim blocks delivery in the view", () => {
  const view = projectClaimLedger(ledger([{
    id: "claim:unsupported",
    text: "[Unsupported] Northwind is losing customers to a competitor.",
    claimClass: "external_fact",
    supportStatus: "unsupported",
    citedSourceIds: [],
  }]));
  assert.ok(view);
  assert.equal(view.canDeliver, false);
  assert.equal(view.counts.unsupported, 1);
  assert.deepEqual(view.coverage, { supported: 1, factual: 2 });
  assert.equal(view.claims.at(-1)?.label, "unsupported");
});

test("an invalid ledger projects to null instead of throwing", () => {
  assert.equal(projectClaimLedger({ sources: [], claims: [{ id: "x" }] }), null);
  assert.equal(projectClaimLedger(undefined), null);
});
