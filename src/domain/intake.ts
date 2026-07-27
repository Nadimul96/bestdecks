import {
  companyRowSchema,
  MAX_TARGETS_PER_RUN,
  type CompanyRow,
} from "./schemas";
import {
  canonicalizeTargetCsvHeader,
  isRecipientEmailCsvHeader,
  isSupportedTargetCsvHeader,
  TARGET_CSV_COLUMNS,
  type TargetCsvColumn,
} from "./intake-fields";

export type CsvIntakeErrorCode =
  | "csv_row_limit_exceeded"
  | "malformed_csv"
  | "recipient_email_column"
  | "unsupported_csv_column";

export class CsvIntakeError extends Error {
  public constructor(
    public readonly code: CsvIntakeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CsvIntakeError";
  }
}

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

function findCsvValue(
  row: Record<string, string>,
  field: TargetCsvColumn,
): string | undefined {
  const entries = Object.entries(row);

  for (const [rawKey, value] of entries) {
    if (canonicalizeTargetCsvHeader(rawKey) === field && value.trim().length > 0) {
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
  return rows.map((row) => {
    const headers = Object.keys(row);
    if (headers.some(isRecipientEmailCsvHeader)) {
      throw new CsvIntakeError(
        "recipient_email_column",
        "Recipient-email CSV columns are unavailable while outbound email is deferred.",
      );
    }
    if (headers.some((header) => !isSupportedTargetCsvHeader(header))) {
      throw new CsvIntakeError(
        "unsupported_csv_column",
        `Target CSV supports only: ${TARGET_CSV_COLUMNS.join(", ")}.`,
      );
    }

    return companyRowSchema.parse({
      websiteUrl: normalizeUrl(
        findCsvValue(row, "websiteUrl") ??
          (() => {
            throw new CsvIntakeError(
              "malformed_csv",
              "Every CSV row must include a website value.",
            );
          })(),
      ),
      companyName: findCsvValue(row, "companyName"),
      firstName: findCsvValue(row, "firstName"),
      lastName: findCsvValue(row, "lastName"),
      role: findCsvValue(row, "role"),
      campaignGoal: findCsvValue(row, "campaignGoal"),
      notes: findCsvValue(row, "notes"),
    });
  });
}

function parseCsvMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  const finishField = () => {
    row.push(field.trim());
    field = "";
    closedQuote = false;
  };

  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        closedQuote = true;
      } else if (character === "\r") {
        field += "\n";
        if (nextCharacter === "\n") index += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote) {
      if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        finishRow();
        if (character === "\r" && nextCharacter === "\n") index += 1;
      } else if (character !== " " && character !== "\t") {
        throw new CsvIntakeError(
          "malformed_csv",
          "CSV contains characters after a closing quote.",
        );
      }
      continue;
    }

    if (character === '"') {
      if (field.trim().length > 0) {
        throw new CsvIntakeError(
          "malformed_csv",
          "CSV contains a quote inside an unquoted field.",
        );
      }
      field = "";
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      finishRow();
      if (character === "\r" && nextCharacter === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new CsvIntakeError(
      "malformed_csv",
      "CSV contains an unbalanced quoted field.",
    );
  }

  if (row.length > 0 || field.length > 0 || closedQuote) {
    finishRow();
  }

  return rows.filter((candidate) => candidate.some((value) => value.length > 0));
}

export function parseCsvText(input: string): Array<Record<string, string>> {
  const rows = parseCsvMatrix(input);
  if (rows.length < 2) {
    throw new CsvIntakeError(
      "malformed_csv",
      "CSV input must include a header row and at least one data row.",
    );
  }
  if (rows.length - 1 > MAX_TARGETS_PER_RUN) {
    throw new CsvIntakeError(
      "csv_row_limit_exceeded",
      `Target CSV supports at most ${MAX_TARGETS_PER_RUN} data rows.`,
    );
  }

  const rawHeaders = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/u, "") : header
  );
  if (rawHeaders.some((header) => header.length === 0)) {
    throw new CsvIntakeError("malformed_csv", "CSV headers cannot be empty.");
  }
  if (rawHeaders.some(isRecipientEmailCsvHeader)) {
    throw new CsvIntakeError(
      "recipient_email_column",
      "Recipient-email CSV columns are unavailable while outbound email is deferred.",
    );
  }

  const headers = rawHeaders.map(canonicalizeTargetCsvHeader);
  if (headers.some((header) => !isSupportedTargetCsvHeader(header))) {
    throw new CsvIntakeError(
      "unsupported_csv_column",
      `Target CSV supports only: ${TARGET_CSV_COLUMNS.join(", ")}.`,
    );
  }
  if (new Set(headers).size !== headers.length) {
    throw new CsvIntakeError(
      "malformed_csv",
      "CSV headers must map to unique columns.",
    );
  }

  return rows.slice(1).map<Record<string, string>>((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new CsvIntakeError(
        "malformed_csv",
        `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    }
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index];
      return row;
    }, {});
  });
}

function targetHostnameKey(target: CompanyRow): string {
  return new URL(target.websiteUrl).hostname.toLowerCase().replace(/^www\./u, "");
}

/** Parse the simple run form through the same strict contract as the intake API. */
export function parseTargetsFromIntakeDraft(
  websitesText: string,
  contactsCsvText?: string,
): CompanyRow[] {
  const targets = dedupeTargets(parseTargetsFromMultilineInput(websitesText));
  if (!contactsCsvText?.trim()) return targets;

  const metadataByHostname = new Map<string, CompanyRow>();
  for (const metadata of parseTargetsFromCsvRows(parseCsvText(contactsCsvText))) {
    const key = targetHostnameKey(metadata);
    if (metadataByHostname.has(key)) {
      throw new CsvIntakeError(
        "malformed_csv",
        "CSV contains more than one row for the same target hostname.",
      );
    }
    metadataByHostname.set(key, metadata);
  }

  return targets.map((target) => {
    const metadata = metadataByHostname.get(targetHostnameKey(target));
    return metadata ? { ...metadata, websiteUrl: target.websiteUrl } : target;
  });
}

export function dedupeTargets(targets: CompanyRow[]) {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const normalized = targetHostnameKey(target);
    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}
