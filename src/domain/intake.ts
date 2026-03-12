import { companyRowSchema, type CompanyRow } from "./schemas";

const csvFieldMap = {
  websiteUrl: ["website", "websiteurl", "url", "domain"],
  companyName: ["company", "companyname", "name"],
  firstName: ["firstname", "first_name"],
  lastName: ["lastname", "last_name"],
  role: ["role", "title", "jobtitle"],
  campaignGoal: ["campaigngoal", "goal"],
  notes: ["notes", "note"],
} as const;

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Website URL cannot be empty.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeHeader(input: string) {
  return input.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findCsvValue(
  row: Record<string, string>,
  aliases: readonly string[],
): string | undefined {
  const entries = Object.entries(row);

  for (const [rawKey, value] of entries) {
    const normalizedKey = normalizeHeader(rawKey);
    if (aliases.includes(normalizedKey) && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export function parseTargetsFromMultilineInput(input: string): CompanyRow[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((websiteUrl) => companyRowSchema.parse({ websiteUrl: normalizeUrl(websiteUrl) }));
}

export function parseTargetsFromCsvRows(
  rows: Array<Record<string, string>>,
): CompanyRow[] {
  return rows.map((row) =>
    companyRowSchema.parse({
      websiteUrl: normalizeUrl(
        findCsvValue(row, csvFieldMap.websiteUrl) ??
          (() => {
            throw new Error("CSV row is missing a website column.");
          })(),
      ),
      companyName: findCsvValue(row, csvFieldMap.companyName),
      firstName: findCsvValue(row, csvFieldMap.firstName),
      lastName: findCsvValue(row, csvFieldMap.lastName),
      role: findCsvValue(row, csvFieldMap.role),
      campaignGoal: findCsvValue(row, csvFieldMap.campaignGoal),
      notes: findCsvValue(row, csvFieldMap.notes),
    }),
  );
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

export function parseCsvText(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV input must include a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map<Record<string, string>>((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

export function dedupeTargets(targets: CompanyRow[]) {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const normalized = new URL(target.websiteUrl).hostname.replace(/^www\./, "");
    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}
