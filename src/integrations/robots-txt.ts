/**
 * Minimal RFC 9309 robots.txt evaluation for the built-in crawler.
 *
 * Supported: user-agent groups (with grouping of consecutive user-agent
 * lines), allow/disallow with `*` and `$` patterns, longest-match precedence
 * (allow wins a tie), and `sitemap` discovery. Crawl-delay is not part of the
 * RFC and is ignored; the crawler is sequential and bounded instead.
 */

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsPolicy {
  isAllowed(url: string): boolean;
  sitemaps: string[];
}

/** RFC 9309 §2.3.1.3: a 4xx robots.txt means "no restrictions". */
export const ALLOW_ALL_ROBOTS: RobotsPolicy = {
  isAllowed: () => true,
  sitemaps: [],
};

/** RFC 9309 §2.3.1.4: an unreachable robots.txt means "complete disallow". */
export const DISALLOW_ALL_ROBOTS: RobotsPolicy = {
  isAllowed: () => false,
  sitemaps: [],
};

const MAX_ROBOTS_BYTES = 500 * 1024;

export function parseRobotsTxt(text: string, userAgentToken: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.slice(0, MAX_ROBOTS_BYTES).split(/\r\n|\r|\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      // An empty disallow means "allow everything" and adds no rule.
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    }
  }

  const token = userAgentToken.toLowerCase();
  const matching = groups.filter((group) => group.agents.includes(token));
  const applicable = matching.length > 0
    ? matching
    : groups.filter((group) => group.agents.includes("*"));
  const rules = applicable.flatMap((group) => group.rules);

  return {
    sitemaps,
    isAllowed(url: string) {
      let path: string;
      try {
        const parsed = new URL(url);
        path = `${parsed.pathname}${parsed.search}`;
      } catch {
        return false;
      }
      if (path === "/robots.txt") return true;

      let best: RobotsRule | null = null;
      for (const rule of rules) {
        if (!patternMatches(rule.pattern, path)) continue;
        if (
          !best
          || rule.pattern.length > best.pattern.length
          || (rule.pattern.length === best.pattern.length && rule.allow)
        ) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}

function patternMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body
    .split("*")
    .map((part) => escapeForRegExp(safeDecode(part)))
    .join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`, "u").test(safeDecode(path));
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
