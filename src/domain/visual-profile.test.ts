import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isRichStaticQuestionnaire,
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  selectRichStaticLayoutIds,
  visualProfileVerificationSchema,
} from "./visual-profile";

test("rich-static manifest hash and layout selection are deterministic", () => {
  const checkedInManifest = JSON.parse(readFileSync(
    new URL("../../deploy/presenton/rich-static-v1.manifest.json", import.meta.url),
    "utf8",
  )) as unknown;
  assert.deepEqual(checkedInManifest, RICH_STATIC_VISUAL_PROFILE);
  assert.equal(
    createHash("sha256").update(JSON.stringify(RICH_STATIC_VISUAL_PROFILE)).digest("hex"),
    RICH_STATIC_VISUAL_PROFILE_SHA256,
  );
  assert.deepEqual(selectRichStaticLayoutIds(6), [
    "bestdecks_split_panel_v1",
    "bestdecks_card_grid_v1",
    "bestdecks_index_grid_v1",
    "bestdecks_spotlight_v1",
    "bestdecks_split_panel_v1",
    "bestdecks_card_grid_v1",
  ]);
  assert.equal(
    RICH_STATIC_VISUAL_PROFILE.rendererMode,
    "deterministic_create_update_export_v1",
  );
  assert.equal(
    RICH_STATIC_VISUAL_PROFILE.upstreamPackageProfileId,
    "python_pptx_2013_static_v1",
  );
  assert.equal(RICH_STATIC_VISUAL_PROFILE.templateId, "bestdecks_inline_vector_v1");
  assert.equal(RICH_STATIC_VISUAL_PROFILE.themeId, "bestdecks_green_v1");
  assert.deepEqual(RICH_STATIC_VISUAL_PROFILE.fontFamilies, ["Arial"]);
  assert.match(RICH_STATIC_VISUAL_PROFILE.templateSha256, /^[a-f0-9]{64}$/u);
  assert.match(RICH_STATIC_VISUAL_PROFILE_SHA256, /^[a-f0-9]{64}$/u);
});

test("rich-static questionnaire rejects generated-media or minimal fallbacks", () => {
  assert.equal(isRichStaticQuestionnaire({
    imagePolicy: "never",
    visualContentTypes: [],
    visualDensity: "rich",
  }), true);
  assert.equal(isRichStaticQuestionnaire({
    imagePolicy: "auto",
    visualContentTypes: [],
    visualDensity: "rich",
  }), false);
  assert.equal(isRichStaticQuestionnaire({
    imagePolicy: "never",
    visualContentTypes: [],
    visualDensity: "minimal",
  }), false);
});

test("rich-static receipt requires measured richness on every slide", () => {
  const base = {
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds: selectRichStaticLayoutIds(2),
    measuredRichness: {
      slideCount: 2,
      vectorShapeCount: 6,
      styledTextRunCount: 2,
      slidesWithBackground: 2,
      slidesWithVectorAccents: 2,
      distinctLayoutSignatures: 2,
      distinctPaletteColors: 3,
    },
  };
  assert.equal(visualProfileVerificationSchema.safeParse(base).success, true);
  assert.equal(visualProfileVerificationSchema.safeParse({
    ...base,
    measuredRichness: { ...base.measuredRichness, slidesWithVectorAccents: 1 },
  }).success, false);
});

test("rich-static layout selection rejects invalid cardinalities", () => {
  for (const count of [0, -1, 1.5, 61, Number.NaN]) {
    assert.throws(() => selectRichStaticLayoutIds(count), RangeError);
  }
});
