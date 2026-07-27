import { createHash } from "node:crypto";
import { posix as path } from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  type RichStaticLayoutId,
  type VisualProfileVerification,
  visualProfileVerificationSchema,
} from "@/src/domain/visual-profile";
import {
  PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS,
} from "@/src/integrations/presenton-rich-static-ui";

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_SLIDE_XML_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_SLIDE_XML_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MAX_ZIP_ENTRIES = 512;
const MAX_TOTAL_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_XML_DEPTH = 64;
const MAX_XML_ELEMENTS = 20_000;
const MAX_XML_ATTRIBUTES = 50_000;
const STRICT_SLIDE_WIDTH_EMU = 12_192_000;
const STRICT_SLIDE_HEIGHT_EMU = 6_858_000;
const PRESENTATIONML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const OFFICE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const CONTENT_TYPE_BY_KIND = Object.freeze({
  presentation: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  slide: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  slideMaster: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
  slideLayout: "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
  presProps: "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml",
});

/**
 * Presenton's pinned renderer uses python-pptx's immutable package skeleton.
 * We attest every non-slide byte below rather than treating a general OOXML
 * document as trusted input. Dynamic package parts are normalized and checked
 * separately before any slide XML is inspected.
 */
const PRESENTON_STATIC_PART_SHA256 = new Map<string, string>([
  ["docProps/app.xml", "77fbd43c41b96be9a40d41a267cd83108a274ee5860675dfb543828472d76867"],
  ["docProps/core.xml", "b25bcc59255004fe78e28f81cba03ebf00eea5f5f95e9f98e71a3c20468d7d3b"],
  ["_rels/.rels", "25739ffce73dcfacb3d77dd9ec590057f9abde6d3294a208564143587171c785"],
  ["ppt/viewProps.xml", "f2e3578e8a2a2607ca7f850d99f2cbe5f22806084c8e519bb754388ed7ebdb69"],
  ["ppt/tableStyles.xml", "0e7ac03251337ecbaf6c8ca13619db1caeda5c90c4e3210d45d6c3f5df4de103"],
  ["ppt/presProps.xml", "b42af61236cda9ea4d781f60908296da476489b2828df32fc9625d996808087b"],
  ["ppt/slideMasters/slideMaster1.xml", "44cc65956f47c1cf689803dcc7a1d9225c93d3fd90754a9f85e2bdcea27565bc"],
  ["ppt/slideMasters/_rels/slideMaster1.xml.rels", "52e5efa51d86e5426d78ad9b143b863e71d00c269f6494e759cf0b3adc900116"],
  ["ppt/printerSettings/printerSettings1.bin", "d7768f87e07d29634782e448ece1cddd05a52b9499254222b1190bc8f6dc579e"],
  ["ppt/theme/theme1.xml", "4c3412087e8fa20cf5642f42e69f1e733881c28611a2bdd4622654ee313d214e"],
  ...[
    [1, "25c93a2f186df69897585729d52fc610349e29dcf0b5b6080160df6490698709"],
    [2, "5f800acd9e43b9b438c987bd71cf0966b27ad02ce8df14df80708510cbd700be"],
    [3, "e83a85b737e1447051ac7fd9bbaaba4ac1b4210cfc630cdcfcdbc191fdb141d1"],
    [4, "1ebe316051a0caaac0e972989a7591e66d1fbb4a0764fe984c31a4ab5b6554bf"],
    [5, "3df8e6f498622ef440f5568a2c967c97f47c74b46b47a976304c7b7c9ab54c74"],
    [6, "18e5b26c6f7c30dabe0b294faf38b2d2ef60ae778fbba9c3fe71f6560143a402"],
    [7, "e4d86b009a8ca6ca9ecfadc97c68b7123b60544df09a7ea42864a4f5f74ce09c"],
    [8, "950b9d16468d58fe59a8c0aeb17a03b7d18a9f5bbeac438e38a2248462a72cbe"],
    [9, "4e9439878755a7faea188d684939b2fb7d26b7e09086e792789f9137ca353e15"],
    [10, "1f8304c9d6c08ff9bd41b639d0c7e866b6515f61e6081c9ccc89ed8d0f8b4194"],
    [11, "355ac266c2671b83b662759afb0ee0ecfb7cdd6ec936019ecef60dbc95c14dac"],
  ].flatMap(([index, digest]) => [
    [`ppt/slideLayouts/slideLayout${index}.xml`, digest as string] as const,
    [
      `ppt/slideLayouts/_rels/slideLayout${index}.xml.rels`,
      "7c1f290acd6ca3ce664fe95aaf0b129bbb3cbf2b75c8d09905a2821641981027",
    ] as const,
  ]),
]);

const PRESENTON_NORMALIZED_CONTENT_TYPES_SHA256 =
  "af92d6f22411943a4ffeb884e5f43bb68730429ba8d2d17bc9d389b33bd99936";
const PRESENTON_NORMALIZED_PRESENTATION_SHA256 =
  "bcf388d7ef38deb84fb6640f42b971020f0cc39d39b80ca03af5f20e13344fce";
const PRESENTON_NORMALIZED_PRESENTATION_RELS_SHA256 =
  "85d7b9a4ed02373db9a96884425e044e91f0ed786ce68539c11f2276d89b4ad8";
const PRESENTON_SLIDE_RELS_SHA256 =
  "c56574a33fad9499b4afedfd47a59b0bc3bc892a903840b64a04b7c59b25b005";

export const PPTX_CONTENT_VERIFICATION_METHOD = "pptx_ooxml_rich_static_v2" as const;

export interface ExpectedSlideText {
  headline: string;
  bulletPoints: readonly string[];
}

export interface PptxContentVerification {
  method: typeof PPTX_CONTENT_VERIFICATION_METHOD;
  sha256: string;
  slideCount: number;
}

export interface PptxRichStaticVerification {
  contentVerification: PptxContentVerification;
  visualProfile: VisualProfileVerification;
}

export class PptxContentVerificationError extends Error {
  public constructor() {
    super("Rendered PPTX content does not match the approved slide plan.");
    this.name = "PptxContentVerificationError";
  }
}

interface ZipEntry {
  name: string;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  centralDirectoryOffset: number;
}

function fail(): never {
  throw new PptxContentVerificationError();
}

function assertRange(buffer: Buffer, offset: number, length: number) {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > buffer.byteLength
  ) {
    fail();
  }
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(
    0,
    buffer.byteLength - 22 - MAX_ZIP_COMMENT_BYTES,
  );
  for (let offset = buffer.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.byteLength) {
      if (commentLength !== 0) fail();
      return offset;
    }
  }
  return fail();
}

function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(buffer);
  assertRange(buffer, endOffset, 22);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== totalEntries
    || totalEntries === 0xffff
    || totalEntries < 1
    || totalEntries > MAX_ZIP_ENTRIES
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset === 0xffffffff
  ) {
    fail();
  }
  assertRange(buffer, centralDirectoryOffset, centralDirectorySize);
  if (centralDirectoryOffset + centralDirectorySize !== endOffset) fail();

  const entries: ZipEntry[] = [];
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    assertRange(buffer, offset, 46);
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) fail();
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const recordLength = 46 + fileNameLength + extraLength + commentLength;
    assertRange(buffer, offset, recordLength);
    if (
      (flags & 0x0001) !== 0
      || (flags & ~0x0800) !== 0
      || ![0, 8].includes(compressionMethod)
      || extraLength !== 0
      || commentLength !== 0
      || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localHeaderOffset === 0xffffffff
    ) {
      fail();
    }
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (!name || name.includes("\uFFFD") || name.includes("\\")) fail();
    entries.push({
      name,
      flags,
      compressionMethod,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      centralDirectoryOffset,
    });
    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    if (
      totalCompressedBytes > MAX_TOTAL_ZIP_BYTES
      || totalUncompressedBytes > MAX_TOTAL_ZIP_BYTES
    ) fail();
    offset += recordLength;
  }
  if (offset !== endOffset) fail();
  assertContiguousLocalRecords(buffer, entries, centralDirectoryOffset);
  return entries;
}

/**
 * ZIP readers disagree about whether the local or central metadata wins.
 * The attestation profile accepts only one canonical, contiguous view so a
 * second reader cannot observe bytes or sizes that this verifier ignored.
 */
function assertContiguousLocalRecords(
  buffer: Buffer,
  entries: readonly ZipEntry[],
  centralDirectoryOffset: number,
) {
  const ranges = entries.map((entry) => {
    assertRange(buffer, entry.localHeaderOffset, 30);
    if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_SIGNATURE) fail();
    const localFlags = buffer.readUInt16LE(entry.localHeaderOffset + 6);
    const localMethod = buffer.readUInt16LE(entry.localHeaderOffset + 8);
    const localCrc = buffer.readUInt32LE(entry.localHeaderOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 22);
    const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const nameOffset = entry.localHeaderOffset + 30;
    const end = nameOffset + fileNameLength + extraLength + entry.compressedSize;
    assertRange(buffer, nameOffset, fileNameLength + extraLength + entry.compressedSize);
    if (
      localFlags !== entry.flags
      || localMethod !== entry.compressionMethod
      || localCrc !== entry.crc32
      || localCompressedSize !== entry.compressedSize
      || localUncompressedSize !== entry.uncompressedSize
      || extraLength !== 0
      || buffer.subarray(nameOffset, nameOffset + fileNameLength).toString("utf8") !== entry.name
      || end > centralDirectoryOffset
    ) fail();
    return { start: entry.localHeaderOffset, end };
  }).sort((left, right) => left.start - right.start);

  let expectedStart = 0;
  for (const range of ranges) {
    if (range.start !== expectedStart) fail();
    expectedStart = range.end;
  }
  if (expectedStart !== centralDirectoryOffset) fail();
}

function readEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  assertRange(buffer, entry.localHeaderOffset, 30);
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_SIGNATURE) fail();
  const localFlags = buffer.readUInt16LE(entry.localHeaderOffset + 6);
  const localMethod = buffer.readUInt16LE(entry.localHeaderOffset + 8);
  const localCrc = buffer.readUInt32LE(entry.localHeaderOffset + 14);
  const localCompressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 18);
  const localUncompressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 22);
  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  if (
    localFlags !== entry.flags
    || localMethod !== entry.compressionMethod
    || localCrc !== entry.crc32
    || localCompressedSize !== entry.compressedSize
    || localUncompressedSize !== entry.uncompressedSize
    || (localFlags & 0x0001) !== 0
    || extraLength !== 0
  ) {
    fail();
  }
  const nameOffset = entry.localHeaderOffset + 30;
  const dataOffset = nameOffset + fileNameLength + extraLength;
  assertRange(buffer, nameOffset, fileNameLength + extraLength + entry.compressedSize);
  if (dataOffset + entry.compressedSize > entry.centralDirectoryOffset) fail();
  if (buffer.subarray(nameOffset, nameOffset + fileNameLength).toString("utf8") !== entry.name) {
    fail();
  }
  if (
    entry.uncompressedSize > MAX_SLIDE_XML_BYTES
    || (entry.compressedSize === 0
      ? entry.uncompressedSize !== 0
      : entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO)
  ) {
    fail();
  }

  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  let content: Buffer;
  try {
    content = entry.compressionMethod === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: MAX_SLIDE_XML_BYTES });
  } catch {
    return fail();
  }
  if (
    content.byteLength !== entry.uncompressedSize
    || crc32(content) !== entry.crc32
  ) {
    fail();
  }
  return content;
}

let crcTable: Uint32Array | undefined;

