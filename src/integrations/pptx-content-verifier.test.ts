import assert from "node:assert/strict";
import test from "node:test";

import {
  PPTX_CONTENT_VERIFICATION_METHOD,
  PptxContentVerificationError,
  verifyPptxVisibleText as verifyRichStaticPptx,
} from "./pptx-content-verifier";
import { selectRichStaticLayoutIds } from "@/src/domain/visual-profile";
import {
  createLegacyMinimalPptxFixture,
  createPptxFixture,
  pptxFixtureNamespaces,
} from "./pptx-fixture.test-helper";

function verifyPptxVisibleText(
  body: Buffer,
  expectedSlides: Array<{ headline: string; bulletPoints: string[] }>,
) {
  return verifyRichStaticPptx(
    body,
    expectedSlides,
    selectRichStaticLayoutIds(expectedSlides.length),
  );
}

test("PPTX verifier attests exact approved text per slide", () => {
  const result = verifyPptxVisibleText(
    createPptxFixture([
      ["Approved &amp; grounded", "Book a call"],
      ["Second slide"],
    ]),
    [
      { headline: "Approved & grounded", bulletPoints: ["Book a call"] },
      { headline: "Second slide", bulletPoints: [] },
    ],
  );

  assert.equal(result.contentVerification.method, PPTX_CONTENT_VERIFICATION_METHOD);
  assert.equal(result.contentVerification.slideCount, 2);
  assert.match(result.contentVerification.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.visualProfile.measuredRichness.slidesWithVectorAccents, 2);
});

test("PPTX verifier rejects renderer rewrites, additions, and slide-count drift", () => {
  const expected = [{ headline: "Approved claim", bulletPoints: ["Approved CTA"] }];
  for (const body of [
    createPptxFixture([["Rewritten claim", "Approved CTA"]]),
    createPptxFixture([["Approved claim", "Approved CTA", "Invented 42% result"]]),
    createPptxFixture([["Approved claim", "Approved CTA"], ["Unexpected slide"]]),
  ]) {
    assert.throws(
      () => verifyPptxVisibleText(body, expected),
      PptxContentVerificationError,
    );
  }
});

test("PPTX verifier follows the presentation relationship order", () => {
  const body = createPptxFixture(
    [["First slide"], ["Second slide"]],
    [2, 1],
  );

  assert.throws(
    () => verifyPptxVisibleText(body, [
      { headline: "First slide", bulletPoints: [] },
      { headline: "Second slide", bulletPoints: [] },
    ]),
    PptxContentVerificationError,
  );
});

test("PPTX verifier preserves headline and bullet reading order within a slide", () => {
  assert.throws(
    () => verifyPptxVisibleText(
      createPptxFixture([["Approved bullet", "Approved headline"]]),
      [{ headline: "Approved headline", bulletPoints: ["Approved bullet"] }],
    ),
    PptxContentVerificationError,
  );
});

test("PPTX verifier rejects malformed containers instead of trusting magic bytes", () => {
  const valid = createPptxFixture([["Approved claim"]]);
  const corrupted = Buffer.from(valid);
  const textOffset = corrupted.indexOf("Approved claim");
  assert.notEqual(textOffset, -1);
  corrupted[textOffset] = corrupted[textOffset]! ^ 0xff;

  for (const body of [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    valid.subarray(0, valid.byteLength - 1),
    corrupted,
  ]) {
    assert.throws(
      () => verifyPptxVisibleText(body, [{ headline: "Approved claim", bulletPoints: [] }]),
      PptxContentVerificationError,
    );
  }
});

test("PPTX verifier rejects the old minimal package false positive", () => {
  assert.throws(
    () => verifyPptxVisibleText(
      createLegacyMinimalPptxFixture("Approved claim"),
      [{ headline: "Approved claim", bulletPoints: [] }],
    ),
    PptxContentVerificationError,
  );
});

test("PPTX verifier rejects commented text and non-text visible assets", () => {
  const { presentation, drawing, relationships } = pptxFixtureNamespaces;
  const unsafeSlide = `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree><!-- <a:p><a:t>Approved claim</a:t></a:p> --><p:pic><p:nvPicPr/><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill><p:spPr/></p:pic></p:spTree></p:cSld></p:sld>`;
  const body = createPptxFixture(
    [["Approved claim"]],
    [1],
    {
      firstSlideXml: unsafeSlide,
      firstSlideExtraRelationships: `<Relationship Id="rIdImage" Type="${relationships}/image" Target="../media/unsupported.png"/>`,
    },
  );

  assert.throws(
    () => verifyPptxVisibleText(body, [{ headline: "Approved claim", bulletPoints: [] }]),
    PptxContentVerificationError,
  );
});

test("PPTX verifier rejects occluded, off-canvas, zero-size, and transparent text", () => {
  const { presentation, drawing, relationships } = pptxFixtureNamespaces;
  const root = (shapes: string) => `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
  const textShape = (transform: string, runProperties = "") => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Approved text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${runProperties}<a:t>Approved claim</a:t></a:r></a:p></p:txBody></p:sp>`;
  const validTransform = "<a:xfrm><a:off x=\"500000\" y=\"500000\"/><a:ext cx=\"4000000\" cy=\"500000\"/></a:xfrm>";
  const cases = [
    root(`${textShape(validTransform)}<p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`),
    root(textShape("<a:xfrm><a:off x=\"13000000\" y=\"500000\"/><a:ext cx=\"4000000\" cy=\"500000\"/></a:xfrm>")),
    root(textShape("<a:xfrm><a:off x=\"500000\" y=\"500000\"/><a:ext cx=\"0\" cy=\"500000\"/></a:xfrm>")),
    root(textShape(validTransform, "<a:rPr><a:solidFill><a:srgbClr val=\"000000\"><a:alpha val=\"0\"/></a:srgbClr></a:solidFill></a:rPr>")),
  ];

  for (const firstSlideXml of cases) {
    assert.throws(
      () => verifyPptxVisibleText(
        createPptxFixture([["Approved claim"]], [1], { firstSlideXml }),
        [{ headline: "Approved claim", bulletPoints: [] }],
      ),
      PptxContentVerificationError,
    );
  }
});

