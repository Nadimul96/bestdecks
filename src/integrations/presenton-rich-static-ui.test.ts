import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  RICH_STATIC_VISUAL_PROFILE,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";
import {
  buildPresentonRichStaticSlides,
  PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS,
  PRESENTON_RICH_STATIC_LAYOUT_GROUP,
  PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
  PRESENTON_RICH_STATIC_SLIDE_WIDTH,
  PRESENTON_RICH_STATIC_UI_TEMPLATE_SHA256,
  PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC,
  presentonRichStaticSlideSchema,
  presentonRichStaticSlidesInputSchema,
  type PresentonRichStaticSlidesInput,
} from "./presenton-rich-static-ui";

const PRESENTATION_ID = "11111111-1111-4111-8111-111111111111";
const SLIDE_IDS = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];

function fixtureInput(): PresentonRichStaticSlidesInput {
  return {
    presentationId: PRESENTATION_ID,
    slideIds: [...SLIDE_IDS],
    slides: [
      { headline: "A precise opening claim", bulletPoints: [] },
      { headline: "One proof point", bulletPoints: ["Evidence remains visible and exact."] },
      {
        headline: "Two complementary signals",
        bulletPoints: ["The first signal is source-backed.", "The second signal sharpens the decision."],
      },
      {
        headline: "Three concise reasons to act",
        bulletPoints: [
          "The problem is measurable.",
          "The intervention is specific.",
          "The next step is reversible.",
        ],
      },
    ],
    layoutIds: selectRichStaticLayoutIds(4),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertDeepFrozen(value: unknown) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function overlaps(
  left: { position: { x: number; y: number }; size: { width: number; height: number } },
  right: { position: { x: number; y: number }; size: { width: number; height: number } },
) {
  return left.position.x < right.position.x + right.size.width
    && right.position.x < left.position.x + left.size.width
    && left.position.y < right.position.y + right.size.height
    && right.position.y < left.position.y + left.size.height;
}

test("rich-static UI template and layout attestations have stable canonical hashes", () => {
  assertDeepFrozen(PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC))
      .digest("hex"),
    PRESENTON_RICH_STATIC_UI_TEMPLATE_SHA256,
  );
  assert.equal(
    PRESENTON_RICH_STATIC_UI_TEMPLATE_SHA256,
    RICH_STATIC_VISUAL_PROFILE.templateSha256,
  );
  assert.equal(
    PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC.fontFamily,
    RICH_STATIC_VISUAL_PROFILE.fontFamilies[0],
  );
  assert.deepEqual(
    Object.keys(PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS),
    [...RICH_STATIC_VISUAL_PROFILE.layoutIds],
  );
  const profilePalette = new Set<string>(RICH_STATIC_VISUAL_PROFILE.palette);
  for (const color of Object.values(PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC.colors)) {
    assert.equal(profilePalette.has(color.slice(1)), true);
  }
  const layoutHashes = Object.values(PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS).map(
    (layout) => createHash("sha256").update(JSON.stringify(layout)).digest("hex"),
  );
  assert.equal(new Set(layoutHashes).size, RICH_STATIC_VISUAL_PROFILE.layoutIds.length);
});