function crc32(buffer: Buffer) {
  if (!crcTable) {
    crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function decodeXmlText(value: string) {
  const entityPattern = /&(#x[0-9a-f]+|#[0-9]+|amp|apos|gt|lt|quot);/giu;
  if (value.replace(entityPattern, "").includes("&")) fail();
  return value.replace(entityPattern, (_match, entity: string) => {
    switch (entity.toLowerCase()) {
      case "amp": return "&";
      case "apos": return "'";
      case "gt": return ">";
      case "lt": return "<";
      case "quot": return '"';
      default: {
        const codePoint = entity.toLowerCase().startsWith("#x")
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return fail();
        }
        return String.fromCodePoint(codePoint);
      }
    }
  });
}

function normalizedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function strictXmlAttributes(source: string) {
  const attributes = new Map<string, string>();
  let offset = 0;
  while (offset < source.length) {
    const remaining = source.slice(offset);
    if (/^\s*$/u.test(remaining)) break;
    const match = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/u.exec(
      remaining,
    );
    if (!match) fail();
    const name = match[1]!;
    if (attributes.has(name)) fail();
    attributes.set(name, decodeXmlText(match[2] ?? match[3] ?? ""));
    offset += match[0].length;
  }
  return attributes;
}

interface StrictXmlElement {
  name: string;
  attributes: Map<string, string>;
  depth: number;
  selfClosing: boolean;
  ancestors: readonly string[];
}

interface StrictXmlVisitor {
  start?(element: StrictXmlElement): void;
  text?(value: string, ancestors: readonly string[]): void;
  end?(name: string, depth: number): void;
}

function findTagEnd(source: string, start: number) {
  let quote: "'" | '"' | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return fail();
}

function elementPrefix(name: string) {
  const separator = name.indexOf(":");
  return separator < 0 ? "" : name.slice(0, separator);
}

function walkStrictXml(
  xml: Buffer,
  allowedElementPrefixes: ReadonlySet<string>,
  visitor: StrictXmlVisitor = {},
) {
  let source = xml.toString("utf8");
  if (source.includes("\uFFFD") || source.includes("\0")) fail();
  if (source.startsWith("\uFEFF")) source = source.slice(1);
  if (source.startsWith("<?xml")) {
    const declarationEnd = source.indexOf("?>");
    if (declarationEnd < 0 || declarationEnd > 256) fail();
    const declaration = source.slice(0, declarationEnd + 2);
    if (!/^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?\s*\?>$/u.test(declaration)) {
      fail();
    }
    source = source.slice(declarationEnd + 2);
  }

  const stack: string[] = [];
  let rootCount = 0;
  let elementCount = 0;
  let attributeCount = 0;
  let offset = 0;
  while (offset < source.length) {
    const tagStart = source.indexOf("<", offset);
    if (tagStart < 0) {
      const trailing = source.slice(offset);
      if (trailing.trim()) visitor.text?.(decodeXmlText(trailing), stack);
      offset = source.length;
      break;
    }
    const text = source.slice(offset, tagStart);
    if (text.trim() || stack.at(-1) === "a:t") {
      visitor.text?.(decodeXmlText(text), stack);
    }
    const tagEnd = findTagEnd(source, tagStart + 1);
    const raw = source.slice(tagStart + 1, tagEnd);
    if (!raw || raw.startsWith("!") || raw.startsWith("?")) fail();

    if (raw.startsWith("/")) {
      const closingName = raw.slice(1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(closingName)) fail();
      if (stack.pop() !== closingName) fail();
      visitor.end?.(closingName, stack.length);
      offset = tagEnd + 1;
      continue;
    }

    const selfClosing = /\/\s*$/u.test(raw);
    const content = selfClosing ? raw.replace(/\/\s*$/u, "") : raw;
    const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/u.exec(content);
    if (!nameMatch) fail();
    const name = nameMatch[1]!;
    if (!allowedElementPrefixes.has(elementPrefix(name))) fail();
    const attributes = strictXmlAttributes(content.slice(nameMatch[0].length));
    elementCount += 1;
    attributeCount += attributes.size;
    if (
      elementCount > MAX_XML_ELEMENTS
      || attributeCount > MAX_XML_ATTRIBUTES
      || stack.length >= MAX_XML_DEPTH
    ) fail();
    for (const [attributeName, value] of attributes) {
      if (attributeName === "xmlns:a" && value !== DRAWINGML_NS) fail();
      if (attributeName === "xmlns:p" && value !== PRESENTATIONML_NS) fail();
      if (attributeName === "xmlns:r" && value !== OFFICE_REL_NS) fail();
      if (
        attributeName.startsWith("xmlns:")
        && value === DRAWINGML_NS
        && attributeName !== "xmlns:a"
      ) fail();
      if (
        attributeName.startsWith("xmlns:")
        && value === PRESENTATIONML_NS
        && attributeName !== "xmlns:p"
      ) fail();
      if (
        attributeName.startsWith("xmlns:")
        && value === OFFICE_REL_NS
        && attributeName !== "xmlns:r"
      ) fail();
    }
    if (stack.length === 0) rootCount += 1;
    const element: StrictXmlElement = {
      name,
      attributes,
      depth: stack.length,
      selfClosing,
      ancestors: stack,
    };
    visitor.start?.(element);
    if (selfClosing) {
      visitor.end?.(name, stack.length);
    } else {
      stack.push(name);
    }
    offset = tagEnd + 1;
  }
  if (stack.length !== 0 || rootCount !== 1) fail();
}

const FORBIDDEN_SLIDE_ELEMENTS = new Set([
  "p:bg",
  "p:pic",
  "p:graphicFrame",
  "p:oleObj",
  "p:contentPart",
  "p:cxnSp",
  "p:grpSp",
  "p:style",
  "p:ph",
  "p:txStyles",
  "a:blip",
  "a:graphic",
  "a:custGeom",
  "a:defRPr",
  "a:endParaRPr",
  "a:effectLst",
  "a:effectDag",
  "a:scene3d",
  "a:sp3d",
]);

const FORBIDDEN_TEMPLATE_ELEMENTS = new Set([
  "p:clrMap",
  "p:clrMapOvr",
  "a:overrideClrMapping",
]);

const STRICT_SLIDE_ELEMENTS = new Set([
  "p:sld",
  "p:cSld",
  "p:spTree",
  "p:sp",
  "p:nvSpPr",
  "p:cNvPr",
  "p:cNvSpPr",
  "p:nvPr",
  "p:spPr",
  "p:txBody",
  "p:clrMapOvr",
  "a:xfrm",
  "a:off",
  "a:ext",
  "a:prstGeom",
  "a:avLst",
  "a:noFill",
  "a:solidFill",
  "a:srgbClr",
  "a:ln",
  "a:bodyPr",
  "a:lstStyle",
  "a:p",
  "a:r",
  "a:rPr",
  "a:latin",
  "a:t",
  "a:masterClrMapping",
]);

const STRICT_SHAPE_ELEMENTS = new Set([
  "p:nvSpPr",
  "p:cNvPr",
  "p:cNvSpPr",
  "p:nvPr",
  "p:spPr",
  "p:txBody",
  "a:xfrm",
  "a:off",
  "a:ext",
  "a:prstGeom",
  "a:avLst",
  "a:noFill",
  "a:solidFill",
  "a:srgbClr",
  "a:ln",
  "a:bodyPr",
  "a:lstStyle",
  "a:p",
  "a:r",
  "a:rPr",
  "a:latin",
  "a:t",
]);

const PRESENTON_SLIDE_ELEMENTS = new Set([
  "p:sld",
  "p:cSld",
  "p:bg",
  "p:bgPr",
  "p:spTree",
  "p:nvGrpSpPr",
  "p:cNvPr",
  "p:cNvGrpSpPr",
  "p:nvPr",
  "p:grpSpPr",
  "p:sp",
  "p:nvSpPr",
  "p:cNvSpPr",
  "p:spPr",
  "p:style",
  "p:txBody",
  "p:clrMapOvr",
  "a:xfrm",
  "a:off",
  "a:ext",
  "a:chOff",
  "a:chExt",
  "a:prstGeom",
  "a:avLst",
  "a:solidFill",
  "a:srgbClr",
  "a:noFill",
  "a:ln",
  "a:effectLst",
  "a:outerShdw",
  "a:alpha",
  "a:lnRef",
  "a:fillRef",
  "a:effectRef",
  "a:fontRef",
  "a:schemeClr",
  "a:bodyPr",
  "a:spAutoFit",
  "a:lstStyle",
  "a:p",
  "a:pPr",
  "a:lnSpc",
  "a:spcPct",
  "a:defRPr",
  "a:r",
  "a:rPr",
  "a:latin",
  "a:t",
  "a:masterClrMapping",
]);

const MIN_TEXT_BOX_WIDTH_EMU = 457_200;
const MIN_TEXT_BOX_HEIGHT_EMU = 228_600;
const MIN_TEXT_LINE_HEIGHT_EMU = 200_000;
const EMU_PER_INCH = 914_400;
// Default-style text still needs enough physical area to avoid silent clipping.
// This intentionally conservative density is an allowlist constraint, not a
// claim to reproduce PowerPoint's font-layout engine.
const MAX_TEXT_CODE_POINTS_PER_SQUARE_INCH = 12;

interface SlideSize {
  width: number;
  height: number;
}

interface TextShapeState {
  nonVisualPropertiesCount: number;
  nonVisualCanvasCount: number;
  nonVisualShapeCount: number;
  nonVisualApplicationCount: number;
  canvasPropertiesCount: number;
  transformCount: number;
  offsetCount: number;
  extentCount: number;
  geometryCount: number;
  adjustmentListCount: number;
  shapeNoFillCount: number;
  shapeSolidFillCount: number;
  lineCount: number;
  lineNoFillCount: number;
  textBodyCount: number;
  bodyPropertiesCount: number;
  listStyleCount: number;
  runCount: number;
  runPropertiesCount: number;
  runFontCount: number;
  paragraphs: string[];
  shapeFillColor?: string;
  runColors: string[];
  runFontSizes: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface VerifiedTextShape {
  x: number;
  y: number;
  width: number;
  height: number;
  paragraphs: readonly string[];
  colors: readonly string[];
}

interface SlideVisualMetrics {
  paragraphs: string[];
  vectorShapeCount: number;
  styledTextRunCount: number;
  hasBackground: boolean;
  hasVectorAccents: boolean;
  paletteColors: string[];
  layoutSignature: string;
}

function assertOnlyAttributes(
  element: StrictXmlElement,
  allowed: ReadonlySet<string> = new Set(),
) {
  if ([...element.attributes.keys()].some((name) => !allowed.has(name))) fail();
}

function assertDirectParent(element: StrictXmlElement, expected: string) {
  if (element.ancestors.at(-1) !== expected) fail();
}

function nonnegativeIntegerAttribute(element: StrictXmlElement, name: string) {
  const value = Number(element.attributes.get(name));
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
}

const RICH_STATIC_PALETTE = new Set<string>(RICH_STATIC_VISUAL_PROFILE.palette);
const RICH_STATIC_FONTS = new Set<string>(RICH_STATIC_VISUAL_PROFILE.fontFamilies);

function parsePaletteColor(element: StrictXmlElement) {
  assertOnlyAttributes(element, new Set(["val"]));
  const color = element.attributes.get("val")?.toUpperCase();
  if (!color || !RICH_STATIC_PALETTE.has(color)) fail();
  return color;
}

function relativeLuminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(left: string, right: string) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

function extractSlideParagraphs(
  xml: Buffer,
  expectedRoot: "p:sld",
  slideSize: SlideSize,
): SlideVisualMetrics;
function extractSlideParagraphs(
  xml: Buffer,
  expectedRoot: "p:sldMaster" | "p:sldLayout",
): string[];
function extractSlideParagraphs(
  xml: Buffer,
  expectedRoot = "p:sld",
  slideSize?: SlideSize,
): SlideVisualMetrics | string[] {
  const templateParagraphs: string[] = [];
  const textShapes: VerifiedTextShape[] = [];
  const vectorSignatures: string[] = [];
  const paletteColors = new Set<string>();
  const nonVisualIds = new Set<number>();
  let paragraph: string | null = null;
  let paragraphRunCount = 0;
  let runTextCount: number | null = null;
  let currentRunHasProperties = false;
  let rootAttributes: Map<string, string> | undefined;
  let shape: TextShapeState | null = null;
  let commonSlideDataCount = 0;
  let shapeTreeCount = 0;
  let colorMapOverrideCount = 0;
  let masterColorMappingCount = 0;
  let backgroundColor: string | undefined;
  let vectorShapeCount = 0;
  let styledTextRunCount = 0;
  let vectorAccentCount = 0;
  let seenTextShape = false;
  walkStrictXml(xml, new Set(["p", "a", "r"]), {
    start(element) {
      if (element.depth === 0) {
        if (element.name !== expectedRoot) fail();
        rootAttributes = element.attributes;
      }
      for (const [name, value] of element.attributes) {
        if (
          (name === "hidden" && ["1", "true"].includes(value.toLowerCase()))
          || (name === "show" && ["0", "false"].includes(value.toLowerCase()))
        ) fail();
      }
      if (FORBIDDEN_SLIDE_ELEMENTS.has(element.name)) fail();
      if (
        expectedRoot !== "p:sld"
        && FORBIDDEN_TEMPLATE_ELEMENTS.has(element.name)
      ) fail();
      if (expectedRoot === "p:sld" && !STRICT_SLIDE_ELEMENTS.has(element.name)) fail();
      if (expectedRoot !== "p:sld" && element.name === "p:sp") fail();

      if (expectedRoot === "p:sld") {
        switch (element.name) {
          case "p:sld":
            assertOnlyAttributes(element, new Set(["xmlns:p", "xmlns:a", "xmlns:r"]));
            break;
          case "p:cSld":
            assertDirectParent(element, "p:sld");
            assertOnlyAttributes(element);
            commonSlideDataCount += 1;
            break;
          case "p:spTree":
            assertDirectParent(element, "p:cSld");
            assertOnlyAttributes(element);
            shapeTreeCount += 1;
            break;
          case "p:clrMapOvr":
            assertDirectParent(element, "p:sld");
            assertOnlyAttributes(element);
            colorMapOverrideCount += 1;
            break;
          case "a:masterClrMapping":
            assertDirectParent(element, "p:clrMapOvr");
            assertOnlyAttributes(element);
            if (!element.selfClosing) fail();
            masterColorMappingCount += 1;
            break;
        }
      }

      if (element.name === "p:sp") {
        if (expectedRoot !== "p:sld" || !slideSize || shape) fail();
        assertDirectParent(element, "p:spTree");
        assertOnlyAttributes(element);
        shape = {
          nonVisualPropertiesCount: 0,
          nonVisualCanvasCount: 0,
          nonVisualShapeCount: 0,
          nonVisualApplicationCount: 0,
          canvasPropertiesCount: 0,
          transformCount: 0,
          offsetCount: 0,
          extentCount: 0,
          geometryCount: 0,
          adjustmentListCount: 0,
          shapeNoFillCount: 0,
          shapeSolidFillCount: 0,
          lineCount: 0,
          lineNoFillCount: 0,
          textBodyCount: 0,
          bodyPropertiesCount: 0,
          listStyleCount: 0,
          runCount: 0,
          runPropertiesCount: 0,
          runFontCount: 0,
          paragraphs: [],
          runColors: [],
          runFontSizes: [],
        };
      }
      if (
        expectedRoot === "p:sld"
        && STRICT_SHAPE_ELEMENTS.has(element.name)
        && !shape
      ) fail();
      if (shape && element.name === "p:nvSpPr") {
        assertDirectParent(element, "p:sp");
        assertOnlyAttributes(element);
        shape.nonVisualPropertiesCount += 1;
      }
      if (shape && element.name === "p:cNvPr") {
        assertDirectParent(element, "p:nvSpPr");
        assertOnlyAttributes(element, new Set(["id", "name"]));
        if (!element.selfClosing) fail();
        const id = nonnegativeIntegerAttribute(element, "id");
        const name = element.attributes.get("name");
        if (id < 1 || !name || name.length > 255 || nonVisualIds.has(id)) fail();
        nonVisualIds.add(id);
        shape.nonVisualCanvasCount += 1;
      }
      if (shape && element.name === "p:cNvSpPr") {
        assertDirectParent(element, "p:nvSpPr");
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        shape.nonVisualShapeCount += 1;
      }
      if (shape && element.name === "p:nvPr") {
        assertDirectParent(element, "p:nvSpPr");
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        shape.nonVisualApplicationCount += 1;
      }
      if (shape && element.name === "p:spPr") {
        assertDirectParent(element, "p:sp");
        assertOnlyAttributes(element);
        shape.canvasPropertiesCount += 1;
      }
      if (shape && element.name === "a:xfrm") {
        assertDirectParent(element, "p:spPr");
        assertOnlyAttributes(element);
        shape.transformCount += 1;
      }
      if (shape && element.name === "a:off") {
        assertDirectParent(element, "a:xfrm");
        assertOnlyAttributes(element, new Set(["x", "y"]));
        if (!element.selfClosing) fail();
        shape.x = nonnegativeIntegerAttribute(element, "x");
        shape.y = nonnegativeIntegerAttribute(element, "y");
        shape.offsetCount += 1;
      }
      if (shape && element.name === "a:ext") {
        assertDirectParent(element, "a:xfrm");
        assertOnlyAttributes(element, new Set(["cx", "cy"]));
        if (!element.selfClosing) fail();
        shape.width = nonnegativeIntegerAttribute(element, "cx");
        shape.height = nonnegativeIntegerAttribute(element, "cy");
        shape.extentCount += 1;
      }
      if (shape && element.name === "a:prstGeom") {
        assertDirectParent(element, "p:spPr");
        assertOnlyAttributes(element, new Set(["prst"]));
        if (!new Set(["rect", "roundRect", "ellipse"]).has(
          element.attributes.get("prst") ?? "",
        )) fail();
        shape.geometryCount += 1;
      }
      if (shape && element.name === "a:avLst") {
        assertDirectParent(element, "a:prstGeom");
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        shape.adjustmentListCount += 1;
      }
      if (shape && element.name === "a:ln") {
        assertDirectParent(element, "p:spPr");
        assertOnlyAttributes(element);
        shape.lineCount += 1;
      }
      if (shape && element.name === "a:noFill") {
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        if (element.ancestors.at(-1) === "p:spPr") shape.shapeNoFillCount += 1;
        else if (
          element.ancestors.at(-1) === "a:ln"
          && element.ancestors.at(-2) === "p:spPr"
        ) shape.lineNoFillCount += 1;
        else fail();
      }
      if (shape && element.name === "a:solidFill") {
        assertOnlyAttributes(element);
        if (element.ancestors.at(-1) === "p:spPr") {
          shape.shapeSolidFillCount += 1;
        } else if (element.ancestors.at(-1) !== "a:rPr") {
          fail();
        }
      }
      if (shape && element.name === "a:srgbClr") {
        assertDirectParent(element, "a:solidFill");
        if (!element.selfClosing) fail();
        const color = parsePaletteColor(element);
        paletteColors.add(color);
        if (element.ancestors.at(-2) === "p:spPr") {
          if (shape.shapeFillColor) fail();
          shape.shapeFillColor = color;
        } else if (element.ancestors.at(-2) === "a:rPr") {
          shape.runColors.push(color);
        } else {
          fail();
        }
      }
      if (shape && element.name === "p:txBody") {
        assertDirectParent(element, "p:sp");
        assertOnlyAttributes(element);
        shape.textBodyCount += 1;
      }
      if (shape && element.name === "a:bodyPr") {
        assertDirectParent(element, "p:txBody");
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        shape.bodyPropertiesCount += 1;
      }
      if (shape && element.name === "a:lstStyle") {
        assertDirectParent(element, "p:txBody");
        assertOnlyAttributes(element);
        if (!element.selfClosing) fail();
        shape.listStyleCount += 1;
      }
      if (element.name === "a:p") {
        if (paragraph !== null) fail();
        if (expectedRoot === "p:sld") {
          if (!shape) fail();
          assertDirectParent(element, "p:txBody");
          assertOnlyAttributes(element);
        }
        paragraph = "";
        paragraphRunCount = 0;
      }
      if (element.name === "a:r") {
        if (paragraph === null || runTextCount !== null) fail();
        if (expectedRoot === "p:sld") {
          assertDirectParent(element, "a:p");
          assertOnlyAttributes(element);
        }
        runTextCount = 0;
        currentRunHasProperties = false;
        paragraphRunCount += 1;
        if (shape) shape.runCount += 1;
      }
      if (shape && element.name === "a:rPr") {
        assertDirectParent(element, "a:r");
        assertOnlyAttributes(element, new Set(["lang", "sz", "b", "i"]));
        const size = Number(element.attributes.get("sz"));
        if (
          !Number.isSafeInteger(size)
          || size < 1_200
          || size > 7_200
          || (element.attributes.has("b")
            && !["0", "1", "false", "true"].includes(
              element.attributes.get("b")!.toLowerCase(),
            ))
          || (element.attributes.has("i")
            && !["0", "1", "false", "true"].includes(
              element.attributes.get("i")!.toLowerCase(),
            ))
          || currentRunHasProperties
        ) fail();
        shape.runFontSizes.push(size);
        shape.runPropertiesCount += 1;
        currentRunHasProperties = true;
      }
      if (shape && element.name === "a:latin") {
        assertDirectParent(element, "a:rPr");
        assertOnlyAttributes(element, new Set(["typeface"]));
        if (!element.selfClosing) fail();
        const typeface = element.attributes.get("typeface");
        if (!typeface || !RICH_STATIC_FONTS.has(typeface)) fail();
        shape.runFontCount += 1;
      }
      if (element.name === "a:t") {
        if (paragraph === null || runTextCount === null) fail();
        if (expectedRoot === "p:sld") {
          assertDirectParent(element, "a:r");
          assertOnlyAttributes(element, new Set(["xml:space"]));
          const xmlSpace = element.attributes.get("xml:space");
          if (xmlSpace !== undefined && !["default", "preserve"].includes(xmlSpace)) fail();
        }
        runTextCount += 1;
      }
    },
    text(value, ancestors) {
      if (ancestors.at(-1) === "a:t") {
        if (paragraph === null) fail();
        paragraph += value;
      } else if (value.trim()) {
        fail();
      }
    },
    end(name) {
      if (name === "a:r") {
        if (runTextCount !== 1 || !currentRunHasProperties) fail();
        runTextCount = null;
        currentRunHasProperties = false;
        return;
      }
      if (name === "a:p") {
        if (paragraph === null || runTextCount !== null || paragraphRunCount < 1) fail();
        const text = normalizedText(paragraph);
        if (!text) fail();
        if (shape) shape.paragraphs.push(text);
        else templateParagraphs.push(text);
        paragraph = null;
        return;
      }
      if (name !== "p:sp") return;
      if (!shape || !slideSize) fail();
      const { x, y, width, height } = shape;
      if (
        shape.nonVisualPropertiesCount !== 1
        || shape.nonVisualCanvasCount !== 1
        || shape.nonVisualShapeCount !== 1
        || shape.nonVisualApplicationCount !== 1
        || shape.canvasPropertiesCount !== 1
        || shape.transformCount !== 1
        || shape.offsetCount !== 1
        || shape.extentCount !== 1
        || shape.geometryCount !== 1
        || shape.adjustmentListCount !== 1
        || shape.shapeNoFillCount + shape.shapeSolidFillCount !== 1
        || shape.lineCount !== 1
        || shape.lineNoFillCount !== 1
        || x === undefined
        || y === undefined
        || width === undefined
        || height === undefined
        || width < 1
        || height < 1
        || !Number.isSafeInteger(x + width)
        || !Number.isSafeInteger(y + height)
        || x + width > slideSize.width
        || y + height > slideSize.height
      ) fail();

      const isTextShape = shape.textBodyCount > 0;
      if (!isTextShape) {
        if (
          seenTextShape
          || shape.textBodyCount !== 0
          || shape.bodyPropertiesCount !== 0
          || shape.listStyleCount !== 0
          || shape.paragraphs.length !== 0
          || shape.runCount !== 0
          || shape.runPropertiesCount !== 0
          || shape.runFontCount !== 0
          || shape.runColors.length !== 0
          || shape.runFontSizes.length !== 0
          || shape.shapeSolidFillCount !== 1
          || !shape.shapeFillColor
        ) fail();
        vectorShapeCount += 1;
        const signature = [x, y, width, height, shape.shapeFillColor].join(":");
        vectorSignatures.push(signature);
        if (x === 0 && y === 0 && width === slideSize.width && height === slideSize.height) {
          if (backgroundColor) fail();
          backgroundColor = shape.shapeFillColor;
        } else {
          vectorAccentCount += 1;
        }
        shape = null;
        return;
      }

      seenTextShape = true;
      if (
        shape.textBodyCount !== 1
        || shape.bodyPropertiesCount !== 1
        || shape.listStyleCount !== 1
        || shape.paragraphs.length < 1
        || shape.runCount < 1
        || shape.runPropertiesCount !== shape.runCount
        || shape.runFontCount !== shape.runCount
        || shape.runColors.length !== shape.runCount
        || shape.runFontSizes.length !== shape.runCount
        || width < Math.max(MIN_TEXT_BOX_WIDTH_EMU, Math.ceil(slideSize.width / 20))
        || height < Math.max(
          MIN_TEXT_BOX_HEIGHT_EMU,
          Math.ceil(slideSize.height / 40),
          shape.paragraphs.length * MIN_TEXT_LINE_HEIGHT_EMU,
        )
      ) fail();
      const textCodePoints = shape.paragraphs.reduce(
        (total, text) => total + [...text].length,
        0,
      );
      const conservativeCapacity = Math.floor(
        (width / EMU_PER_INCH)
        * (height / EMU_PER_INCH)
        * MAX_TEXT_CODE_POINTS_PER_SQUARE_INCH,
      );
      if (textCodePoints > conservativeCapacity) fail();
      styledTextRunCount += shape.runCount;
      textShapes.push({
        x,
        y,
        width,
        height,
        paragraphs: shape.paragraphs,
        colors: shape.runColors,
      });
      shape = null;
    },
  });
  if (
    rootAttributes?.get("xmlns:p") !== PRESENTATIONML_NS
    || rootAttributes.get("xmlns:a") !== DRAWINGML_NS
    || rootAttributes.get("xmlns:r") !== OFFICE_REL_NS
  ) fail();
  if (expectedRoot !== "p:sld") return templateParagraphs;
  if (
    commonSlideDataCount !== 1
    || shapeTreeCount !== 1
    || colorMapOverrideCount !== 1
    || masterColorMappingCount !== 1
  ) fail();
  for (let leftIndex = 0; leftIndex < textShapes.length; leftIndex += 1) {
    const left = textShapes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < textShapes.length; rightIndex += 1) {
      const right = textShapes[rightIndex]!;
      if (
        left.x < right.x + right.width
        && right.x < left.x + left.width
        && left.y < right.y + right.height
        && right.y < left.y + left.height
      ) fail();
    }
  }
  if (!backgroundColor || vectorAccentCount < 1 || styledTextRunCount < 1) fail();
  for (const textShape of textShapes) {
    if (textShape.colors.some((color) => contrastRatio(color, backgroundColor!) < 4.5)) fail();
  }
  const paragraphs = textShapes
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .flatMap((textShape) => textShape.paragraphs);
  return {
    paragraphs,
    vectorShapeCount,
    styledTextRunCount,
    hasBackground: true,
    hasVectorAccents: true,
    paletteColors: [...paletteColors].sort(),
    layoutSignature: createHash("sha256")
      .update(JSON.stringify(vectorSignatures))
      .digest("hex"),
  } satisfies SlideVisualMetrics;
}

interface PresentonParsedShape {
  zIndex: number;
  kind: "text" | "vector";
  geometry: "ellipse" | "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  paragraphs: string[];
  runColors: string[];
  runFontSizes: number[];
}

interface PresentonShapeState {
  zIndex: number;
  id?: number;
  name?: string;
  textBox: boolean;
  nonVisualPropertiesCount: number;
  nonVisualCanvasCount: number;
  nonVisualShapeCount: number;
  nonVisualApplicationCount: number;
  shapePropertiesCount: number;
  transformCount: number;
  offsetCount: number;
  extentCount: number;
  geometryCount: number;
  adjustmentListCount: number;
  solidFillCount: number;
  noFillCount: number;
  lineCount: number;
  lineNoFillCount: number;
  effectListCount: number;
  shadowCount: number;
  shadowColorCount: number;
  shadowAlphaCount: number;
  styleCount: number;
  textBodyCount: number;
  bodyPropertiesCount: number;
  autoFitCount: number;
  listStyleCount: number;
  paragraphCount: number;
  runCount: number;
  runPropertiesCount: number;
  runFontCount: number;
  defaultRunPropertiesCount: number;
  defaultRunFontCount: number;
  paragraphs: string[];
  runColors: string[];
  runFontSizes: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  geometry?: "ellipse" | "rect";
  fillColor?: string;
}

interface PresentonParagraphState {
  text: string;
  runCount: number;
  propertiesCount: number;
  lineSpacingCount: number;
  spacingPercentCount: number;
  defaultPropertiesCount: number;
}

interface PresentonRunState {
  textCount: number;
  propertiesCount: number;
  fontCount: number;
  color?: string;
  fontSize?: number;
}

function rectanglesOverlap(
  left: Pick<PresentonParsedShape, "x" | "y" | "width" | "height">,
  right: Pick<PresentonParsedShape, "x" | "y" | "width" | "height">,
) {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height;
}

const PRESENTON_EMU_PER_PIXEL = 9_525;

function expectedPresentonLayoutSignature(
  layoutId: RichStaticLayoutId,
  bulletCount: number,
) {
  if (!Number.isInteger(bulletCount) || bulletCount < 0 || bulletCount > 3) fail();
  const blueprint = PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS[layoutId];
  const frame = (value: { x: number; y: number; width: number; height: number }) => ({
    x: value.x * PRESENTON_EMU_PER_PIXEL,
    y: value.y * PRESENTON_EMU_PER_PIXEL,
    width: value.width * PRESENTON_EMU_PER_PIXEL,
    height: value.height * PRESENTON_EMU_PER_PIXEL,
  });
  return sha256Hex(JSON.stringify([
    ...blueprint.shapes.map((shape) => ({
      kind: "vector",
      geometry: shape.type === "rectangle" ? "rect" : "ellipse",
      ...frame(shape.frame),
      fillColor: shape.color.slice(1).toUpperCase(),
      runColors: [],
      runFontSizes: [],
    })),
    {
      kind: "text",
      geometry: "rect",
      ...frame(blueprint.headlineFrame),
      fillColor: null,
      runColors: ["111827"],
      runFontSizes: [4_800],
    },
    ...blueprint.bulletFrames.slice(0, bulletCount).map((bulletFrame) => ({
      kind: "text",
      geometry: "rect",
      ...frame(bulletFrame),
      fillColor: null,
      runColors: ["111827"],
      runFontSizes: [2_400],
    })),
  ]));
}

function assertXmlBoolean(value: string | undefined) {
  if (!value || !["0", "1", "false", "true"].includes(value.toLowerCase())) fail();
}

/**
 * Parse only the tiny DrawingML grammar emitted by the pinned Presenton
 * component exporter. All visible text must use explicit Arial runs and all
 * decoration must be direct, in-bounds native vector geometry.
 */
function extractPresentonSlideMetrics(
  xml: Buffer,
  slideSize: SlideSize,
): SlideVisualMetrics {
  const shapes: PresentonParsedShape[] = [];
  const paletteColors = new Set<string>();
  const nonVisualIds = new Set<number>();
  let shape: PresentonShapeState | null = null;
  let paragraph: PresentonParagraphState | null = null;
  let run: PresentonRunState | null = null;
  let rootAttributes: Map<string, string> | undefined;
  let commonSlideDataCount = 0;
  let backgroundCount = 0;
  let backgroundPropertiesCount = 0;
  let backgroundFillCount = 0;
  let backgroundEffectCount = 0;
  let backgroundColor: string | undefined;
  let shapeTreeCount = 0;
  let groupNonVisualCount = 0;
  let groupCanvasCount = 0;
  let groupShapeCount = 0;
  let groupApplicationCount = 0;
  let groupPropertiesCount = 0;
  let groupTransformCount = 0;
  const groupCoordinateCounts = new Map<string, number>();
  let colorMapOverrideCount = 0;
  let masterColorMappingCount = 0;

  walkStrictXml(xml, new Set(["p", "a", "r"]), {
    start(element) {
      if (!PRESENTON_SLIDE_ELEMENTS.has(element.name)) fail();
      for (const [name, value] of element.attributes) {
        if (
          (name === "hidden" && ["1", "true"].includes(value.toLowerCase()))
          || (name === "show" && ["0", "false"].includes(value.toLowerCase()))
        ) fail();
      }
      if (element.depth === 0) {
        if (element.name !== "p:sld") fail();
        assertOnlyAttributes(element, new Set(["xmlns:a", "xmlns:p", "xmlns:r"]));
        rootAttributes = element.attributes;
        return;
      }

      switch (element.name) {
        case "p:cSld":
          assertDirectParent(element, "p:sld");
          assertOnlyAttributes(element);
          commonSlideDataCount += 1;
          return;
        case "p:bg":
          assertDirectParent(element, "p:cSld");
          assertOnlyAttributes(element);
          backgroundCount += 1;
          return;
        case "p:bgPr":
          assertDirectParent(element, "p:bg");
          assertOnlyAttributes(element);
          backgroundPropertiesCount += 1;
          return;
        case "p:spTree":
          assertDirectParent(element, "p:cSld");
          assertOnlyAttributes(element);
          shapeTreeCount += 1;
          return;
        case "p:nvGrpSpPr":
          assertDirectParent(element, "p:spTree");
          assertOnlyAttributes(element);
          groupNonVisualCount += 1;
          return;
        case "p:cNvGrpSpPr":
          assertDirectParent(element, "p:nvGrpSpPr");
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          groupShapeCount += 1;
          return;
        case "p:grpSpPr":
          assertDirectParent(element, "p:spTree");
          assertOnlyAttributes(element);
          groupPropertiesCount += 1;
          return;
        case "p:sp":
          assertDirectParent(element, "p:spTree");
          assertOnlyAttributes(element);
          if (shape || paragraph || run) fail();
          shape = {
            zIndex: shapes.length,
            textBox: false,
            nonVisualPropertiesCount: 0,
            nonVisualCanvasCount: 0,
            nonVisualShapeCount: 0,
            nonVisualApplicationCount: 0,
            shapePropertiesCount: 0,
            transformCount: 0,
            offsetCount: 0,
            extentCount: 0,
            geometryCount: 0,
            adjustmentListCount: 0,
            solidFillCount: 0,
            noFillCount: 0,
            lineCount: 0,
            lineNoFillCount: 0,
            effectListCount: 0,
            shadowCount: 0,
            shadowColorCount: 0,
            shadowAlphaCount: 0,
            styleCount: 0,
            textBodyCount: 0,
            bodyPropertiesCount: 0,
            autoFitCount: 0,
            listStyleCount: 0,
            paragraphCount: 0,
            runCount: 0,
            runPropertiesCount: 0,
            runFontCount: 0,
            defaultRunPropertiesCount: 0,
            defaultRunFontCount: 0,
            paragraphs: [],
            runColors: [],
            runFontSizes: [],
          };
          return;
        case "p:nvSpPr":
          if (!shape) fail();
          assertDirectParent(element, "p:sp");
          assertOnlyAttributes(element);
          shape.nonVisualPropertiesCount += 1;
          return;
        case "p:cNvPr": {
          assertOnlyAttributes(element, new Set(["id", "name"]));
          if (!element.selfClosing) fail();
          const id = nonnegativeIntegerAttribute(element, "id");
          const name = element.attributes.get("name");
          if (element.ancestors.at(-1) === "p:nvGrpSpPr") {
            if (id !== 1 || name !== "" || nonVisualIds.has(id)) fail();
            nonVisualIds.add(id);
            groupCanvasCount += 1;
            return;
          }
          if (!shape || element.ancestors.at(-1) !== "p:nvSpPr") fail();
          if (
            id < 2
            || id !== shapes.length + 2
            || !name
            || name.length > 255
            || !/^(?:Oval|Rectangle|TextBox) [1-9][0-9]*$/u.test(name)
            || nonVisualIds.has(id)
          ) fail();
          nonVisualIds.add(id);
          shape.id = id;
          shape.name = name;
          shape.nonVisualCanvasCount += 1;
          return;
        }
        case "p:cNvSpPr":
          if (!shape) fail();
          assertDirectParent(element, "p:nvSpPr");
          assertOnlyAttributes(element, new Set(["txBox"]));
          if (!element.selfClosing) fail();
          if (element.attributes.has("txBox")) {
            if (element.attributes.get("txBox") !== "1") fail();
            shape.textBox = true;
          }
          shape.nonVisualShapeCount += 1;
          return;
        case "p:nvPr":
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          if (element.ancestors.at(-1) === "p:nvGrpSpPr") {
            groupApplicationCount += 1;
          } else {
            if (!shape || element.ancestors.at(-1) !== "p:nvSpPr") fail();
            shape.nonVisualApplicationCount += 1;
          }
          return;
        case "p:spPr":
          if (!shape) fail();
          assertDirectParent(element, "p:sp");
          assertOnlyAttributes(element);
          shape.shapePropertiesCount += 1;
          return;
        case "a:xfrm":
          assertOnlyAttributes(element);
          if (element.ancestors.at(-1) === "p:grpSpPr") {
            groupTransformCount += 1;
          } else {
            if (!shape || element.ancestors.at(-1) !== "p:spPr") fail();
            shape.transformCount += 1;
          }
          return;
        case "a:off":
        case "a:ext":
        case "a:chOff":
        case "a:chExt": {
          assertDirectParent(element, "a:xfrm");
          const isExtent = element.name === "a:ext" || element.name === "a:chExt";
          assertOnlyAttributes(element, new Set(isExtent ? ["cx", "cy"] : ["x", "y"]));
          if (!element.selfClosing) fail();
          const first = nonnegativeIntegerAttribute(element, isExtent ? "cx" : "x");
          const second = nonnegativeIntegerAttribute(element, isExtent ? "cy" : "y");
          if (element.ancestors.at(-2) === "p:grpSpPr") {
            if (first !== 0 || second !== 0) fail();
            groupCoordinateCounts.set(
              element.name,
              (groupCoordinateCounts.get(element.name) ?? 0) + 1,
            );
            return;
          }
          if (!shape || !["a:off", "a:ext"].includes(element.name)) fail();
          if (element.name === "a:off") {
            shape.x = first;
            shape.y = second;
            shape.offsetCount += 1;
          } else {
            shape.width = first;
            shape.height = second;
            shape.extentCount += 1;
          }
          return;
        }
        case "a:prstGeom": {
          if (!shape) fail();
          assertDirectParent(element, "p:spPr");
          assertOnlyAttributes(element, new Set(["prst"]));
          const geometry = element.attributes.get("prst");
          if (geometry !== "rect" && geometry !== "ellipse") fail();
          shape.geometry = geometry;
          shape.geometryCount += 1;
          return;
        }
        case "a:avLst":
          if (!shape) fail();
          assertDirectParent(element, "a:prstGeom");
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          shape.adjustmentListCount += 1;
          return;
        case "a:solidFill": {
          assertOnlyAttributes(element);
          const parent = element.ancestors.at(-1);
          if (parent === "p:bgPr") backgroundFillCount += 1;
          else if (parent === "p:spPr") {
            if (!shape) fail();
            shape.solidFillCount += 1;
          } else if (parent !== "a:defRPr" && parent !== "a:rPr") fail();
          return;
        }
        case "a:srgbClr": {
          assertOnlyAttributes(element, new Set(["val"]));
          const color = element.attributes.get("val")?.toUpperCase();
          if (!color || !RICH_STATIC_PALETTE.has(color)) fail();
          const parent = element.ancestors.at(-1);
          const grandparent = element.ancestors.at(-2);
          if (parent === "a:outerShdw") {
            if (!shape || color !== "000000" || element.selfClosing) fail();
            shape.shadowColorCount += 1;
            return;
          }
          if (parent !== "a:solidFill") fail();
          paletteColors.add(color);
          if (grandparent === "p:bgPr") {
            if (!element.selfClosing || backgroundColor) fail();
            backgroundColor = color;
          } else if (grandparent === "p:spPr") {
            if (!shape || !element.selfClosing || shape.fillColor) fail();
            shape.fillColor = color;
          } else if (grandparent === "a:defRPr") {
            if (!shape || !element.selfClosing || color !== "111827") fail();
          } else if (grandparent === "a:rPr") {
            if (!shape || !run || !element.selfClosing || run.color) fail();
            run.color = color;
          } else fail();
          return;
        }
        case "a:noFill": {
          if (!shape) fail();
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          if (element.ancestors.at(-1) === "p:spPr") shape.noFillCount += 1;
          else if (
            element.ancestors.at(-1) === "a:ln"
            && element.ancestors.at(-2) === "p:spPr"
          ) shape.lineNoFillCount += 1;
          else fail();
          return;
        }
        case "a:ln":
          if (!shape) fail();
          assertDirectParent(element, "p:spPr");
          assertOnlyAttributes(element);
          shape.lineCount += 1;
          return;
        case "a:effectLst":
          assertOnlyAttributes(element);
          if (element.ancestors.at(-1) === "p:bgPr") {
            if (!element.selfClosing) fail();
            backgroundEffectCount += 1;
          } else {
            if (!shape || element.ancestors.at(-1) !== "p:spPr" || element.selfClosing) fail();
            shape.effectListCount += 1;
          }
          return;
        case "a:outerShdw":
          if (!shape) fail();
          assertDirectParent(element, "a:effectLst");
          assertOnlyAttributes(element, new Set(["blurRad", "dist", "dir"]));
          if (["blurRad", "dist", "dir"].some((name) => element.attributes.get(name) !== "0")) {
            fail();
          }
          shape.shadowCount += 1;
          return;
        case "a:alpha":
          if (!shape) fail();
          assertDirectParent(element, "a:srgbClr");
          assertOnlyAttributes(element, new Set(["val"]));
          if (!element.selfClosing || element.attributes.get("val") !== "0") fail();
          shape.shadowAlphaCount += 1;
          return;
        case "p:style":
          if (!shape) fail();
          assertDirectParent(element, "p:sp");
          assertOnlyAttributes(element);
          shape.styleCount += 1;
          return;
        case "a:lnRef":
        case "a:fillRef":
        case "a:effectRef":
        case "a:fontRef": {
          if (!shape) fail();
          assertDirectParent(element, "p:style");
          const expected = element.name === "a:fontRef" ? "minor"
            : element.name === "a:fillRef" ? "3"
              : element.name === "a:effectRef" ? "2" : "1";
          const attribute = element.name === "a:fontRef" ? "idx" : "idx";
          assertOnlyAttributes(element, new Set([attribute]));
          if (element.attributes.get(attribute) !== expected) fail();
          return;
        }
        case "a:schemeClr": {
          if (!shape) fail();
          assertOnlyAttributes(element, new Set(["val"]));
          if (!element.selfClosing) fail();
          const parent = element.ancestors.at(-1);
          const expected = parent === "a:fontRef" ? "lt1" : "accent1";
          if (!new Set(["a:lnRef", "a:fillRef", "a:effectRef", "a:fontRef"]).has(parent ?? "")
            || element.attributes.get("val") !== expected) fail();
          return;
        }
        case "p:txBody":
          if (!shape) fail();
          assertDirectParent(element, "p:sp");
          assertOnlyAttributes(element);
          shape.textBodyCount += 1;
          return;
        case "a:bodyPr": {
          if (!shape) fail();
          assertDirectParent(element, "p:txBody");
          const common = new Set(["wrap", "lIns", "rIns", "tIns", "bIns"]);
          const vector = new Set([...common, "rtlCol", "anchor"]);
          assertOnlyAttributes(element, shape.textBox ? common : vector);
          for (const name of ["lIns", "rIns", "tIns", "bIns"]) {
            if (element.attributes.get(name) !== "0") fail();
          }
          if (element.attributes.get("wrap") !== "square") fail();
          if (shape.textBox) {
            if (element.selfClosing) fail();
          } else if (
            !element.selfClosing
            || element.attributes.get("rtlCol") !== "0"
            || element.attributes.get("anchor") !== "ctr"
          ) fail();
          shape.bodyPropertiesCount += 1;
          return;
        }
        case "a:spAutoFit":
          if (!shape?.textBox) fail();
          assertDirectParent(element, "a:bodyPr");
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          shape.autoFitCount += 1;
          return;
        case "a:lstStyle":
          if (!shape) fail();
          assertDirectParent(element, "p:txBody");
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          shape.listStyleCount += 1;
          return;
        case "a:p":
          if (!shape || paragraph || run) fail();
          assertDirectParent(element, "p:txBody");
          assertOnlyAttributes(element);
          paragraph = {
            text: "",
            runCount: 0,
            propertiesCount: 0,
            lineSpacingCount: 0,
            spacingPercentCount: 0,
            defaultPropertiesCount: 0,
          };
          shape.paragraphCount += 1;
          return;
        case "a:pPr":
          if (!shape || !paragraph) fail();
          assertDirectParent(element, "a:p");
          assertOnlyAttributes(element, new Set(shape.textBox ? [] : ["algn"]));
          if (!shape.textBox) {
            if (!element.selfClosing || element.attributes.get("algn") !== "ctr") fail();
          } else if (element.selfClosing) fail();
          paragraph.propertiesCount += 1;
          return;
        case "a:lnSpc":
          if (!shape?.textBox || !paragraph) fail();
          assertDirectParent(element, "a:pPr");
          assertOnlyAttributes(element);
          paragraph.lineSpacingCount += 1;
          return;
        case "a:spcPct": {
          if (!shape?.textBox || !paragraph) fail();
          assertDirectParent(element, "a:lnSpc");
          assertOnlyAttributes(element, new Set(["val"]));
          if (!element.selfClosing) fail();
          const value = nonnegativeIntegerAttribute(element, "val");
          if (value < 70_000 || value > 120_000) fail();
          paragraph.spacingPercentCount += 1;
          return;
        }
        case "a:defRPr": {
          if (!shape?.textBox || !paragraph) fail();
          assertDirectParent(element, "a:pPr");
          assertOnlyAttributes(element, new Set(["i", "sz", "b"]));
          assertXmlBoolean(element.attributes.get("i"));
          assertXmlBoolean(element.attributes.get("b"));
          const size = nonnegativeIntegerAttribute(element, "sz");
          if (size < 1_200 || size > 7_200) fail();
          paragraph.defaultPropertiesCount += 1;
          shape.defaultRunPropertiesCount += 1;
          return;
        }
        case "a:r":
          if (!shape?.textBox || !paragraph || run) fail();
          assertDirectParent(element, "a:p");
          assertOnlyAttributes(element);
          run = { textCount: 0, propertiesCount: 0, fontCount: 0 };
          paragraph.runCount += 1;
          shape.runCount += 1;
          return;
        case "a:rPr": {
          if (!shape?.textBox || !run) fail();
          assertDirectParent(element, "a:r");
          assertOnlyAttributes(element, new Set(["i", "sz", "b"]));
          assertXmlBoolean(element.attributes.get("i"));
          assertXmlBoolean(element.attributes.get("b"));
          const size = nonnegativeIntegerAttribute(element, "sz");
          if (size < 1_200 || size > 7_200) fail();
          run.fontSize = size;
          run.propertiesCount += 1;
          shape.runPropertiesCount += 1;
          return;
        }
        case "a:latin": {
          if (!shape?.textBox) fail();
          assertOnlyAttributes(element, new Set(["typeface"]));
          if (!element.selfClosing) fail();
          const parent = element.ancestors.at(-1);
          const typeface = element.attributes.get("typeface");
          if (parent === "a:defRPr") {
            if (typeface !== "Syne") fail();
            shape.defaultRunFontCount += 1;
          } else if (parent === "a:rPr") {
            if (!run || !RICH_STATIC_FONTS.has(typeface ?? "")) fail();
            run.fontCount += 1;
            shape.runFontCount += 1;
          } else fail();
          return;
        }
        case "a:t":
          if (!shape?.textBox || !paragraph || !run) fail();
          assertDirectParent(element, "a:r");
          assertOnlyAttributes(element, new Set(["xml:space"]));
          if (element.attributes.has("xml:space")
            && !["default", "preserve"].includes(element.attributes.get("xml:space")!)) fail();
          run.textCount += 1;
          return;
        case "p:clrMapOvr":
          assertDirectParent(element, "p:sld");
          assertOnlyAttributes(element);
          colorMapOverrideCount += 1;
          return;
        case "a:masterClrMapping":
          assertDirectParent(element, "p:clrMapOvr");
          assertOnlyAttributes(element);
          if (!element.selfClosing) fail();
          masterColorMappingCount += 1;
          return;
      }
    },
    text(value, ancestors) {
      if (ancestors.at(-1) === "a:t") {
        if (!paragraph || !run) fail();
        paragraph.text += value;
      } else if (value.trim()) fail();
    },
    end(name) {
      if (name === "a:r") {
        if (
          !shape
          || !paragraph
          || !run
          || run.textCount !== 1
          || run.propertiesCount !== 1
          || run.fontCount !== 1
          || !run.color
          || run.fontSize === undefined
        ) fail();
        shape.runColors.push(run.color);
        shape.runFontSizes.push(run.fontSize);
        run = null;
        return;
      }
      if (name === "a:p") {
        if (!shape || !paragraph || run) fail();
        if (shape.textBox) {
          const text = normalizedText(paragraph.text);
          if (
            !text
            || paragraph.runCount !== 1
            || paragraph.propertiesCount !== 1
            || paragraph.lineSpacingCount !== 1
            || paragraph.spacingPercentCount !== 1
            || paragraph.defaultPropertiesCount !== 1
          ) fail();
          shape.paragraphs.push(text);
        } else if (
          paragraph.text
          || paragraph.runCount !== 0
          || paragraph.propertiesCount !== 1
          || paragraph.lineSpacingCount !== 0
          || paragraph.spacingPercentCount !== 0
          || paragraph.defaultPropertiesCount !== 0
        ) fail();
        paragraph = null;
        return;
      }
      if (name !== "p:sp") return;
      if (!shape || paragraph || run) fail();
      const { x, y, width, height, geometry } = shape;
      if (
        shape.id === undefined
        || !shape.name
        || shape.nonVisualPropertiesCount !== 1
        || shape.nonVisualCanvasCount !== 1
        || shape.nonVisualShapeCount !== 1
        || shape.nonVisualApplicationCount !== 1
        || shape.shapePropertiesCount !== 1
        || shape.transformCount !== 1
        || shape.offsetCount !== 1
        || shape.extentCount !== 1
        || shape.geometryCount !== 1
        || shape.adjustmentListCount !== 1
        || shape.lineCount !== 1
        || shape.lineNoFillCount !== 1
        || shape.effectListCount !== 1
        || shape.shadowCount !== 1
        || shape.shadowColorCount !== 1
        || shape.shadowAlphaCount !== 1
        || shape.textBodyCount !== 1
        || shape.bodyPropertiesCount !== 1
        || shape.listStyleCount !== 1
        || shape.paragraphCount !== 1
        || x === undefined
        || y === undefined
        || width === undefined
        || height === undefined
        || !geometry
        || width < 1
        || height < 1
        || !Number.isSafeInteger(x + width)
        || !Number.isSafeInteger(y + height)
        || x + width > slideSize.width
        || y + height > slideSize.height
      ) fail();

      if (shape.textBox) {
        if (
          !shape.name.startsWith("TextBox ")
          || geometry !== "rect"
          || shape.solidFillCount !== 0
          || shape.noFillCount !== 1
          || shape.fillColor
          || shape.styleCount !== 0
          || shape.autoFitCount !== 1
          || shape.paragraphs.length !== 1
          || shape.runCount !== 1
          || shape.runPropertiesCount !== 1
          || shape.runFontCount !== 1
          || shape.defaultRunPropertiesCount !== 1
          || shape.defaultRunFontCount !== 1
          || shape.runColors.length !== 1
          || shape.runFontSizes.length !== 1
          || width < Math.max(MIN_TEXT_BOX_WIDTH_EMU, Math.ceil(slideSize.width / 20))
          || height < Math.max(MIN_TEXT_BOX_HEIGHT_EMU, Math.ceil(slideSize.height / 40))
        ) fail();
        const textCodePoints = [...shape.paragraphs[0]!].length;
        const conservativeCapacity = Math.floor(
          (width / EMU_PER_INCH)
          * (height / EMU_PER_INCH)
          * MAX_TEXT_CODE_POINTS_PER_SQUARE_INCH,
        );
        if (textCodePoints > conservativeCapacity) fail();
      } else if (
        !(shape.name.startsWith("Rectangle ") || shape.name.startsWith("Oval "))
        || (shape.name.startsWith("Oval ") ? geometry !== "ellipse" : geometry !== "rect")
        || shape.solidFillCount !== 1
        || shape.noFillCount !== 0
        || !shape.fillColor
        || shape.styleCount !== 1
        || shape.autoFitCount !== 0
        || shape.paragraphs.length !== 0
        || shape.runCount !== 0
        || shape.runPropertiesCount !== 0
        || shape.runFontCount !== 0
        || shape.defaultRunPropertiesCount !== 0
        || shape.defaultRunFontCount !== 0
        || shape.runColors.length !== 0
        || shape.runFontSizes.length !== 0
      ) fail();

      shapes.push({
        zIndex: shape.zIndex,
        kind: shape.textBox ? "text" : "vector",
        geometry,
        x,
        y,
        width,
        height,
        ...(shape.fillColor ? { fillColor: shape.fillColor } : {}),
        paragraphs: shape.paragraphs,
        runColors: shape.runColors,
        runFontSizes: shape.runFontSizes,
      });
      shape = null;
    },
  });

  if (
    rootAttributes?.get("xmlns:p") !== PRESENTATIONML_NS
    || rootAttributes.get("xmlns:a") !== DRAWINGML_NS
    || rootAttributes.get("xmlns:r") !== OFFICE_REL_NS
    || commonSlideDataCount !== 1
    || backgroundCount !== 1
    || backgroundPropertiesCount !== 1
    || backgroundFillCount !== 1
    || backgroundEffectCount !== 1
    || backgroundColor !== "FFFFFF"
    || shapeTreeCount !== 1
    || groupNonVisualCount !== 1
    || groupCanvasCount !== 1
    || groupShapeCount !== 1
    || groupApplicationCount !== 1
    || groupPropertiesCount !== 1
    || groupTransformCount !== 1
    || ["a:off", "a:ext", "a:chOff", "a:chExt"].some(
      (name) => groupCoordinateCounts.get(name) !== 1,
    )
    || colorMapOverrideCount !== 1
    || masterColorMappingCount !== 1
  ) fail();

  const textShapes = shapes.filter((candidate) => candidate.kind === "text");
  const vectors = shapes.filter((candidate) => candidate.kind === "vector");
  if (textShapes.length < 1 || vectors.length < 2) fail();
  for (let leftIndex = 0; leftIndex < textShapes.length; leftIndex += 1) {
    const left = textShapes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < textShapes.length; rightIndex += 1) {
      if (rectanglesOverlap(left, textShapes[rightIndex]!)) fail();
    }
    const supportingColors = [backgroundColor, ...vectors
      .filter((vector) => rectanglesOverlap(left, vector))
      .map((vector) => {
        if (vector.zIndex > left.zIndex) fail();
        return vector.fillColor ?? fail();
      })];
    if (left.runColors.some(
      (color) => supportingColors.some((support) => contrastRatio(color, support) < 4.5),
    )) fail();
  }

  const paragraphs = [...textShapes]
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .flatMap((candidate) => candidate.paragraphs);
  const layoutSignature = sha256Hex(JSON.stringify(shapes.map((candidate) => ({
    kind: candidate.kind,
    geometry: candidate.geometry,
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
    fillColor: candidate.fillColor ?? null,
    runColors: candidate.runColors,
    runFontSizes: candidate.runFontSizes,
  }))));
  return {
    paragraphs,
    vectorShapeCount: vectors.length,
    styledTextRunCount: textShapes.reduce(
      (count, candidate) => count + candidate.runFontSizes.length,
      0,
    ),
    hasBackground: true,
    hasVectorAccents: true,
    paletteColors: [...paletteColors].sort(),
    layoutSignature,
  } satisfies SlideVisualMetrics;
}

interface PackageRelationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

function parseRelationships(xml: Buffer) {
  const relationships = new Map<string, PackageRelationship>();
  walkStrictXml(xml, new Set([""]), {
    start(element) {
      if (element.depth === 0) {
        if (
          element.name !== "Relationships"
          || element.attributes.get("xmlns") !== PACKAGE_REL_NS
        ) fail();
        assertOnlyAttributes(element, new Set(["xmlns"]));
        return;
      }
      if (
        element.depth !== 1
        || element.name !== "Relationship"
        || !element.selfClosing
      ) fail();
      const id = element.attributes.get("Id");
      const type = element.attributes.get("Type");
      const target = element.attributes.get("Target");
      assertOnlyAttributes(element, new Set(["Id", "Type", "Target"]));
      if (
        !id
        || !/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/u.test(id)
        || !type
        || !target
        || target.length > 2_048
        || relationships.has(id)
      ) fail();
      relationships.set(id, {
        id,
        type,
        target,
        external: false,
      });
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  return relationships;
}

function parseContentTypes(xml: Buffer) {
  const overrides = new Map<string, string>();
  const defaults = new Map<string, string>();
  walkStrictXml(xml, new Set([""]), {
    start(element) {
      if (element.depth === 0) {
        if (element.name !== "Types" || element.attributes.get("xmlns") !== CONTENT_TYPES_NS) {
          fail();
        }
        assertOnlyAttributes(element, new Set(["xmlns"]));
        return;
      }
      if (element.depth !== 1 || !element.selfClosing) fail();
      if (element.name === "Default") {
        assertOnlyAttributes(element, new Set(["Extension", "ContentType"]));
        const extension = element.attributes.get("Extension");
        const contentType = element.attributes.get("ContentType");
        if (!extension || !contentType || defaults.has(extension)) fail();
        defaults.set(extension, contentType);
        return;
      }
      if (element.name !== "Override") fail();
      assertOnlyAttributes(element, new Set(["PartName", "ContentType"]));
      const partName = element.attributes.get("PartName");
      const contentType = element.attributes.get("ContentType");
      if (
        !partName
        || !partName.startsWith("/")
        || !contentType
        || overrides.has(partName.slice(1))
      ) fail();
      overrides.set(partName.slice(1), contentType);
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  if (
    defaults.size !== 2
    || defaults.get("rels") !== "application/vnd.openxmlformats-package.relationships+xml"
    || defaults.get("xml") !== "application/xml"
  ) fail();
  return overrides;
}

function parsePresentation(xml: Buffer) {
  const slideRelationshipIds: string[] = [];
  const masterRelationshipIds: string[] = [];
  const slideIds = new Set<number>();
  const masterIds = new Set<number>();
  let slideSize: { width: number; height: number } | undefined;
  let rootAttributes: Map<string, string> | undefined;
  let slideListCount = 0;
  let masterListCount = 0;
  walkStrictXml(xml, new Set(["p", "r"]), {
    start(element) {
      if (element.depth === 0) {
        if (element.name !== "p:presentation") fail();
        assertOnlyAttributes(element, new Set(["xmlns:p", "xmlns:r"]));
        rootAttributes = element.attributes;
        return;
      }
      if (element.name === "p:sldMasterIdLst") {
        assertDirectParent(element, "p:presentation");
        assertOnlyAttributes(element);
        masterListCount += 1;
        return;
      }
      if (element.name === "p:sldIdLst") {
        assertDirectParent(element, "p:presentation");
        assertOnlyAttributes(element);
        slideListCount += 1;
        return;
      }
      if (element.name === "p:sldId") {
        assertDirectParent(element, "p:sldIdLst");
        assertOnlyAttributes(element, new Set(["id", "r:id"]));
        if (!element.selfClosing) fail();
        const id = element.attributes.get("r:id");
        if (!id) fail();
        const numericId = nonnegativeIntegerAttribute(element, "id");
        if (numericId < 256 || slideIds.has(numericId)) fail();
        slideIds.add(numericId);
        slideRelationshipIds.push(id);
        return;
      }
      if (element.name === "p:sldMasterId") {
        assertDirectParent(element, "p:sldMasterIdLst");
        assertOnlyAttributes(element, new Set(["id", "r:id"]));
        if (!element.selfClosing) fail();
        const id = element.attributes.get("r:id");
        if (!id) fail();
        const numericId = nonnegativeIntegerAttribute(element, "id");
        if (numericId < 1 || masterIds.has(numericId)) fail();
        masterIds.add(numericId);
        masterRelationshipIds.push(id);
        return;
      }
      if (element.name === "p:sldSz") {
        assertDirectParent(element, "p:presentation");
        assertOnlyAttributes(element, new Set(["cx", "cy"]));
        if (!element.selfClosing) fail();
        const width = Number(element.attributes.get("cx"));
        const height = Number(element.attributes.get("cy"));
        if (
          slideSize
          || !Number.isSafeInteger(width)
          || !Number.isSafeInteger(height)
          || width !== STRICT_SLIDE_WIDTH_EMU
          || height !== STRICT_SLIDE_HEIGHT_EMU
        ) fail();
        slideSize = { width, height };
        return;
      }
      fail();
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  if (
    rootAttributes?.get("xmlns:p") !== PRESENTATIONML_NS
    || rootAttributes.get("xmlns:r") !== OFFICE_REL_NS
    || slideRelationshipIds.length === 0
    || masterRelationshipIds.length !== 1
    || slideListCount !== 1
    || masterListCount !== 1
    || !slideSize
    || new Set(slideRelationshipIds).size !== slideRelationshipIds.length
  ) fail();
  return { slideRelationshipIds, masterRelationshipIds, slideSize };
}

function packageTarget(baseDirectory: string, target: string) {
  if (!target || target.includes("\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)) {
    return fail();
  }
  const withoutRoot = target.startsWith("/") ? target.slice(1) : target;
  const joined = target.startsWith("/")
    ? path.normalize(withoutRoot)
    : path.normalize(path.join(baseDirectory, withoutRoot));
  if (
    !joined
    || joined === "."
    || joined === ".."
    || joined.startsWith("../")
    || joined.includes("/../")
  ) {
    return fail();
  }
  return joined;
}

function relationshipPartName(partName: string) {
  return path.join(
    path.dirname(partName),
    "_rels",
    `${path.basename(partName)}.rels`,
  );
}

function relationshipType(suffix: string) {
  return `${OFFICE_REL_TYPE}/${suffix}`;
}

function assertPartContentType(
  contentTypes: Map<string, string>,
  partName: string,
  expected: string,
) {
  if (contentTypes.get(partName) !== expected) fail();
}

function assertNoVisibleTemplateText(xml: Buffer, root: "p:sldMaster" | "p:sldLayout") {
  if (extractSlideParagraphs(xml, root).length !== 0) fail();
}

function parseMasterLayoutRelationshipIds(xml: Buffer) {
  assertNoVisibleTemplateText(xml, "p:sldMaster");
  const relationshipIds: string[] = [];
  const numericIds = new Set<number>();
  let listCount = 0;
  walkStrictXml(xml, new Set(["p", "a", "r"]), {
    start(element) {
      if (element.name === "p:sldLayoutIdLst") {
        assertDirectParent(element, "p:sldMaster");
        assertOnlyAttributes(element);
        listCount += 1;
      }
      if (element.name !== "p:sldLayoutId") return;
      assertDirectParent(element, "p:sldLayoutIdLst");
      assertOnlyAttributes(element, new Set(["id", "r:id"]));
      if (!element.selfClosing) fail();
      const relationshipId = element.attributes.get("r:id");
      const numericId = nonnegativeIntegerAttribute(element, "id");
      if (
        !relationshipId
        || numericId < 1
        || numericIds.has(numericId)
        || relationshipIds.includes(relationshipId)
      ) fail();
      numericIds.add(numericId);
      relationshipIds.push(relationshipId);
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  if (listCount !== 1 || relationshipIds.length < 1) fail();
  return relationshipIds;
}

function assertTheme(xml: Buffer) {
  let rootAttributes: Map<string, string> | undefined;
  let themeElementsCount = 0;
  walkStrictXml(xml, new Set(["a"]), {
    start(element) {
      if (element.depth === 0) {
        if (element.name !== "a:theme") fail();
        assertOnlyAttributes(element, new Set(["xmlns:a", "name"]));
        rootAttributes = element.attributes;
        return;
      }
      if (
        element.depth !== 1
        || element.name !== "a:themeElements"
        || !element.selfClosing
      ) fail();
      assertOnlyAttributes(element);
      themeElementsCount += 1;
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  if (rootAttributes?.get("xmlns:a") !== DRAWINGML_NS || themeElementsCount !== 1) fail();
}

function assertPresentationProperties(xml: Buffer) {
  let rootAttributes: Map<string, string> | undefined;
  walkStrictXml(xml, new Set(["p", "r"]), {
    start(element) {
      if (element.depth === 0) {
        if (element.name !== "p:presentationPr") fail();
        assertOnlyAttributes(element, new Set(["xmlns:p", "xmlns:r"]));
        if (!element.selfClosing) fail();
        rootAttributes = element.attributes;
        return;
      }
      fail();
    },
    text(value) {
      if (value.trim()) fail();
    },
  });
  if (rootAttributes?.get("xmlns:p") !== PRESENTATIONML_NS) fail();
}

function orderedCanonicalSlideEntries(buffer: Buffer, entries: ZipEntry[]) {
  const byName = new Map<string, ZipEntry>();
  for (const entry of entries) {
    if (byName.has(entry.name)) fail();
    byName.set(entry.name, entry);
  }
  const requiredEntry = (name: string) => byName.get(name) ?? fail();
  const readRequiredEntry = (name: string) => readEntry(buffer, requiredEntry(name));
  const allowedParts = new Set([
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ]);

  const contentTypes = parseContentTypes(readRequiredEntry("[Content_Types].xml"));
  const rootRelationships = parseRelationships(readRequiredEntry("_rels/.rels"));
  const officeDocuments = [...rootRelationships.values()].filter(
    (relationship) => relationship.type === relationshipType("officeDocument"),
  );
  if (
    officeDocuments.length !== 1
    || officeDocuments[0]!.external
    || packageTarget("", officeDocuments[0]!.target) !== "ppt/presentation.xml"
  ) {
    fail();
  }
  if (rootRelationships.size !== 1) fail();

  const presentationPart = "ppt/presentation.xml";
  assertPartContentType(
    contentTypes,
    presentationPart,
    CONTENT_TYPE_BY_KIND.presentation,
  );
  const presentation = parsePresentation(readRequiredEntry(presentationPart));

  const presentationRelationships = parseRelationships(readRequiredEntry(
    relationshipPartName(presentationPart),
  ));
  const allowedPresentationRelationshipTypes = new Set([
    relationshipType("slide"),
    relationshipType("slideMaster"),
    relationshipType("presProps"),
  ]);
  for (const relationship of presentationRelationships.values()) {
    if (
      relationship.external
      || !allowedPresentationRelationshipTypes.has(relationship.type)
    ) fail();
  }

  const masterRelationship = presentationRelationships.get(
    presentation.masterRelationshipIds[0]!,
  );
  if (!masterRelationship || masterRelationship.type !== relationshipType("slideMaster")) fail();
  const masterPart = packageTarget("ppt", masterRelationship.target);
  if (!/^ppt\/slideMasters\/slideMaster[1-9][0-9]*\.xml$/u.test(masterPart)) fail();
  assertPartContentType(contentTypes, masterPart, CONTENT_TYPE_BY_KIND.slideMaster);
  allowedParts.add(masterPart);
  allowedParts.add(relationshipPartName(masterPart));
  const masterXml = readRequiredEntry(masterPart);
  const masterLayoutRelationshipIds = parseMasterLayoutRelationshipIds(masterXml);

  const presentationProperties = [...presentationRelationships.values()].filter(
    (relationship) => relationship.type === relationshipType("presProps"),
  );
  if (
    presentationProperties.length !== 1
    || presentationRelationships.size !== presentation.slideRelationshipIds.length + 2
  ) fail();
  const presPropsPart = packageTarget("ppt", presentationProperties[0]!.target);
  if (presPropsPart !== "ppt/presProps.xml") fail();
  allowedParts.add(presPropsPart);
  assertPartContentType(contentTypes, presPropsPart, CONTENT_TYPE_BY_KIND.presProps);
  assertPresentationProperties(readRequiredEntry(presPropsPart));

  const masterRelationships = parseRelationships(readRequiredEntry(
    relationshipPartName(masterPart),
  ));
  const masterLayoutRelationships = [...masterRelationships.values()].filter(
    (relationship) => relationship.type === relationshipType("slideLayout"),
  );
  const themeRelationships = [...masterRelationships.values()].filter(
    (relationship) => relationship.type === relationshipType("theme"),
  );
  if (
    masterLayoutRelationships.length < 1
    || masterLayoutRelationshipIds.length !== masterLayoutRelationships.length
    || masterLayoutRelationshipIds.some(
      (id) => masterRelationships.get(id)?.type !== relationshipType("slideLayout"),
    )
    || themeRelationships.length !== 1
    || [...masterRelationships.values()].some(
      (relationship) => relationship.external || ![
        relationshipType("slideLayout"),
        relationshipType("theme"),
      ].includes(relationship.type),
    )
  ) fail();
  const themePart = packageTarget(path.dirname(masterPart), themeRelationships[0]!.target);
  if (!/^ppt\/theme\/theme[1-9][0-9]*\.xml$/u.test(themePart)) fail();
  allowedParts.add(themePart);
  assertPartContentType(contentTypes, themePart, CONTENT_TYPE_BY_KIND.theme);
  assertTheme(readRequiredEntry(themePart));

  const masterLayoutParts = new Set(masterLayoutRelationships.map((relationship) => {
    const part = packageTarget(path.dirname(masterPart), relationship.target);
    if (!/^ppt\/slideLayouts\/slideLayout[1-9][0-9]*\.xml$/u.test(part)) fail();
    assertPartContentType(contentTypes, part, CONTENT_TYPE_BY_KIND.slideLayout);
    allowedParts.add(part);
    allowedParts.add(relationshipPartName(part));
    assertNoVisibleTemplateText(readRequiredEntry(part), "p:sldLayout");
    const layoutRelationships = parseRelationships(readRequiredEntry(
      relationshipPartName(part),
    ));
    if (layoutRelationships.size !== 1) fail();
    const parentMaster = [...layoutRelationships.values()][0]!;
    if (
      parentMaster.external
      || parentMaster.type !== relationshipType("slideMaster")
      || packageTarget(path.dirname(part), parentMaster.target) !== masterPart
    ) fail();
    return part;
  }));
  if (masterLayoutParts.size !== masterLayoutRelationships.length) fail();

  const seenTargets = new Set<string>();
  const slideEntries = presentation.slideRelationshipIds.map((relationshipId) => {
    const relationship = presentationRelationships.get(relationshipId);
    if (
      !relationship
      || relationship.external
      || relationship.type !== relationshipType("slide")
    ) {
      return fail();
    }
    const target = packageTarget("ppt", relationship.target);
    if (!/^ppt\/slides\/slide[1-9][0-9]*\.xml$/u.test(target) || seenTargets.has(target)) {
      return fail();
    }
    seenTargets.add(target);
    allowedParts.add(target);
    allowedParts.add(relationshipPartName(target));
    assertPartContentType(contentTypes, target, CONTENT_TYPE_BY_KIND.slide);
    const slideRelationships = parseRelationships(readRequiredEntry(
      relationshipPartName(target),
    ));
    if (slideRelationships.size !== 1) fail();
    const layout = [...slideRelationships.values()][0]!;
    if (layout.external || layout.type !== relationshipType("slideLayout")) fail();
    const layoutPart = packageTarget(path.dirname(target), layout.target);
    if (!masterLayoutParts.has(layoutPart)) fail();
    return requiredEntry(target);
  });
  if (
    byName.size !== allowedParts.size
    || [...byName.keys()].some((name) => !allowedParts.has(name))
  ) fail();
  const contentBearingParts = [...allowedParts].filter(
    (name) => name !== "[Content_Types].xml" && !name.endsWith(".rels"),
  );
  if (
    contentTypes.size !== contentBearingParts.length
    || contentBearingParts.some((name) => !contentTypes.has(name))
  ) fail();
  return { slideEntries, slideSize: presentation.slideSize };
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function strictUtf8(buffer: Buffer) {
  const value = buffer.toString("utf8");
  if (value.includes("\uFFFD") || value.includes("\0")) fail();
  return value;
}

function orderedPresentonSlideEntries(buffer: Buffer, entries: ZipEntry[]) {
  const byName = new Map<string, ZipEntry>();
  for (const entry of entries) {
    if (byName.has(entry.name)) fail();
    byName.set(entry.name, entry);
  }
  const requiredEntry = (name: string) => byName.get(name) ?? fail();
  const readRequiredEntry = (name: string) => readEntry(buffer, requiredEntry(name));

  for (const [name, expectedDigest] of PRESENTON_STATIC_PART_SHA256) {
    if (sha256Hex(readRequiredEntry(name)) !== expectedDigest) fail();
  }

  const contentTypes = strictUtf8(readRequiredEntry("[Content_Types].xml"));
  const slideContentTypePattern = /<Override PartName="\/ppt\/slides\/slide([1-9][0-9]*)\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slide\+xml"\/>\n?/gu;
  const contentTypeSlideNumbers = [...contentTypes.matchAll(slideContentTypePattern)]
    .map((match) => Number(match[1]));
  const normalizedContentTypes = contentTypes.replace(slideContentTypePattern, "");
  if (sha256Hex(normalizedContentTypes) !== PRESENTON_NORMALIZED_CONTENT_TYPES_SHA256) {
    fail();
  }

  const presentation = strictUtf8(readRequiredEntry("ppt/presentation.xml"));
  const slideListStartToken = "<p:sldIdLst>";
  const slideListEndToken = "</p:sldIdLst>";
  const slideListStart = presentation.indexOf(slideListStartToken);
  const slideListEnd = presentation.indexOf(slideListEndToken);
  if (
    slideListStart < 0
    || slideListEnd < slideListStart
    || presentation.indexOf(slideListStartToken, slideListStart + 1) >= 0
    || presentation.indexOf(slideListEndToken, slideListEnd + 1) >= 0
  ) fail();
  const slideListBodyStart = slideListStart + slideListStartToken.length;
  const slideListBody = presentation.slice(slideListBodyStart, slideListEnd);
  const slideIdPattern = /<p:sldId id="([0-9]+)" r:id="rId([0-9]+)"\/>/gu;
  const slideIds = [...slideListBody.matchAll(slideIdPattern)].map((match) => ({
    numericId: Number(match[1]),
    relationshipNumber: Number(match[2]),
  }));
  if (slideListBody.replace(slideIdPattern, "").trim()) fail();
  const normalizedPresentation = `${presentation.slice(0, slideListStart)}<p:sldIdLst/>${presentation.slice(
    slideListEnd + slideListEndToken.length,
  )}`;
  if (sha256Hex(normalizedPresentation) !== PRESENTON_NORMALIZED_PRESENTATION_SHA256) fail();

  const presentationRelationships = strictUtf8(readRequiredEntry(
    "ppt/_rels/presentation.xml.rels",
  ));
  const slideRelationshipPattern = /<Relationship Id="rId([0-9]+)" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide" Target="slides\/slide([1-9][0-9]*)\.xml"\/>\n?/gu;
  const slideRelationships = [...presentationRelationships.matchAll(slideRelationshipPattern)]
    .map((match) => ({
      relationshipNumber: Number(match[1]),
      slideNumber: Number(match[2]),
    }));
  const normalizedPresentationRelationships = presentationRelationships.replace(
    slideRelationshipPattern,
    "",
  );
  if (
    sha256Hex(normalizedPresentationRelationships)
      !== PRESENTON_NORMALIZED_PRESENTATION_RELS_SHA256
  ) fail();

  const slideCount = slideIds.length;
  if (
    slideCount < 1
    || slideCount > 60
    || contentTypeSlideNumbers.length !== slideCount
    || slideRelationships.length !== slideCount
  ) fail();
  for (let index = 0; index < slideCount; index += 1) {
    const slideNumber = index + 1;
    if (
      !contentTypeSlideNumbers.includes(slideNumber)
      || slideIds[index]?.numericId !== 256 + index
      || slideIds[index]?.relationshipNumber !== 7 + index
      || slideRelationships[index]?.relationshipNumber !== 7 + index
      || slideRelationships[index]?.slideNumber !== slideNumber
    ) fail();
  }
  if (new Set(contentTypeSlideNumbers).size !== slideCount) fail();

  const dynamicParts = new Set([
    "[Content_Types].xml",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ]);
  const slideEntries = Array.from({ length: slideCount }, (_unused, index) => {
    const slideNumber = index + 1;
    const slidePart = `ppt/slides/slide${slideNumber}.xml`;
    const relationshipPart = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    dynamicParts.add(slidePart);
    dynamicParts.add(relationshipPart);
    if (sha256Hex(readRequiredEntry(relationshipPart)) !== PRESENTON_SLIDE_RELS_SHA256) {
      fail();
    }
    return requiredEntry(slidePart);
  });
  const allowedParts = new Set([
    ...PRESENTON_STATIC_PART_SHA256.keys(),
    ...dynamicParts,
  ]);
  if (
    allowedParts.size !== byName.size
    || [...byName.keys()].some((name) => !allowedParts.has(name))
  ) fail();

  return {
    packageProfile: "presenton" as const,
    slideEntries,
    slideSize: {
      width: STRICT_SLIDE_WIDTH_EMU,
      height: STRICT_SLIDE_HEIGHT_EMU,
    },
  };
}

function orderedSlideEntries(buffer: Buffer, entries: ZipEntry[]) {
  const names = new Set(entries.map((entry) => entry.name));
  if (
    names.has("ppt/viewProps.xml")
    || names.has("docProps/core.xml")
    || names.has("ppt/printerSettings/printerSettings1.bin")
  ) {
    return orderedPresentonSlideEntries(buffer, entries);
  }
  return {
    packageProfile: "canonical" as const,
    ...orderedCanonicalSlideEntries(buffer, entries),
  };
}

function expectedParagraphs(slide: ExpectedSlideText) {
  const values = [slide.headline, ...slide.bulletPoints].map(normalizedText);
  if (values.some((value) => !value)) fail();
  return values;
}

export function hashExpectedSlideText(
  expectedSlides: readonly ExpectedSlideText[],
) {
  if (expectedSlides.length < 1 || expectedSlides.length > 60) fail();
  const canonicalSlides = expectedSlides.map(expectedParagraphs);
  return createHash("sha256").update(JSON.stringify(canonicalSlides)).digest("hex");
}

/**
 * Verify the strict v0.1 rich-static PresentationML allowlist: one canonical
 * ZIP view, one exact relationship graph, a neutral 16:9 template, closed-set
 * native vector decoration, explicit high-contrast typography, and DrawingML
 * text matching the approved plan in visual reading order. This is
 * intentionally narrower than general PPTX.
 */
export function verifyPptxVisibleText(
  body: Buffer,
  expectedSlides: readonly ExpectedSlideText[],
  layoutIds: readonly RichStaticLayoutId[],
): PptxRichStaticVerification {
  if (expectedSlides.length < 1 || expectedSlides.length > 60) fail();
  if (
    layoutIds.length !== expectedSlides.length
    || layoutIds.some((layoutId) => !RICH_STATIC_VISUAL_PROFILE.layoutIds.includes(layoutId))
  ) fail();
  const entries = readCentralDirectory(body);
  const { packageProfile, slideEntries, slideSize } = orderedSlideEntries(body, entries);
  if (slideEntries.length !== expectedSlides.length) fail();

  let totalXmlBytes = 0;
  let vectorShapeCount = 0;
  let styledTextRunCount = 0;
  let slidesWithBackground = 0;
  let slidesWithVectorAccents = 0;
  const paletteColors = new Set<string>();
  const layoutSignatures = new Set<string>();
  for (let index = 0; index < expectedSlides.length; index += 1) {
    const entry = slideEntries[index]!;
    totalXmlBytes += entry.uncompressedSize;
    if (totalXmlBytes > MAX_TOTAL_SLIDE_XML_BYTES) fail();
    const slideXml = readEntry(body, entry);
    const actual = packageProfile === "presenton"
      ? extractPresentonSlideMetrics(slideXml, slideSize)
      : extractSlideParagraphs(slideXml, "p:sld", slideSize);
    const expected = expectedParagraphs(expectedSlides[index]!);
    if (
      actual.paragraphs.length !== expected.length
      || actual.paragraphs.some((value, itemIndex) => value !== expected[itemIndex])
      || (packageProfile === "presenton"
        && actual.layoutSignature !== expectedPresentonLayoutSignature(
          layoutIds[index]!,
          expectedSlides[index]!.bulletPoints.length,
        ))
    ) {
      fail();
    }
    vectorShapeCount += actual.vectorShapeCount;
    styledTextRunCount += actual.styledTextRunCount;
    slidesWithBackground += actual.hasBackground ? 1 : 0;
    slidesWithVectorAccents += actual.hasVectorAccents ? 1 : 0;
    actual.paletteColors.forEach((color) => paletteColors.add(color));
    layoutSignatures.add(actual.layoutSignature);
  }

  const contentVerification = {
    method: PPTX_CONTENT_VERIFICATION_METHOD,
    sha256: hashExpectedSlideText(expectedSlides),
    slideCount: expectedSlides.length,
  } satisfies PptxContentVerification;
  const visualProfile = visualProfileVerificationSchema.parse({
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds,
    measuredRichness: {
      slideCount: expectedSlides.length,
      vectorShapeCount,
      styledTextRunCount,
      slidesWithBackground,
      slidesWithVectorAccents,
      distinctLayoutSignatures: layoutSignatures.size,
      distinctPaletteColors: paletteColors.size,
    },
  });
  return { contentVerification, visualProfile };
}