test("PPTX verifier rejects parked, tiny, overlapping, hidden, and overflowing text", () => {
  const { presentation, drawing, relationships } = pptxFixtureNamespaces;
  const root = (shapes: string) => `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const shape = (
    text: string,
    transform: string,
    runProperties = "",
    id = 2,
  ) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Approved text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${runProperties}<a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const validTransform = '<a:xfrm><a:off x="500000" y="500000"/><a:ext cx="4000000" cy="500000"/></a:xfrm>';
  const parked = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Parked text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${validTransform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln><a:p><a:r><a:t>Approved claim</a:t></a:r></a:p></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>`;
  const tiny = shape(
    "Approved claim",
    '<a:xfrm><a:off x="500000" y="500000"/><a:ext cx="1" cy="1"/></a:xfrm>',
  );
  const overlapping = `${shape("Approved claim", validTransform)}${shape("Approved detail", validTransform, "", 3)}`;
  const whiteText = shape(
    "Approved claim",
    validTransform,
    '<a:rPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>',
  );
  const overflowingText = "A".repeat(300);

  const cases = [
    { xml: root(parked), expected: [{ headline: "Approved claim", bulletPoints: [] }] },
    { xml: root(tiny), expected: [{ headline: "Approved claim", bulletPoints: [] }] },
    {
      xml: root(overlapping),
      expected: [{ headline: "Approved claim", bulletPoints: ["Approved detail"] }],
    },
    { xml: root(whiteText), expected: [{ headline: "Approved claim", bulletPoints: [] }] },
    {
      xml: root(shape(overflowingText, validTransform)),
      expected: [{ headline: overflowingText, bulletPoints: [] }],
    },
  ];
  for (const testCase of cases) {
    assert.throws(
      () => verifyPptxVisibleText(
        createPptxFixture([["unused"]], [1], { firstSlideXml: testCase.xml }),
        testCase.expected,
      ),
      PptxContentVerificationError,
    );
  }
});

test("PPTX verifier rejects template overlays, mismatched relationships, and timing", () => {
  const { presentation, drawing, relationships } = pptxFixtureNamespaces;
  const slideMasterXml = `<p:sldMaster xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree><p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>`;
  const mismatchedMasterXml = `<p:sldMaster xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree/></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdMissing"/></p:sldLayoutIdLst></p:sldMaster>`;
  const whiteTextMappingMasterXml = `<p:sldMaster xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree/></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="lt1" tx2="lt2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>`;
  const validShape = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Approved text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="4000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Approved claim</a:t></a:r></a:p></p:txBody></p:sp>';
  const timedSlideXml = `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}"><p:cSld><p:spTree>${validShape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr><p:timing><p:tnLst/></p:timing></p:sld>`;
  for (const body of [
    createPptxFixture([["Approved claim"]], [1], { slideMasterXml }),
    createPptxFixture([["Approved claim"]], [1], { slideMasterXml: mismatchedMasterXml }),
    createPptxFixture([["Approved claim"]], [1], { slideMasterXml: whiteTextMappingMasterXml }),
    createPptxFixture([["Approved claim"]], [1], { firstSlideXml: timedSlideXml }),
  ]) {
    assert.throws(
      () => verifyPptxVisibleText(body, [{ headline: "Approved claim", bulletPoints: [] }]),
      PptxContentVerificationError,
    );
  }
});

test("PPTX verifier rejects inconsistent local ZIP headers", () => {
  const body = Buffer.from(createPptxFixture([["Approved claim"]]));
  body.writeUInt32LE(0, 14);
  assert.throws(
    () => verifyPptxVisibleText(body, [{ headline: "Approved claim", bulletPoints: [] }]),
    PptxContentVerificationError,
  );
});

test("PPTX verifier rejects a nonstandard canvas that makes default text visually tiny", () => {
  assert.throws(
    () => verifyPptxVisibleText(
      createPptxFixture([["Approved claim"]], [1], {
        slideSize: { width: 20_000_000, height: 10_000_000 },
      }),
      [{ headline: "Approved claim", bulletPoints: [] }],
    ),
    PptxContentVerificationError,
  );
});

test("PPTX verifier bounds package entries and XML nesting", () => {
  const tooManyEntries = createPptxFixture([["Approved claim"]], [1], {
    extraEntries: Array.from({ length: 520 }, (_, index) => ({
      name: `unreferenced/part-${index}.xml`,
      content: "<x/>",
    })),
  });
  const { presentation, drawing, relationships } = pptxFixtureNamespaces;
  const depth = 80;
  const deeplyNested = `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:r="${relationships}">${"<a:x>".repeat(depth)}<a:p><a:r><a:t>Approved claim</a:t></a:r></a:p>${"</a:x>".repeat(depth)}</p:sld>`;
  const nestedPackage = createPptxFixture([["Approved claim"]], [1], {
    firstSlideXml: deeplyNested,
  });

  for (const body of [tooManyEntries, nestedPackage]) {
    assert.throws(
      () => verifyPptxVisibleText(body, [{ headline: "Approved claim", bulletPoints: [] }]),
      PptxContentVerificationError,
    );
  }
});