test("builder is deterministic, caller-ID-bound, and does not mutate input", () => {
  const input = fixtureInput();
  const before = structuredClone(input);
  const first = buildPresentonRichStaticSlides(input);
  const second = buildPresentonRichStaticSlides(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(first.length, input.slides.length);

  first.forEach((slide, index) => {
    assert.equal(presentonRichStaticSlideSchema.safeParse(slide).success, true);
    assert.deepEqual(Object.keys(slide).sort(), [
      "content",
      "html_content",
      "id",
      "index",
      "layout",
      "layout_group",
      "presentation",
      "properties",
      "speaker_note",
      "ui",
    ]);
    assert.equal(slide.id, input.slideIds[index]);
    assert.equal(slide.presentation, PRESENTATION_ID);
    assert.equal(slide.layout_group, PRESENTON_RICH_STATIC_LAYOUT_GROUP);
    assert.equal(slide.layout, input.layoutIds[index]);
    assert.equal(slide.index, index);
    assert.deepEqual(slide.content, {});
    assert.equal(slide.html_content, null);
    assert.equal(slide.speaker_note, "");
    assert.equal(slide.properties, null);
  });
});

test("all four layouts remain 1280x720, vector-rich, exact-text, and closed-set", () => {
  const input = fixtureInput();
  const slides = buildPresentonRichStaticSlides(input);
  const forbiddenUiKeys = new Set([
    "data",
    "href",
    "html",
    "html_content",
    "image",
    "is_icon",
    "link",
    "prompt",
    "speaker_note",
    "src",
    "url",
  ]);

  function inspectUi(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(inspectUi);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenUiKeys.has(key), false, `forbidden UI key: ${key}`);
      inspectUi(child);
    }
  }

  slides.forEach((slide, slideIndex) => {
    inspectUi(slide.ui);
    assert.deepEqual(Object.keys(slide.ui).sort(), ["components", "description", "id"]);
    const component = slide.ui.components[0]!;
    assert.deepEqual(component.position, { x: 0, y: 0 });
    assert.deepEqual(component.size, {
      width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
      height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
    });
    const shapes = component.elements.filter((element) => element.type !== "text");
    const text = component.elements.filter((element) => element.type === "text");
    assert.ok(shapes.length >= 8);
    assert.equal(component.elements.findIndex((element) => element.type === "text"), shapes.length);
    assert.deepEqual(shapes[0], {
      type: "rectangle",
      position: { x: 0, y: 0 },
      size: {
        width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
        height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
      },
      fill: { color: "#FFFFFF", opacity: 1 },
    });
    for (const element of component.elements) {
      assert.equal(new Set(["rectangle", "ellipse", "text"]).has(element.type), true);
      assert.ok(element.position.x >= 0 && element.position.y >= 0);
      assert.ok(element.position.x + element.size.width <= PRESENTON_RICH_STATIC_SLIDE_WIDTH);
      assert.ok(element.position.y + element.size.height <= PRESENTON_RICH_STATIC_SLIDE_HEIGHT);
      if (element.type !== "text") {
        assert.equal(element.fill.opacity, 1);
        assert.equal(
          new Set<string>(RICH_STATIC_VISUAL_PROFILE.palette).has(
            element.fill.color.slice(1),
          ),
          true,
        );
        continue;
      }
      assert.equal(element.decorative, false);
      assert.equal(element.runs.length, 1);
      assert.equal(element.font.family, "Arial");
      assert.equal(element.font.color, "#111827");
      assert.deepEqual(element.runs[0]!.font, element.font);
    }
    for (let left = 0; left < text.length; left += 1) {
      for (let right = left + 1; right < text.length; right += 1) {
        assert.equal(overlaps(text[left]!, text[right]!), false);
      }
    }
    assert.deepEqual(
      text.map((element) => element.runs[0]!.text),
      [input.slides[slideIndex]!.headline, ...input.slides[slideIndex]!.bulletPoints],
    );
  });
});

test("headline-only slides retain the complete vector composition and no synthetic text", () => {
  const input = fixtureInput();
  input.slideIds = input.slideIds.slice(0, 1);
  input.slides = input.slides.slice(0, 1);
  input.layoutIds = selectRichStaticLayoutIds(1);
  const slide = buildPresentonRichStaticSlides(input)[0]!;
  const elements = slide.ui.components[0]!.elements;
  assert.ok(elements.filter((element) => element.type !== "text").length >= 8);
  assert.deepEqual(
    elements.filter((element) => element.type === "text").map(
      (element) => element.runs[0]!.text,
    ),
    [input.slides[0]!.headline],
  );
});

