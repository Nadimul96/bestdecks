/**
 * Dependency-free HTML to readable-text extraction for the built-in crawler.
 *
 * The output is deliberately plain: headings become `#` lines, list items
 * become `-` lines, and everything else becomes paragraphs. It only ever
 * removes markup, so every sentence in the output appears verbatim in the
 * page's visible text. That property is what lets the evidence gate match
 * claims against it.
 */

export interface ReadableDocument {
  title?: string;
  text: string;
  /** Absolute, fragment-free HTTP(S) links in document order. */
  links: string[];
  /** RSS/Atom feeds the page advertises. */
  feedUrls: string[];
  noindex: boolean;
  nofollow: boolean;
}

const NON_CONTENT_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "select",
  "button",
];
const BOILERPLATE_ELEMENTS = ["nav", "footer", "aside", "form", "dialog"];
const BLOCK_ELEMENTS = [
  "p",
  "div",
  "section",
  "article",
  "header",
  "main",
  "blockquote",
  "figure",
  "figcaption",
  "table",
  "tr",
  "dd",
  "dt",
  "dl",
  "ul",
  "ol",
  "pre",
  "address",
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: "\u00a0",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  cent: "¢",
  times: "×",
  para: "¶",
  sect: "§",
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function removeElements(html: string, tags: readonly string[]) {
  let result = html;
  for (const tag of tags) {
    result = result.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "giu"), "\n");
  }
  return result;
}

function attribute(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "iu"),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtmlEntities(value).trim();
}

function resolveHttpUrl(href: string | undefined, baseUrl: string) {
  if (!href) return undefined;
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function collapseText(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/gu, " ").trim())
    .join("\n")
    // A list marker or heading marker whose content starts on a later line
    // (nested block markup) is rejoined with that content.
    .replace(/^(-|#{1,6})\n+(?=[^\n])/gmu, "$1 ")
    .replace(/\n{3,}/gu, "\n\n")
    // Permalink pilcrows are decoration, not content.
    .replace(/^(#+ .*?)\s*\u00b6$/gmu, "$1")
    .replace(/^(?:- |#+ )\s*$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function headMetadata(html: string, pageUrl: string) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu);
  const title = titleMatch
    ? collapseText(decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]*>/gu, ""))).replace(/\n/gu, " ")
    : undefined;

  let noindex = false;
  let nofollow = false;
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const name = attribute(tag, "name")?.toLowerCase();
    if (name !== "robots" && name !== "bestdecksbot") continue;
    const content = attribute(tag, "content")?.toLowerCase() ?? "";
    if (/\b(?:noindex|none)\b/u.test(content)) noindex = true;
    if (/\b(?:nofollow|none)\b/u.test(content)) nofollow = true;
  }

  const feedUrls: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
    const type = attribute(tag, "type")?.toLowerCase() ?? "";
    if (!rel.split(/\s+/u).includes("alternate")) continue;
    if (type !== "application/rss+xml" && type !== "application/atom+xml") continue;
    const href = resolveHttpUrl(attribute(tag, "href"), pageUrl);
    if (href) feedUrls.push(href);
  }

  return { title: title || undefined, noindex, nofollow, feedUrls: [...new Set(feedUrls)] };
}

function collectLinks(html: string, pageUrl: string) {
  const links: string[] = [];
  for (const tag of html.match(/<a\b[^>]*>/giu) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
    if (rel.split(/\s+/u).includes("nofollow")) continue;
    const href = resolveHttpUrl(attribute(tag, "href"), pageUrl);
    if (href) links.push(href);
  }
  return [...new Set(links)];
}

function bodyText(html: string) {
  let content = html.replace(/<!--[\s\S]*?-->/gu, "");
  content = content.replace(/<head\b[\s\S]*?<\/head\s*>/iu, "");
  content = removeElements(content, NON_CONTENT_ELEMENTS);
  const main = content.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/iu);
  content = removeElements(main ? main[1]! : content, BOILERPLATE_ELEMENTS);

  content = content
    .replace(/<h([1-6])\b[^>]*>/giu, (_match, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]\s*>/giu, "\n\n")
    .replace(/<li\b[^>]*>/giu, "\n- ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/?(?:td|th)\b[^>]*>/giu, " ")
    .replace(new RegExp(`</?(?:${BLOCK_ELEMENTS.join("|")})\\b[^>]*>`, "giu"), "\n")
    .replace(/<[^>]*>/gu, "");

  return collapseText(decodeHtmlEntities(content));
}

export function extractReadableDocument(html: string, pageUrl: string): ReadableDocument {
  const metadata = headMetadata(html, pageUrl);
  return {
    ...metadata,
    text: bodyText(html),
    links: metadata.nofollow ? [] : collectLinks(html, pageUrl),
  };
}

/** Extract `<loc>` entries from a sitemap or sitemap index. */
export function extractSitemapLocations(xml: string, baseUrl: string) {
  const locations: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/giu)) {
    const url = resolveHttpUrl(decodeHtmlEntities(match[1]!.replace(/<!\[CDATA\[|\]\]>/gu, "")), baseUrl);
    if (url) locations.push(url);
  }
  return [...new Set(locations)];
}

export interface FeedEntry {
  title: string;
  url?: string;
  published?: string;
  summary?: string;
}

/** Extract entries from an RSS 2.0 or Atom feed without interpreting markup. */
export function extractFeedEntries(xml: string, feedUrl: string, limit = 10): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1\s*>/giu) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const field = (name: string) => {
      const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, "iu"));
      if (!match) return undefined;
      const raw = match[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1");
      const text = collapseText(decodeHtmlEntities(raw.replace(/<[^>]*>/gu, " ")).replace(/\n+/gu, " "));
      return text || undefined;
    };
    const title = field("title");
    if (!title) continue;
    const atomLink = block.match(/<link\b[^>]*>/iu)?.[0];
    const url = resolveHttpUrl(field("link") ?? (atomLink ? attribute(atomLink, "href") : undefined), feedUrl);
    entries.push({
      title,
      ...(url ? { url } : {}),
      ...(field("pubDate") ?? field("published") ?? field("updated")
        ? { published: field("pubDate") ?? field("published") ?? field("updated") }
        : {}),
      ...(field("description") ?? field("summary")
        ? { summary: field("description") ?? field("summary") }
        : {}),
    });
  }
  return entries;
}

/** Truncate to a UTF-8 byte budget without splitting a code point. */
export function truncateUtf8(value: string, maxBytes: number) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return value;

  // If the first excluded byte is a UTF-8 continuation byte, exclude the
  // incomplete code point as well. This keeps both the byte cap and text valid.
  let end = maxBytes;
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end -= 1;
  return encoded.subarray(0, end).toString("utf8");
}
