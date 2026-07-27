import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeQuestionnaireAnswers,
  questionnairePrompts,
  type RawQuestionnaireAnswers,
} from "./questionnaire";

const VALID_RAW: RawQuestionnaireAnswers = {
  goal: "Drive sales",
  audience: "CTOs",
  deckType: "cold_outreach",
  outputFormat: "google_slides",
  tone: "consultative",
  cardCount: 8,
  callToAction: "Book a demo",
  visualStyle: "minimal",
  imagePolicy: "auto",
  mustInclude: ["ROI section"],
  mustAvoid: ["Competitor names"],
  extraInstructions: "Keep it short",
  optionalReview: true,
  allowUserApprovedCrawlException: false,
};

test("normalizeQuestionnaireAnswers maps raw fields to schema fields", () => {
  const result = normalizeQuestionnaireAnswers(VALID_RAW);

  assert.equal(result.archetype, "cold_outreach");
  assert.equal(result.audience, "CTOs");
  assert.equal(result.objective, "Drive sales");
  assert.equal(result.callToAction, "Book a demo");
  assert.equal(result.outputFormat, "google_slides");
  assert.equal(result.desiredCardCount, 8);
  assert.equal(result.tone, "consultative");
  assert.equal(result.visualStyle, "minimal");
  assert.equal(result.imagePolicy, "auto");
  assert.deepEqual(result.mustInclude, ["ROI section"]);
  assert.deepEqual(result.mustAvoid, ["Competitor names"]);
  assert.equal(result.extraInstructions, "Keep it short");
  assert.equal(result.optionalReview, true);
  assert.equal(result.allowUserApprovedCrawlException, false);
});

test("normalizeQuestionnaireAnswers defaults arrays when omitted", () => {
  const minimal: RawQuestionnaireAnswers = {
    ...VALID_RAW,
    mustInclude: [],
    mustAvoid: [],
    extraInstructions: undefined,
  };
  const result = normalizeQuestionnaireAnswers(minimal);

  assert.deepEqual(result.mustInclude, []);
  assert.deepEqual(result.mustAvoid, []);
  assert.equal(result.extraInstructions, undefined);
});

test("normalizeQuestionnaireAnswers throws on invalid archetype", () => {
  const bad = { ...VALID_RAW, deckType: "invalid_type" } as unknown as RawQuestionnaireAnswers;
  assert.throws(() => normalizeQuestionnaireAnswers(bad));
});

test("normalizeQuestionnaireAnswers throws on card count out of range", () => {
  assert.throws(() =>
    normalizeQuestionnaireAnswers({ ...VALID_RAW, cardCount: 2 }),
  );
  assert.throws(() =>
    normalizeQuestionnaireAnswers({ ...VALID_RAW, cardCount: 25 }),
  );
});

test("questionnairePrompts contains expected prompt IDs", () => {
  const ids = questionnairePrompts.map((p) => p.id);
  assert.ok(ids.includes("goal"));
  assert.ok(ids.includes("audience"));
  assert.ok(ids.includes("deckType"));
  assert.ok(ids.includes("outputFormat"));
  assert.ok(ids.includes("tone"));
  assert.ok(ids.includes("cardCount"));
  assert.ok(ids.includes("callToAction"));
  assert.ok(ids.includes("visualStyle"));
  assert.ok(ids.includes("imagePolicy"));
  assert.ok(ids.includes("mustInclude"));
  assert.ok(ids.includes("mustAvoid"));
  assert.ok(ids.includes("extraInstructions"));
});

test("each questionnaire prompt has label and prompt text", () => {
  for (const prompt of questionnairePrompts) {
    assert.ok(prompt.label.length > 0, `Prompt ${prompt.id} is missing label`);
    assert.ok(prompt.prompt.length > 0, `Prompt ${prompt.id} is missing prompt text`);
  }
});