test("input schema enforces cardinality, canonical UUIDs, text bounds, and layout order", () => {
  const invalidInputs: unknown[] = [];

  invalidInputs.push({ ...fixtureInput(), presentationId: "not-a-uuid" });
  invalidInputs.push({
    ...fixtureInput(),
    presentationId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  });

  const duplicateIds = fixtureInput();
  duplicateIds.slideIds[1] = duplicateIds.slideIds[0]!;
  invalidInputs.push(duplicateIds);

  const reusedPresentationId = fixtureInput();
  reusedPresentationId.slideIds[0] = reusedPresentationId.presentationId;
  invalidInputs.push(reusedPresentationId);

  invalidInputs.push({ ...fixtureInput(), slideIds: fixtureInput().slideIds.slice(1) });
  invalidInputs.push({ ...fixtureInput(), layoutIds: fixtureInput().layoutIds.slice(1) });

  const wrongOrder = fixtureInput();
  [wrongOrder.layoutIds[0], wrongOrder.layoutIds[1]] = [
    wrongOrder.layoutIds[1]!,
    wrongOrder.layoutIds[0]!,
  ];
  invalidInputs.push(wrongOrder);

  const badHeadlineValues = [
    "",
    " surrounding whitespace ",
    "two\nlines",
    "H".repeat(121),
    "<strong>active HTML</strong>",
    "[active link](https://example.test)",
    "direction\u202Eoverride",
  ];
  for (const headline of badHeadlineValues) {
    const candidate = fixtureInput();
    candidate.slides[0] = { headline, bulletPoints: [] };
    invalidInputs.push(candidate);
  }

  const tooManyBullets = fixtureInput();
  tooManyBullets.slides[0] = {
    headline: "Bounded bullets",
    bulletPoints: ["One", "Two", "Three", "Four"],
  };
  invalidInputs.push(tooManyBullets);

  for (const bullet of ["", "B".repeat(181), "![image](https://example.test/a.png)"]) {
    const candidate = fixtureInput();
    candidate.slides[0] = { headline: "Bounded bullet", bulletPoints: [bullet] };
    invalidInputs.push(candidate);
  }

  const extraContentKey = fixtureInput();
  invalidInputs.push({
    ...extraContentKey,
    slides: [{
      ...extraContentKey.slides[0],
      hiddenInstruction: "do something else",
    }, ...extraContentKey.slides.slice(1)],
  });
  invalidInputs.push({ ...fixtureInput(), unknownRootField: true });

  const overLimitCount = 61;
  invalidInputs.push({
    presentationId: PRESENTATION_ID,
    slideIds: Array.from(
      { length: overLimitCount },
      (_unused, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ),
    slides: Array.from(
      { length: overLimitCount },
      () => ({ headline: "Bounded slide", bulletPoints: [] }),
    ),
    layoutIds: Array.from(
      { length: overLimitCount },
      (_unused, index) => RICH_STATIC_VISUAL_PROFILE.layoutIds[
        index % RICH_STATIC_VISUAL_PROFILE.layoutIds.length
      ],
    ),
  });

  for (const candidate of invalidInputs) {
    assert.equal(presentonRichStaticSlidesInputSchema.safeParse(candidate).success, false);
  }

  const boundary = fixtureInput();
  boundary.slideIds = boundary.slideIds.slice(0, 1);
  boundary.slides = [{
    headline: "H".repeat(120),
    bulletPoints: ["A".repeat(180), "B".repeat(180), "C".repeat(180)],
  }];
  boundary.layoutIds = selectRichStaticLayoutIds(1);
  assert.equal(buildPresentonRichStaticSlides(boundary).length, 1);
});

test("strict slide schema rejects media, hyperlinks, z-order drift, and style drift", () => {
  const valid = buildPresentonRichStaticSlides(fixtureInput())[1]!;
  const component = valid.ui.components[0]!;
  const firstTextIndex = component.elements.findIndex((element) => element.type === "text");
  const firstText = component.elements[firstTextIndex]!;
  assert.equal(firstText.type, "text");
  if (firstText.type !== "text") throw new Error("Test fixture lost its headline.");

  const media = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: [
          ...component.elements,
          { type: "image", data: "https://example.test/image.png" },
        ],
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(media).success, false);

  const hyperlink = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: component.elements.map((element, index) => index === firstTextIndex
          ? { ...element, href: "https://example.test" }
          : element),
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(hyperlink).success, false);

  const zOrderDrift = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: [firstText, ...component.elements.filter((_element, index) => index !== firstTextIndex)],
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(zOrderDrift).success, false);

  const offCanvas = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: component.elements.map((element, index) => index === 0
          ? { ...element, position: { x: 1, y: 0 } }
          : element),
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(offCanvas).success, false);

  const missingAccent = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: component.elements.filter((_element, index) => index !== 1),
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(missingAccent).success, false);

  const inBoundsTextGeometryDrift = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: component.elements.map((element, index) => index === firstTextIndex
          ? {
              ...firstText,
              position: { ...firstText.position, x: firstText.position.x + 1 },
            }
          : element),
      }],
    },
  };
  assert.equal(
    presentonRichStaticSlideSchema.safeParse(inBoundsTextGeometryDrift).success,
    false,
  );

  const fontDrift = {
    ...valid,
    ui: {
      ...valid.ui,
      components: [{
        ...component,
        elements: component.elements.map((element, index) => index === firstTextIndex
          ? { ...firstText, font: { ...firstText.font, family: "Helvetica" } }
          : element),
      }],
    },
  };
  assert.equal(presentonRichStaticSlideSchema.safeParse(fontDrift).success, false);
});
