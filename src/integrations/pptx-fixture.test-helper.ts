function crc32(buffer: Buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(entries: Array<{ name: string; content: string }>) {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + name.byteLength);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.byteLength, 18);
    local.writeUInt32LE(content.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    name.copy(local, 30);
    localRecords.push(local, content);

    const central = Buffer.alloc(46 + name.byteLength);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.byteLength, 20);
    central.writeUInt32LE(content.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.byteLength + content.byteLength;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function slideXml(paragraphs: string[], slideIndex: number) {
  const background = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Verified background"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  const accentWidth = 2_000_000 + slideIndex * 100_000;
  const accentColor = slideIndex % 2 === 0 ? "168C2A" : "1B8C2D";
  const accent = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Verified vector accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="6738000"/><a:ext cx="${accentWidth}" cy="120000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${accentColor}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  const text = paragraphs
    .map((paragraph, index) => `<p:sp><p:nvSpPr><p:cNvPr id="${index + 4}" name="Text ${index + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="${500000 + index * 700000}"/><a:ext cx="11000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${index === 0 ? 3200 : 1800}" b="${index === 0 ? 1 : 0}"><a:solidFill><a:srgbClr val="111827"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${paragraph}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join("");
  return `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${background}${accent}${text}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const pNs = "http://schemas.openxmlformats.org/presentationml/2006/main";
const aNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
const rNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentTypesNs = "http://schemas.openxmlformats.org/package/2006/content-types";

function relationshipXml(relationships: string) {
  return `<Relationships xmlns="${packageRelNs}">${relationships}</Relationships>`;
}

/** Minimal stored OOXML package for deterministic provider-boundary tests. */
export function createPptxFixture(
  slides: string[][],
  presentationOrder = slides.map((_slide, index) => index + 1),
  options: {
    firstSlideXml?: string;
    firstSlideExtraRelationships?: string;
    slideMasterXml?: string;
    slideSize?: { width: number; height: number };
    extraEntries?: Array<{ name: string; content: string }>;
  } = {},
) {
  if (
    presentationOrder.length !== slides.length
    || new Set(presentationOrder).size !== slides.length
    || presentationOrder.some((number) => number < 1 || number > slides.length)
  ) {
    throw new RangeError("Presentation order must reference every fixture slide once.");
  }
  return storedZip([
    {
      name: "[Content_Types].xml",
      content: `<Types xmlns="${contentTypesNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_slide, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      content: relationshipXml("<Relationship Id=\"rIdOffice\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/>"),
    },
    {
      name: "ppt/presentation.xml",
      content: `<p:presentation xmlns:p="${pNs}" xmlns:r="${rNs}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${presentationOrder
        .map((slideNumber) => `<p:sldId id="${255 + slideNumber}" r:id="rId${slideNumber}"/>`)
        .join("")}</p:sldIdLst><p:sldSz cx="${options.slideSize?.width ?? 12_192_000}" cy="${options.slideSize?.height ?? 6_858_000}"/></p:presentation>`,
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: relationshipXml(`<Relationship Id="rIdMaster" Type="${rNs}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdPresProps" Type="${rNs}/presProps" Target="presProps.xml"/>${slides
        .map((_slide, index) => `<Relationship Id="rId${index + 1}" Type="${rNs}/slide" Target="slides/slide${index + 1}.xml"/>`)
        .join("")}`),
    },
    {
      name: "ppt/presProps.xml",
      content: `<p:presentationPr xmlns:p="${pNs}" xmlns:r="${rNs}"/>`,
    },
    {
      name: "ppt/slideMasters/slideMaster1.xml",
      content: options.slideMasterXml
        ?? `<p:sldMaster xmlns:p="${pNs}" xmlns:a="${aNs}" xmlns:r="${rNs}"><p:cSld><p:spTree/></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>`,
    },
    {
      name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      content: relationshipXml(`<Relationship Id="rIdLayout" Type="${rNs}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="${rNs}/theme" Target="../theme/theme1.xml"/>`),
    },
    {
      name: "ppt/slideLayouts/slideLayout1.xml",
      content: `<p:sldLayout xmlns:p="${pNs}" xmlns:a="${aNs}" xmlns:r="${rNs}"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`,
    },
    {
      name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      content: relationshipXml(`<Relationship Id="rIdMaster" Type="${rNs}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>`),
    },
    {
      name: "ppt/theme/theme1.xml",
      content: `<a:theme xmlns:a="${aNs}" name="Fixture"><a:themeElements/></a:theme>`,
    },
    ...slides.map((paragraphs, index) => ({
      name: `ppt/slides/slide${index + 1}.xml`,
      content: index === 0 && options.firstSlideXml
        ? options.firstSlideXml
        : slideXml(paragraphs, index),
    })),
    ...slides.map((_paragraphs, index) => ({
      name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      content: relationshipXml(`<Relationship Id="rIdLayout" Type="${rNs}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${index === 0 ? options.firstSlideExtraRelationships ?? "" : ""}`),
    })),
    ...(options.extraEntries ?? []),
  ]);
}

export const pptxFixtureNamespaces = Object.freeze({
  presentation: pNs,
  drawing: aNs,
  relationships: rNs,
});

/** Deliberately incomplete package retained as a regression for old false positives. */
export function createLegacyMinimalPptxFixture(paragraph: string) {
  return storedZip([
    { name: "[Content_Types].xml", content: "<Types/>" },
    { name: "_rels/.rels", content: "<Relationships/>" },
    { name: "ppt/presentation.xml", content: "<p:presentation/>" },
    { name: "ppt/_rels/presentation.xml.rels", content: "<Relationships/>" },
    { name: "ppt/slides/slide1.xml", content: `<p:sld><!-- <a:p><a:t>${paragraph}</a:t></a:p> --></p:sld>` },
  ]);
}
